#!/usr/bin/env node
/**
 * Real-Confluence verification checkpoint for the extract-a-shared-confluence-client-package plan
 * (Verification #2): exercises this server's actual ensure_guide_index / sync_guide /
 * fetch_confluence_pages tool handlers -- not a reimplementation -- against a real Confluence Cloud
 * space, confirming the migration onto @davindermahal/confluence-client didn't regress the
 * write path and that the new fetch_confluence_pages tool reads real pages correctly.
 *
 * Creates one throwaway guide page (clearly titled, tagged "qa-smoke-test") as a child of the real
 * shared guide index, adds/updates its index row, fetches it back, then removes both the page and
 * its index row -- self-cleaning, since (unlike a throwaway Jira ticket) a stray row here would be
 * visible to real ai-intake-mcp planning sessions via list_guides/fetch_guide.
 *
 * Never prints the API token; only non-secret results.
 *
 * Usage: npm run smoke:confluence
 */
import { ConfluenceClient, extractPageIdFromUrl, loadConfluenceConfig, resolveConfluenceAuth } from "@davindermahal/confluence-client";
import { loadLocalConfluenceConfig } from "../src/config.js";
import { parseIndexTable, serializeIndexTable } from "../src/confluence/index-table.js";
import { ensureGuideIndexTool } from "../src/tools/ensureGuideIndex.js";
import { syncGuideTool } from "../src/tools/syncGuide.js";
import { fetchConfluencePagesTool } from "../src/tools/fetchConfluencePages.js";

const TEST_TITLE = "QA smoke test — confluence-client migration (auto-cleanup)";

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function parseToolJson(result: { content: Array<{ type: string; text: string }> }): any {
  return JSON.parse(result.content[0].text);
}

async function main(): Promise<void> {
  section("1. ensure_guide_index (idempotent check-or-create)");
  const ensureResult = parseToolJson(await ensureGuideIndexTool.handler({}));
  console.log(JSON.stringify(ensureResult, null, 2));
  if (ensureResult.error) {
    console.error("ensure_guide_index failed -- aborting before any writes.");
    process.exit(1);
  }

  section("2. sync_guide (creates throwaway guide page + index row)");
  const syncResult = parseToolJson(
    await syncGuideTool.handler({
      title: TEST_TITLE,
      description: "Throwaway page created by scripts/confluence-smoke-check.ts; deleted at the end of this run.",
      content: "# QA smoke test\n\nThis page verifies sync_guide through the new @davindermahal/confluence-client package.",
      tags: ["qa-smoke-test"],
    }),
  );
  console.log(JSON.stringify(syncResult, null, 2));
  if (syncResult.error) {
    console.error("sync_guide failed -- aborting before cleanup (nothing was created).");
    process.exit(1);
  }
  const guideUrl: string = syncResult.url;

  section("3. fetch_confluence_pages (reads the just-created page back)");
  const fetchResult = parseToolJson(await fetchConfluencePagesTool.handler({ urls: [guideUrl] }));
  console.log(JSON.stringify(fetchResult, null, 2));
  const fetchedEntry = fetchResult.pages?.[0];
  const contentOk = typeof fetchedEntry?.content === "string" && fetchedEntry.content.includes("QA smoke test");
  const lastModifiedOk = typeof fetchedEntry?.lastModified === "string" && fetchedEntry.lastModified.length > 0;
  console.log(`content includes expected text: ${contentOk}`);
  console.log(`lastModified present: ${lastModifiedOk}`);

  section("4. Cleanup: remove index row + trash the throwaway page");
  const auth = resolveConfluenceAuth(loadConfluenceConfig());
  const localConfig = loadLocalConfluenceConfig();
  if (!auth || !localConfig.confluenceGuideIndexUrl) {
    throw new Error("Lost auth/config between steps -- cannot clean up automatically. Manual cleanup required.");
  }
  const client = new ConfluenceClient(auth);
  const indexPageId = extractPageIdFromUrl(localConfig.confluenceGuideIndexUrl)!;
  const indexPage = (await client.getPageById(indexPageId))!;
  const rows = parseIndexTable(indexPage.storageBody).filter((row) => row.title !== TEST_TITLE);
  await client.updatePage({
    pageId: indexPage.id,
    title: indexPage.title,
    storageBody: serializeIndexTable(rows),
    version: indexPage.version,
  });
  console.log("Index row removed.");

  const guidePageId = extractPageIdFromUrl(guideUrl);
  if (guidePageId) {
    const authHeader = "Basic " + Buffer.from(`${auth.email}:${auth.apiToken}`).toString("base64");
    const siteUrl = /^https?:\/\//.test(auth.siteUrl) ? auth.siteUrl : `https://${auth.siteUrl}`;
    const res = await fetch(`${siteUrl.replace(/\/+$/, "")}/wiki/rest/api/content/${guidePageId}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    console.log(`Page delete (moves to trash, recoverable): HTTP ${res.status}`);
  }

  section("Result");
  const ok = contentOk && lastModifiedOk && (syncResult.status === "created" || syncResult.status === "updated");
  console.log(ok ? "GO -- sync_guide, index update, and fetch_confluence_pages all confirmed against real Confluence." : "Check output above for failures.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
