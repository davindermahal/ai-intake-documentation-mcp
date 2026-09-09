import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeIndexTable, parseIndexTable } from "../src/confluence/index-table.js";
import { textOf } from "./helpers.js";

const EMPTY_INDEX_STORAGE = serializeIndexTable([]);
const ONE_ROW_INDEX_STORAGE = serializeIndexTable([
  { title: "Existing Guide", description: "d", link: "https://x/pages/50", tags: [], lastModified: "2026-09-01" },
]);

const updateCalls: Array<{ pageId: string; storageBody: string }> = [];
const attachmentCalls: Array<{ pageId: string; filename: string; content: string }> = [];
let attachmentShouldFail = false;

vi.mock("@davindermahal/confluence-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@davindermahal/confluence-client")>();
  return {
    ...actual,
    ConfluenceClient: class {
      async getPageById(pageId: string) {
        if (pageId === "1") return { id: "1", title: "AI Agent Guides", version: 2, url: "https://x/pages/1", storageBody: ONE_ROW_INDEX_STORAGE };
        if (pageId === "2") return { id: "2", title: "AI Agent Guides", version: 2, url: "https://x/pages/2", storageBody: EMPTY_INDEX_STORAGE };
        if (pageId === "50") return { id: "50", title: "Existing Guide", version: 3, url: "https://x/pages/50", storageBody: "" };
        return null;
      }
      async getPageByTitle(params: { title: string }) {
        if (params.title === "Existing Guide") return { id: "50", title: "Existing Guide", version: 3, url: "https://x/pages/50", storageBody: "" };
        return null;
      }
      async createPage(params: { title: string }) {
        return { id: "60", title: params.title, version: 1, url: "https://x/pages/60", storageBody: "" };
      }
      async updatePage(params: { pageId: string; storageBody: string }) {
        updateCalls.push({ pageId: params.pageId, storageBody: params.storageBody });
        return { id: params.pageId, title: "updated", version: 99, url: `https://x/pages/${params.pageId}`, storageBody: params.storageBody };
      }
      async uploadAttachment(params: { pageId: string; filename: string; content: string }) {
        attachmentCalls.push({ pageId: params.pageId, filename: params.filename, content: params.content });
        if (attachmentShouldFail) throw new Error("simulated attachment upload failure");
        return { id: "att-1", title: params.filename };
      }
    },
  };
});

const { syncGuideTool } = await import("../src/tools/syncGuide.js");

let originalHome: string | undefined;
let home: string;
let envPath: string;

beforeEach(() => {
  updateCalls.length = 0;
  attachmentCalls.length = 0;
  attachmentShouldFail = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "documentation-mcp-home-test-"));
  process.env.HOME = home;
  envPath = join(home, ".config", "ai-intake-mcp", ".env");
  mkdirSync(dirname(envPath), { recursive: true });
});

afterEach(() => {
  vi.useRealTimers();
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

function writeFullConfig(indexPageId: string) {
  writeFileSync(
    envPath,
    `JIRA_SITE_URL=https://x\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_SPACE_KEY=ENG\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/${indexPageId}\n`
  );
}

describe("sync_guide", () => {
  it("errors when CONFLUENCE_GUIDE_INDEX_URL is unset", async () => {
    const result = await syncGuideTool.handler({ title: "T", description: "d", content: "c", tags: [] });
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/CONFLUENCE_GUIDE_INDEX_URL/);
  });

  it("errors when CONFLUENCE_SPACE_KEY is unset", async () => {
    writeFileSync(envPath, "JIRA_SITE_URL=https://x\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/2\n");
    const result = await syncGuideTool.handler({ title: "T", description: "d", content: "c", tags: [] });
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/CONFLUENCE_SPACE_KEY/);
  });

  it("creates a new page and appends a new index row when no title match exists", async () => {
    writeFullConfig("2");
    const result = await syncGuideTool.handler({ title: "New Guide", description: "d", content: "# Heading", tags: ["a"] });
    expect(textOf(result)).toEqual({ status: "created", url: "https://x/pages/60", attached: true });
    const indexUpdate = updateCalls.find((c) => c.pageId === "2");
    expect(indexUpdate).toBeDefined();
    expect(parseIndexTable(indexUpdate!.storageBody)).toEqual([
      { title: "New Guide", description: "d", link: "https://x/pages/60", tags: ["a"], lastModified: "2026-09-07" },
    ]);
  });

  it("updates an existing page (matched by title) and replaces its index row with today's date", async () => {
    writeFullConfig("1");
    const result = await syncGuideTool.handler({ title: "Existing Guide", description: "updated desc", content: "c", tags: [] });
    expect(textOf(result)).toEqual({ status: "updated", url: "https://x/pages/50", attached: true });
    const guideUpdate = updateCalls.find((c) => c.pageId === "50");
    expect(guideUpdate).toBeDefined();
    const indexUpdate = updateCalls.find((c) => c.pageId === "1");
    expect(parseIndexTable(indexUpdate!.storageBody)).toEqual([
      { title: "Existing Guide", description: "updated desc", link: "https://x/pages/50", tags: [], lastModified: "2026-09-07" },
    ]);
  });

  it("updates by explicit page_id even when the title doesn't match an existing page", async () => {
    writeFullConfig("1");
    const result = await syncGuideTool.handler({ title: "Renamed Guide", description: "d", content: "c", tags: [], page_id: "50" });
    expect(textOf(result)).toEqual({ status: "updated", url: "https://x/pages/50", attached: true });
  });

  it("errors rather than silently creating a duplicate when page_id doesn't resolve", async () => {
    writeFullConfig("1");
    const result = await syncGuideTool.handler({ title: "T", description: "d", content: "c", tags: [], page_id: "999" });
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/999/);
    expect(updateCalls).toHaveLength(0);
    expect(attachmentCalls).toHaveLength(0);
  });

  describe("source.md attachment", () => {
    it("uploads the exact markdown content as source.md on the newly created page", async () => {
      writeFullConfig("2");
      await syncGuideTool.handler({ title: "New Guide", description: "d", content: "# Heading\n\nBody text.", tags: ["a"] });
      expect(attachmentCalls).toEqual([{ pageId: "60", filename: "source.md", content: "# Heading\n\nBody text." }]);
    });

    it("uploads to the existing (not the index) page's id on update", async () => {
      writeFullConfig("1");
      await syncGuideTool.handler({ title: "Existing Guide", description: "d", content: "updated content", tags: [] });
      expect(attachmentCalls).toEqual([{ pageId: "50", filename: "source.md", content: "updated content" }]);
    });

    it("still reports success and still updates the index when the attachment upload fails", async () => {
      attachmentShouldFail = true;
      writeFullConfig("2");
      const result = await syncGuideTool.handler({ title: "New Guide", description: "d", content: "c", tags: [] });
      expect(result.isError).toBeFalsy();
      const parsed = textOf(result) as { status: string; url: string; attached: boolean; attachmentError: string };
      expect(parsed.status).toBe("created");
      expect(parsed.attached).toBe(false);
      expect(parsed.attachmentError).toMatch(/simulated attachment upload failure/);
      const indexUpdate = updateCalls.find((c) => c.pageId === "2");
      expect(indexUpdate).toBeDefined();
      expect(parseIndexTable(indexUpdate!.storageBody)).toEqual([
        { title: "New Guide", description: "d", link: "https://x/pages/60", tags: [], lastModified: "2026-09-07" },
      ]);
    });
  });
});
