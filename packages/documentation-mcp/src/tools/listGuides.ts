import * as z from "zod";
import { loadConfluenceConfig, resolveConfluenceAuth } from "../config.js";
import { ConfluenceClient, extractPageId } from "../confluence/client.js";
import { parseIndexTable } from "../confluence/index-table.js";

export const listGuidesTool = {
  name: "list_guides",
  description:
    "Fetches and parses the shared Confluence guide index (CONFLUENCE_GUIDE_INDEX_URL) into " +
    "{title, description, link, tags}[], for checking whether a guide already exists before " +
    "authoring a new one. Read-only.",
  inputSchema: z.object({}),
  handler: async () => {
    const config = loadConfluenceConfig();
    if (!config.confluenceGuideIndexUrl) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "not-configured: CONFLUENCE_GUIDE_INDEX_URL is not set. Run ensure_guide_index first." }, null, 2),
          },
        ],
        isError: true,
      };
    }

    const auth = resolveConfluenceAuth(config);
    if (!auth) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "not-configured: set JIRA_SITE_URL/JIRA_EMAIL/JIRA_API_TOKEN (or the CONFLUENCE_* overrides) in ~/.config/ai-intake-mcp/.env" },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const client = new ConfluenceClient(auth);
    const pageId = extractPageId(config.confluenceGuideIndexUrl);
    const page = pageId ? await client.getPageById(pageId) : null;
    if (!page) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `index page not found at ${config.confluenceGuideIndexUrl}` }, null, 2) }],
        isError: true,
      };
    }

    return { content: [{ type: "text" as const, text: JSON.stringify({ guides: parseIndexTable(page.storageBody) }, null, 2) }] };
  },
};
