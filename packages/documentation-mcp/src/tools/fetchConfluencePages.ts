import * as z from "zod";
import {
  ConfluenceClient,
  extractPageIdFromUrl,
  fetchPageByUrl,
  loadConfluenceConfig,
  resolveConfluenceAuth,
  storageToPlainText,
  type ResolvedConfluenceAuth,
} from "@davindermahal/confluence-client";

export interface FetchConfluencePagesResultEntry {
  url: string;
  title?: string;
  content?: string;
  lastModified?: string;
  error?: string;
}

function configuredSiteHost(auth: ResolvedConfluenceAuth): string {
  const normalized = /^https?:\/\//.test(auth.siteUrl) ? auth.siteUrl : `https://${auth.siteUrl}`;
  return new URL(normalized).host;
}

/**
 * A URL only gets fetched if it's on the configured Confluence site's own host *and*
 * `extractPageIdFromUrl` can pull a page ID out of it (matches `confluence-references-in-planning.md`
 * Key decision #5 in the companion `ai-intake-mcp` plan) -- hostname-only would waste calls on
 * non-page URLs (space overviews); pattern-only would let a same-shaped URL on an unrelated system
 * cause a wrong-content query against our own tenant, since `fetchPageByUrl` never looks at the
 * URL's own host, only the numeric ID it extracts.
 */
function isFetchableConfluenceUrl(url: string, siteHost: string): boolean {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return false;
  }
  return host === siteHost && extractPageIdFromUrl(url) !== undefined;
}

export const fetchConfluencePagesTool = {
  name: "fetch_confluence_pages",
  description:
    "Fetches specific Confluence pages by URL -- operator-named links, not a catalog. " +
    "Partial-failure tolerant: returns one entry per URL that resolves to a page on the configured " +
    "site (title, content, lastModified, error?); a URL that isn't a fetchable Confluence page on " +
    "that site (wrong host, or no extractable page ID) is silently skipped, not an error.",
  inputSchema: z.object({
    urls: z.array(z.string()).describe("Candidate Confluence page URLs; non-matching ones are silently skipped."),
  }),
  handler: async ({ urls }: { urls: string[] }) => {
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
    const siteHost = configuredSiteHost(auth);
    const pages: FetchConfluencePagesResultEntry[] = [];

    for (const url of urls) {
      if (!isFetchableConfluenceUrl(url, siteHost)) continue;
      try {
        const page = await fetchPageByUrl(client, url);
        pages.push({ url, title: page.title, content: storageToPlainText(page.storageBody), lastModified: page.lastModified });
      } catch (err) {
        pages.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { content: [{ type: "text" as const, text: JSON.stringify({ pages }, null, 2) }] };
  },
};
