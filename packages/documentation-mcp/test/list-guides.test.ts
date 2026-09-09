import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeIndexTable } from "../src/confluence/index-table.js";
import { textOf } from "./helpers.js";

const INDEX_STORAGE = serializeIndexTable([{ title: "Symfony 4→5 Upgrade", description: "d", link: "https://x/pages/1", tags: ["symfony"], lastModified: "2026-09-06" }]);

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

const { listGuidesTool } = await import("../src/tools/listGuides.js");

let originalHome: string | undefined;
let home: string;
let envPath: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "documentation-mcp-home-test-"));
  process.env.HOME = home;
  envPath = join(home, ".config", "ai-intake-mcp", ".env");
  mkdirSync(dirname(envPath), { recursive: true });
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

describe("list_guides", () => {
  it("returns a not-configured error when CONFLUENCE_GUIDE_INDEX_URL is unset", async () => {
    const result = await listGuidesTool.handler();
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/CONFLUENCE_GUIDE_INDEX_URL/);
  });

  it("returns a not-configured error when credentials are missing even if the index URL is set", async () => {
    writeFileSync(envPath, "CONFLUENCE_GUIDE_INDEX_URL=https://x/pages/1\n");
    const result = await listGuidesTool.handler();
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/not-configured/);
  });

  it("fetches and parses the index into guide rows", async () => {
    writeFileSync(envPath, "JIRA_SITE_URL=https://x\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/1\n");
    const result = await listGuidesTool.handler();
    expect(textOf(result)).toEqual({ guides: [{ title: "Symfony 4→5 Upgrade", description: "d", link: "https://x/pages/1", tags: ["symfony"], lastModified: "2026-09-06" }] });
  });

  it("errors clearly when the configured index page can't be found", async () => {
    writeFileSync(envPath, "JIRA_SITE_URL=https://x\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/999\n");
    const result = await listGuidesTool.handler();
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/index page not found/);
  });
});
