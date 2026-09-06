import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "./helpers.js";

vi.mock("../src/confluence/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/confluence/client.js")>();
  return {
    ...actual,
    ConfluenceClient: class {
      async getPageById(pageId: string) {
        if (pageId === "123456") {
          return { id: "123456", title: "AI Agent Guides", version: 1, url: "https://x/pages/123456", storageBody: "" };
        }
        return null;
      }
      async createPage(params: { title: string }) {
        return {
          id: "999",
          title: params.title,
          version: 1,
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/999/Guides",
          storageBody: "",
        };
      }
    },
  };
});

const { ensureGuideIndexTool } = await import("../src/tools/ensureGuideIndex.js");

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

describe("ensure_guide_index", () => {
  it("returns a not-configured error when no Jira/Confluence credentials are set", async () => {
    const result = await ensureGuideIndexTool.handler({});
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/not-configured/);
  });

  it("reports conformant when CONFLUENCE_GUIDE_INDEX_URL already resolves to a real page", async () => {
    writeFileSync(
      envPath,
      "JIRA_SITE_URL=https://example.atlassian.net\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/123456\n"
    );
    const result = await ensureGuideIndexTool.handler({});
    expect(textOf(result)).toEqual({ status: "conformant", url: "https://x/pages/123456" });
  });

  it("requires CONFLUENCE_SPACE_KEY to create a new index page", async () => {
    writeFileSync(envPath, "JIRA_SITE_URL=https://example.atlassian.net\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\n");
    const result = await ensureGuideIndexTool.handler({});
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/CONFLUENCE_SPACE_KEY/);
  });

  it("creates the index page and writes the URL back into the config file when unset", async () => {
    writeFileSync(envPath, "JIRA_SITE_URL=https://example.atlassian.net\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\nCONFLUENCE_SPACE_KEY=ENG\n");
    const result = await ensureGuideIndexTool.handler({});
    expect(textOf(result)).toEqual({ status: "initialized", url: "https://example.atlassian.net/wiki/spaces/ENG/pages/999/Guides" });
    expect(readFileSync(envPath, "utf-8")).toContain(
      "CONFLUENCE_GUIDE_INDEX_URL=https://example.atlassian.net/wiki/spaces/ENG/pages/999/Guides"
    );
  });
});
