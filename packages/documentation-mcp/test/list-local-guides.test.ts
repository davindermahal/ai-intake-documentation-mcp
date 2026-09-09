import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeIndexTable } from "../src/confluence/index-table.js";
import { textOf } from "./helpers.js";

const INDEX_STORAGE = serializeIndexTable([
  { title: "Already Published", description: "d", link: "https://x/pages/1", tags: [], lastModified: "2026-09-01" },
]);

vi.mock("@davindermahal/confluence-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@davindermahal/confluence-client")>();
  return {
    ...actual,
    ConfluenceClient: class {
      async getPageById(pageId: string) {
        if (pageId === "1") return { id: "1", title: "AI Agent Guides", version: 1, url: "https://x/pages/1", storageBody: INDEX_STORAGE };
        return null;
      }
    },
  };
});

const { listLocalGuidesTool } = await import("../src/tools/listLocalGuides.js");

let originalHome: string | undefined;
let home: string;
let envPath: string;
let guidesDir: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "documentation-mcp-home-test-"));
  process.env.HOME = home;
  envPath = join(home, ".config", "ai-intake-mcp", ".env");
  mkdirSync(dirname(envPath), { recursive: true });
  guidesDir = mkdtempSync(join(tmpdir(), "documentation-mcp-guides-dir-test-"));
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(guidesDir, { recursive: true, force: true });
});

function writeFullConfig(extra = "") {
  writeFileSync(
    envPath,
    `JIRA_SITE_URL=https://x\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/1\n${extra}`
  );
}

describe("list_local_guides", () => {
  it("errors when no guides directory is configured or passed", async () => {
    writeFullConfig();
    const result = await listLocalGuidesTool.handler({});
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/guides directory/);
  });

  it("errors when the configured/passed directory doesn't exist", async () => {
    writeFullConfig();
    const result = await listLocalGuidesTool.handler({ guides_dir: join(guidesDir, "missing") });
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/not found/);
  });

  it("persists guides_dir to GUIDES_LOCAL_DIR when passed", async () => {
    writeFullConfig();
    writeFileSync(join(guidesDir, "a.md"), "# A\n\nDesc.\n");
    await listLocalGuidesTool.handler({ guides_dir: guidesDir });
    expect(readFileSync(envPath, "utf-8")).toMatch(new RegExp(`GUIDES_LOCAL_DIR=${guidesDir}`));
  });

  it("reuses GUIDES_LOCAL_DIR from config when guides_dir isn't passed", async () => {
    writeFullConfig(`GUIDES_LOCAL_DIR=${guidesDir}\n`);
    writeFileSync(join(guidesDir, "a.md"), "# A\n\nDesc.\n");
    const result = await listLocalGuidesTool.handler({});
    expect(textOf(result)).toEqual({ guides: [{ filename: "a.md", title: "A", description: "Desc.", existsOnIndex: false }] });
  });

  it("flags existsOnIndex true for a local guide whose title matches an index row", async () => {
    writeFullConfig(`GUIDES_LOCAL_DIR=${guidesDir}\n`);
    writeFileSync(join(guidesDir, "already.md"), "# Already Published\n\nDesc.\n");
    const result = await listLocalGuidesTool.handler({});
    expect(textOf(result)).toEqual({
      guides: [{ filename: "already.md", title: "Already Published", description: "Desc.", existsOnIndex: true }],
    });
  });

  it("errors when CONFLUENCE_GUIDE_INDEX_URL is unset", async () => {
    writeFileSync(envPath, `GUIDES_LOCAL_DIR=${guidesDir}\n`);
    writeFileSync(join(guidesDir, "a.md"), "# A\n");
    const result = await listLocalGuidesTool.handler({});
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/CONFLUENCE_GUIDE_INDEX_URL/);
  });
});
