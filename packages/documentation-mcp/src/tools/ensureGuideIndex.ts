import * as z from "zod";
import { ConfluenceClient, extractPageIdFromUrl, loadConfluenceConfig, resolveConfluenceAuth } from "@davindermahal/confluence-client";
import { loadLocalConfluenceConfig, writeConfigValue } from "../config.js";
import { serializeIndexTable } from "../confluence/index-table.js";

function notConfiguredError() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error:
              "not-configured: set JIRA_SITE_URL/JIRA_INTAKE_EMAIL/JIRA_INTAKE_API_TOKEN (or the CONFLUENCE_* " +
              "overrides) in ~/.config/ai-intake-mcp/.env",
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

export const ensureGuideIndexTool = {
  name: "ensure_guide_index",
  description:
    "Gets the shared Confluence guide index page into a good state: if CONFLUENCE_GUIDE_INDEX_URL " +
    "is already set and resolves to a real page, reports conformant. If unset, creates a new page " +
    "(empty Title/Description/Link/Tags table) in CONFLUENCE_SPACE_KEY and writes the resulting " +
    "URL back into ~/.config/ai-intake-mcp/.env, so ai-intake-mcp picks it up automatically. " +
    "Requires CONFLUENCE_SPACE_KEY to be set to create a page for the first time. Safe to call " +
    "anytime, including repeatedly.",
  inputSchema: z.object({
    title: z.string().optional().describe("Title for a newly created index page. Defaults to 'AI Agent Guides'."),
  }),
  handler: async ({ title }: { title?: string }) => {
    const auth = resolveConfluenceAuth(loadConfluenceConfig());
    if (!auth) return notConfiguredError();
    const localConfig = loadLocalConfluenceConfig();

    const client = new ConfluenceClient(auth);

    if (localConfig.confluenceGuideIndexUrl) {
      const pageId = extractPageIdFromUrl(localConfig.confluenceGuideIndexUrl);
      const page = pageId ? await client.getPageById(pageId) : null;
      if (page) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status: "conformant", url: localConfig.confluenceGuideIndexUrl }, null, 2) }],
        };
      }
    }

    if (!localConfig.confluenceSpaceKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "not-configured: CONFLUENCE_SPACE_KEY must be set to create the index page" }, null, 2),
          },
        ],
        isError: true,
      };
    }

    const page = await client.createPage({
      spaceKey: localConfig.confluenceSpaceKey,
      title: title ?? "AI Agent Guides",
      storageBody: serializeIndexTable([]),
    });

    writeConfigValue("CONFLUENCE_GUIDE_INDEX_URL", page.url);

    return { content: [{ type: "text" as const, text: JSON.stringify({ status: "initialized", url: page.url }, null, 2) }] };
  },
};
