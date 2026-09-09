import * as z from "zod";
import { ConfluenceClient, extractPageIdFromUrl, loadConfluenceConfig, resolveConfluenceAuth } from "@davindermahal/confluence-client";
import { loadLocalConfluenceConfig } from "../config.js";
import { parseIndexTable } from "../confluence/index-table.js";

export const listGuidesTool = {
  name: "list_guides",
  description:
    "Fetches and parses the shared Confluence guide index (CONFLUENCE_GUIDE_INDEX_URL) into " +
    "{title, description, link, tags, lastModified}[], for checking whether a guide already exists " +
    "before authoring a new one. lastModified is an ISO date (YYYY-MM-DD) stamped by sync_guide's " +
    "last publish of that row, or \"\" if the row predates this column. Read-only.",
  inputSchema: z.object({}),
  handler: async () => {
    const localConfig = loadLocalConfluenceConfig();
    if (!localConfig.confluenceGuideIndexUrl) {
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

    const auth = resolveConfluenceAuth(loadConfluenceConfig());
    if (!auth) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "not-configured: set JIRA_SITE_URL/JIRA_INTAKE_EMAIL/JIRA_INTAKE_API_TOKEN (or the CONFLUENCE_* overrides) in ~/.config/ai-intake-mcp/.env" },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const client = new ConfluenceClient(auth);
    const pageId = extractPageIdFromUrl(localConfig.confluenceGuideIndexUrl);
    const page = pageId ? await client.getPageById(pageId) : null;
    if (!page) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `index page not found at ${localConfig.confluenceGuideIndexUrl}` }, null, 2) }],
        isError: true,
      };
    }

    return { content: [{ type: "text" as const, text: JSON.stringify({ guides: parseIndexTable(page.storageBody) }, null, 2) }] };
  },
};
