import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseIndexTable, serializeIndexTable } from "../src/confluence/index-table.js";
import { textOf } from "./helpers.js";

const INDEX_STORAGE = serializeIndexTable([
  { title: "Already Published", description: "d", link: "https://x/pages/1", tags: [], lastModified: "2026-09-01" },
]);

const createCalls: Array<{ title: string; parentId?: string }> = [];
const updateCalls: Array<{ pageId: string; storageBody: string }> = [];
const attachmentCalls: Array<{ pageId: string; filename: string }> = [];
let nextPageId = 100;

vi.mock("@davindermahal/confluence-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@davindermahal/confluence-client")>();
  return {
    ...actual,
    ConfluenceClient: class {
      async getPageById(pageId: string) {
        if (pageId === "1") return { id: "1", title: "AI Agent Guides", version: 4, url: "https://x/pages/1", storageBody: INDEX_STORAGE };
        return null;
      }
      async createPage(params: { title: string; parentId?: string }) {
        createCalls.push({ title: params.title, parentId: params.parentId });
        const id = String(nextPageId++);
        return { id, title: params.title, version: 1, url: `https://x/pages/${id}`, storageBody: "" };
      }
      async updatePage(params: { pageId: string; storageBody: string }) {
        updateCalls.push({ pageId: params.pageId, storageBody: params.storageBody });
        return { id: params.pageId, title: "updated", version: 99, url: `https://x/pages/${params.pageId}`, storageBody: params.storageBody };
      }
      async uploadAttachment(params: { pageId: string; filename: string }) {
        attachmentCalls.push({ pageId: params.pageId, filename: params.filename });
        return { id: "att-1", title: params.filename };
      }
    },
  };
});

const { publishLocalGuidesTool } = await import("../src/tools/publishLocalGuides.js");

let originalHome: string | undefined;
let home: string;
let envPath: string;
let guidesDir: string;

beforeEach(() => {
  createCalls.length = 0;
  updateCalls.length = 0;
  attachmentCalls.length = 0;
  nextPageId = 100;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "documentation-mcp-home-test-"));
  process.env.HOME = home;
  envPath = join(home, ".config", "ai-intake-mcp", ".env");
  mkdirSync(dirname(envPath), { recursive: true });
  guidesDir = mkdtempSync(join(tmpdir(), "documentation-mcp-guides-dir-test-"));
});

afterEach(() => {
  vi.useRealTimers();
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(guidesDir, { recursive: true, force: true });
});

function writeFullConfig() {
  writeFileSync(
    envPath,
    `JIRA_SITE_URL=https://x\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_SPACE_KEY=ENG\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/1\nGUIDES_LOCAL_DIR=${guidesDir}\n`
  );
}

describe("publish_local_guides", () => {
  it("errors when no guides directory is configured or passed", async () => {
    writeFileSync(envPath, "CONFLUENCE_SPACE_KEY=ENG\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/1\n");
    const result = await publishLocalGuidesTool.handler({});
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/guides directory/);
  });

  it("publishes every local guide not already on the index when filenames is omitted", async () => {
    writeFullConfig();
    writeFileSync(join(guidesDir, "new-guide.md"), "# New Guide\n\nA new guide.\n");
    writeFileSync(join(guidesDir, "already.md"), "# Already Published\n\nDesc.\n");

    const result = await publishLocalGuidesTool.handler({});

    expect(textOf(result)).toEqual({
      published: [{ filename: "new-guide.md", title: "New Guide", url: "https://x/pages/100", attached: true }],
      skipped: [{ filename: "already.md", title: "Already Published", reason: "already on the index" }],
      notFound: [],
    });
    expect(createCalls).toEqual([{ title: "New Guide", parentId: "1" }]);
    expect(attachmentCalls).toEqual([{ pageId: "100", filename: "source.md" }]);

    const indexUpdate = updateCalls.find((c) => c.pageId === "1");
    expect(indexUpdate).toBeDefined();
    expect(parseIndexTable(indexUpdate!.storageBody)).toEqual([
      { title: "Already Published", description: "d", link: "https://x/pages/1", tags: [], lastModified: "2026-09-01" },
      { title: "New Guide", description: "A new guide.", link: "https://x/pages/100", tags: [], lastModified: "2026-09-08" },
    ]);
  });

  it('treats ["all"] the same as omitting filenames', async () => {
    writeFullConfig();
    writeFileSync(join(guidesDir, "new-guide.md"), "# New Guide\n\nA new guide.\n");
    const result = await publishLocalGuidesTool.handler({ filenames: ["all"] });
    expect((textOf(result) as { published: unknown[] }).published).toHaveLength(1);
  });

  it("publishes only the requested filenames, matching with or without .md", async () => {
    writeFullConfig();
    writeFileSync(join(guidesDir, "one.md"), "# One\n\nDesc one.\n");
    writeFileSync(join(guidesDir, "two.md"), "# Two\n\nDesc two.\n");

    const result = await publishLocalGuidesTool.handler({ filenames: ["one"] });

    expect(textOf(result)).toEqual({
      published: [{ filename: "one.md", title: "One", url: "https://x/pages/100", attached: true }],
      skipped: [],
      notFound: [],
    });
    expect(createCalls).toEqual([{ title: "One", parentId: "1" }]);
  });

  it("reports requested filenames that don't match any local guide as notFound", async () => {
    writeFullConfig();
    writeFileSync(join(guidesDir, "one.md"), "# One\n\nDesc.\n");
    const result = await publishLocalGuidesTool.handler({ filenames: ["missing-guide"] });
    expect(textOf(result)).toEqual({ published: [], skipped: [], notFound: ["missing-guide"] });
    expect(createCalls).toEqual([]);
  });

  it("writes the index exactly once even when publishing multiple new guides", async () => {
    writeFullConfig();
    writeFileSync(join(guidesDir, "one.md"), "# One\n\nDesc one.\n");
    writeFileSync(join(guidesDir, "two.md"), "# Two\n\nDesc two.\n");

    await publishLocalGuidesTool.handler({});

    expect(updateCalls.filter((c) => c.pageId === "1")).toHaveLength(1);
  });

  it("never calls updatePage on the index when everything is skipped", async () => {
    writeFullConfig();
    writeFileSync(join(guidesDir, "already.md"), "# Already Published\n\nDesc.\n");
    await publishLocalGuidesTool.handler({});
    expect(updateCalls).toEqual([]);
  });
});
