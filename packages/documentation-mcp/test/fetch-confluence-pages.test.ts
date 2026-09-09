import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "./helpers.js";

vi.mock("@davindermahal/confluence-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@davindermahal/confluence-client")>();
  return {
    ...actual,
    ConfluenceClient: class {
      async getPageById(pageId: string) {
        if (pageId === "1") {
          return {
            id: "1",
            title: "Symfony 4→5 Upgrade",
            version: 1,
            url: "https://example.atlassian.net/wiki/spaces/ENG/pages/1/Symfony",
            storageBody: "<p>Upgrade steps.</p>",
            lastModified: "2021-03-14T10:00:00.000Z",
          };
        }
        if (pageId === "999") return null;
        throw new Error("simulated fetch failure");
      }
    },
  };
});

const { fetchConfluencePagesTool } = await import("../src/tools/fetchConfluencePages.js");

let originalHome: string | undefined;
let home: string;
let envPath: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "documentation-mcp-home-test-"));
  process.env.HOME = home;
  envPath = join(home, ".config", "ai-intake-mcp", ".env");
  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, "JIRA_SITE_URL=https://example.atlassian.net\nJIRA_INTAKE_EMAIL=a@b.com\nJIRA_INTAKE_API_TOKEN=tok\n");
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

describe("fetch_confluence_pages", () => {
  it("returns a not-configured error when no Jira/Confluence credentials are set", async () => {
    writeFileSync(envPath, "");
    const result = await fetchConfluencePagesTool.handler({ urls: [] });
    expect(result.isError).toBe(true);
    expect((textOf(result) as { error: string }).error).toMatch(/not-configured/);
  });

  it("fetches a matching page and returns its content, title, and lastModified", async () => {
    const result = await fetchConfluencePagesTool.handler({
      urls: ["https://example.atlassian.net/wiki/spaces/ENG/pages/1/Symfony"],
    });
    expect(textOf(result)).toEqual({
      pages: [
        {
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/1/Symfony",
          title: "Symfony 4→5 Upgrade",
          content: "Upgrade steps.",
          lastModified: "2021-03-14T10:00:00.000Z",
        },
      ],
    });
  });

  it("silently skips a URL on a different host, without an error entry", async () => {
    const result = await fetchConfluencePagesTool.handler({ urls: ["https://other-site.atlassian.net/wiki/spaces/X/pages/1/Y"] });
    expect(textOf(result)).toEqual({ pages: [] });
  });

  it("silently skips a same-host URL with no extractable page ID", async () => {
    const result = await fetchConfluencePagesTool.handler({ urls: ["https://example.atlassian.net/wiki/spaces/ENG/overview"] });
    expect(textOf(result)).toEqual({ pages: [] });
  });

  it("reports a per-URL error for a matching URL that fails to fetch, without sinking the batch", async () => {
    const result = await fetchConfluencePagesTool.handler({
      urls: [
        "https://example.atlassian.net/wiki/spaces/ENG/pages/1/Symfony",
        "https://example.atlassian.net/wiki/spaces/ENG/pages/500/Broken",
      ],
    });
    expect(textOf(result)).toEqual({
      pages: [
        {
          url: "https://example.atlassian.net/wiki/spaces/ENG/pages/1/Symfony",
          title: "Symfony 4→5 Upgrade",
          content: "Upgrade steps.",
          lastModified: "2021-03-14T10:00:00.000Z",
        },
        { url: "https://example.atlassian.net/wiki/spaces/ENG/pages/500/Broken", error: "simulated fetch failure" },
      ],
    });
  });

  it("reports a not-found error for a matching URL whose page doesn't exist", async () => {
    const result = await fetchConfluencePagesTool.handler({
      urls: ["https://example.atlassian.net/wiki/spaces/ENG/pages/999/Gone"],
    });
    expect(textOf(result)).toEqual({
      pages: [{ url: "https://example.atlassian.net/wiki/spaces/ENG/pages/999/Gone", error: expect.stringMatching(/not found/) }],
    });
  });
});
