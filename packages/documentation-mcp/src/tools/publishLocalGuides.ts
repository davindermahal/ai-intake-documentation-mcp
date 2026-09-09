import * as z from "zod";
import { existsSync } from "node:fs";
import {
  ConfluenceClient,
  extractPageIdFromUrl,
  loadConfluenceConfig,
  markdownToStorage,
  resolveConfluenceAuth,
} from "@davindermahal/confluence-client";
import { loadLocalConfluenceConfig } from "../config.js";
import { parseIndexTable, serializeIndexTable, upsertIndexRow, type GuideIndexRow } from "../confluence/index-table.js";
import { listLocalGuideFiles } from "../confluence/local-guides.js";

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

function normalize(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

export const publishLocalGuidesTool = {
  name: "publish_local_guides",
  description:
    "Imports guide(s) from the local guides directory (GUIDES_LOCAL_DIR) onto the shared Confluence " +
    "index: for each selected guide not already on the index (matched by exact title, the same check " +
    "list_local_guides reports as existsOnIndex), creates its Confluence page as a child of the index " +
    "page, adds its index row, and best-effort attaches the source markdown -- the same page-creation " +
    "path sync_guide uses when no matching page exists. A guide that's already on the index is " +
    "skipped, never overwritten; use sync_guide directly to update one. Tags are always empty (local " +
    "guide files don't carry them) -- add tags in Confluence afterwards if wanted. Call " +
    "list_local_guides first to see what's available and what's new. Requires ensure_guide_index to " +
    "have set CONFLUENCE_GUIDE_INDEX_URL first.",
  inputSchema: z.object({
    filenames: z
      .array(z.string())
      .optional()
      .describe(
        "Guide filenames to publish, matching list_local_guides' filename field (with or without the " +
          '.md extension). Omit, or pass ["all"], to publish every local guide not already on the index.'
      ),
    guides_dir: z.string().optional().describe("Overrides GUIDES_LOCAL_DIR for this call; not persisted (use list_local_guides for that)."),
  }),
  handler: async ({ filenames, guides_dir }: { filenames?: string[]; guides_dir?: string }) => {
    const localConfig = loadLocalConfluenceConfig();
    const dir = guides_dir ?? localConfig.guidesLocalDir;
    if (!dir) {
      return errorResult("not-configured: no guides directory set. Pass guides_dir, or set GUIDES_LOCAL_DIR in ~/.config/ai-intake-mcp/.env.");
    }
    if (!existsSync(dir)) {
      return errorResult(`guides directory not found: ${dir}`);
    }
    if (!localConfig.confluenceGuideIndexUrl) {
      return errorResult("not-configured: CONFLUENCE_GUIDE_INDEX_URL is not set. Run ensure_guide_index first.");
    }
    if (!localConfig.confluenceSpaceKey) {
      return errorResult("not-configured: CONFLUENCE_SPACE_KEY is not set.");
    }
    const auth = resolveConfluenceAuth(loadConfluenceConfig());
    if (!auth) {
      return errorResult(
        "not-configured: set JIRA_SITE_URL/JIRA_INTAKE_EMAIL/JIRA_INTAKE_API_TOKEN (or the CONFLUENCE_* overrides) in ~/.config/ai-intake-mcp/.env"
      );
    }

    const client = new ConfluenceClient(auth);
    const indexPageId = extractPageIdFromUrl(localConfig.confluenceGuideIndexUrl);
    const indexPage = indexPageId ? await client.getPageById(indexPageId) : null;
    if (!indexPage) {
      return errorResult(`index page not found at ${localConfig.confluenceGuideIndexUrl}`);
    }

    const localGuides = listLocalGuideFiles(dir);

    const wantsAll = !filenames || filenames.length === 0 || filenames.some((f) => f.toLowerCase() === "all");
    let selected = localGuides;
    const notFound: string[] = [];
    if (!wantsAll) {
      const requested = new Set(filenames!.map(normalize));
      selected = localGuides.filter((g) => requested.has(normalize(g.filename)));
      const foundNormalized = new Set(selected.map((g) => normalize(g.filename)));
      for (const f of requested) if (!foundNormalized.has(f)) notFound.push(f);
    }

    // Accumulated in memory and written once at the end (rather than once per guide, as sync_guide
    // does for a single guide) -- repeated updatePage calls against the same indexPage.version would
    // 409 on the second write, since Confluence's update is optimistic-locked on the version passed in.
    let rows = parseIndexTable(indexPage.storageBody);
    const existingTitles = new Set(rows.map((r) => r.title));
    const lastModified = new Date().toISOString().slice(0, 10);

    const published: Array<{ filename: string; title: string; url: string; attached: boolean; attachmentError?: string }> = [];
    const skipped: Array<{ filename: string; title: string; reason: string }> = [];

    for (const guide of selected) {
      if (existingTitles.has(guide.title)) {
        skipped.push({ filename: guide.filename, title: guide.title, reason: "already on the index" });
        continue;
      }

      const storageBody = markdownToStorage(guide.content);
      const page = await client.createPage({ spaceKey: localConfig.confluenceSpaceKey, title: guide.title, storageBody, parentId: indexPage.id });

      let attached = true;
      let attachmentError: string | undefined;
      try {
        await client.uploadAttachment({ pageId: page.id, filename: "source.md", content: guide.content, mimeType: "text/markdown" });
      } catch (err) {
        attached = false;
        attachmentError = err instanceof Error ? err.message : String(err);
      }

      const row: GuideIndexRow = { title: guide.title, description: guide.description, link: page.url, tags: [], lastModified };
      rows = upsertIndexRow(rows, row);
      existingTitles.add(guide.title);

      const entry: (typeof published)[number] = { filename: guide.filename, title: guide.title, url: page.url, attached };
      if (attachmentError) entry.attachmentError = attachmentError;
      published.push(entry);
    }

    if (published.length > 0) {
      await client.updatePage({ pageId: indexPage.id, title: indexPage.title, storageBody: serializeIndexTable(rows), version: indexPage.version });
    }

    return { content: [{ type: "text" as const, text: JSON.stringify({ published, skipped, notFound }, null, 2) }] };
  },
};
