import * as z from "zod";
import { existsSync } from "node:fs";
import { ConfluenceClient, extractPageIdFromUrl, loadConfluenceConfig, resolveConfluenceAuth } from "@davindermahal/confluence-client";
import { loadLocalConfluenceConfig, writeConfigValue } from "../config.js";
import { parseIndexTable } from "../confluence/index-table.js";
import { listLocalGuideFiles } from "../confluence/local-guides.js";

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

export const listLocalGuidesTool = {
  name: "list_local_guides",
  description:
    "Lists guide markdown files found in the local guides directory (GUIDES_LOCAL_DIR), each with a " +
    "title/description parsed from the file's leading `# Heading` and the paragraph right after it, " +
    "plus existsOnIndex: whether a guide of that exact title is already on the shared Confluence " +
    "index -- so you can see, before calling publish_local_guides, which local guides are new. Pass " +
    "guides_dir once to set (and persist to GUIDES_LOCAL_DIR) the directory; omit it on later calls " +
    "to reuse the saved value. Read-only: fetches the index (like list_guides) but writes nothing to " +
    "Confluence.",
  inputSchema: z.object({
    guides_dir: z.string().optional().describe("Absolute path to a directory of guide .md files. Persisted to GUIDES_LOCAL_DIR when given."),
  }),
  handler: async ({ guides_dir }: { guides_dir?: string }) => {
    const localConfig = loadLocalConfluenceConfig();
    const dir = guides_dir ?? localConfig.guidesLocalDir;
    if (!dir) {
      return errorResult("not-configured: no guides directory set. Pass guides_dir, or set GUIDES_LOCAL_DIR in ~/.config/ai-intake-mcp/.env.");
    }
    if (!existsSync(dir)) {
      return errorResult(`guides directory not found: ${dir}`);
    }
    if (guides_dir && guides_dir !== localConfig.guidesLocalDir) {
      writeConfigValue("GUIDES_LOCAL_DIR", guides_dir);
    }

    const localGuides = listLocalGuideFiles(dir).map(({ filename, title, description }) => ({ filename, title, description }));

    if (!localConfig.confluenceGuideIndexUrl) {
      return errorResult("not-configured: CONFLUENCE_GUIDE_INDEX_URL is not set. Run ensure_guide_index first.");
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
    const existingTitles = new Set(parseIndexTable(indexPage.storageBody).map((r) => r.title));

    const guides = localGuides.map((g) => ({ ...g, existsOnIndex: existingTitles.has(g.title) }));
    return { content: [{ type: "text" as const, text: JSON.stringify({ guides }, null, 2) }] };
  },
};
