import * as z from "zod";
import { loadConfluenceConfig, resolveConfluenceAuth } from "../config.js";
import { ConfluenceClient, extractPageId } from "../confluence/client.js";
import { markdownToStorage } from "../confluence/markdown-to-storage.js";
import { parseIndexTable, serializeIndexTable, upsertIndexRow } from "../confluence/index-table.js";

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

export const syncGuideTool = {
  name: "sync_guide",
  description:
    "Publishes a guide to Confluence: creates or updates its leaf page (as a child of the guide " +
    "index page) and adds/updates its row on the shared index. Matches an existing page by " +
    "page_id if given, else by exact title. Requires ensure_guide_index to have set " +
    "CONFLUENCE_GUIDE_INDEX_URL first.",
  inputSchema: z.object({
    title: z.string(),
    description: z.string(),
    content: z.string().describe("Guide body as markdown; converted to Confluence storage format at publish time."),
    tags: z.array(z.string()).default([]),
    page_id: z.string().optional().describe("Update this specific page instead of matching by title."),
  }),
  handler: async ({
    title,
    description,
    content,
    tags,
    page_id,
  }: {
    title: string;
    description: string;
    content: string;
    tags: string[];
    page_id?: string;
  }) => {
    const config = loadConfluenceConfig();
    if (!config.confluenceGuideIndexUrl) {
      return errorResult("not-configured: CONFLUENCE_GUIDE_INDEX_URL is not set. Run ensure_guide_index first.");
    }
    if (!config.confluenceSpaceKey) {
      return errorResult("not-configured: CONFLUENCE_SPACE_KEY is not set.");
    }
    const auth = resolveConfluenceAuth(config);
    if (!auth) {
      return errorResult(
        "not-configured: set JIRA_SITE_URL/JIRA_EMAIL/JIRA_API_TOKEN (or the CONFLUENCE_* overrides) in ~/.config/ai-intake-mcp/.env"
      );
    }

    const client = new ConfluenceClient(auth);

    const indexPageId = extractPageId(config.confluenceGuideIndexUrl);
    const indexPage = indexPageId ? await client.getPageById(indexPageId) : null;
    if (!indexPage) {
      return errorResult(`index page not found at ${config.confluenceGuideIndexUrl}`);
    }

    const storageBody = markdownToStorage(content);

    const existing = page_id
      ? await client.getPageById(page_id)
      : await client.getPageByTitle({ spaceKey: config.confluenceSpaceKey, title });

    const guidePage = existing
      ? await client.updatePage({ pageId: existing.id, title, storageBody, version: existing.version })
      : await client.createPage({ spaceKey: config.confluenceSpaceKey, title, storageBody, parentId: indexPage.id });
    const status = existing ? "updated" : "created";

    const rows = parseIndexTable(indexPage.storageBody);
    const updatedRows = upsertIndexRow(rows, { title, description, link: guidePage.url, tags });
    await client.updatePage({
      pageId: indexPage.id,
      title: indexPage.title,
      storageBody: serializeIndexTable(updatedRows),
      version: indexPage.version,
    });

    return { content: [{ type: "text" as const, text: JSON.stringify({ status, url: guidePage.url }, null, 2) }] };
  },
};
