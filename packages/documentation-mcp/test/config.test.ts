import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLocalConfluenceConfig, writeConfigValue } from "../src/config.js";

let dir: string;
let envPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "documentation-mcp-config-test-"));
  envPath = join(dir, ".env");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadLocalConfluenceConfig", () => {
  it("returns all-undefined when the file doesn't exist", () => {
    expect(loadLocalConfluenceConfig(envPath)).toEqual({
      confluenceSpaceKey: undefined,
      confluenceGuideIndexUrl: undefined,
    });
  });

  it("reads its own product-specific fields off the shared raw loader", () => {
    writeFileSync(envPath, "CONFLUENCE_SPACE_KEY=ENG\nCONFLUENCE_GUIDE_INDEX_URL=https://x/pages/1\n");
    expect(loadLocalConfluenceConfig(envPath)).toEqual({
      confluenceSpaceKey: "ENG",
      confluenceGuideIndexUrl: "https://x/pages/1",
    });
  });
});

describe("writeConfigValue", () => {
  it("creates the file when it doesn't exist yet", () => {
    writeConfigValue("CONFLUENCE_GUIDE_INDEX_URL", "https://example.atlassian.net/wiki/x", envPath);
    expect(readFileSync(envPath, "utf-8")).toBe("CONFLUENCE_GUIDE_INDEX_URL=https://example.atlassian.net/wiki/x\n");
  });

  it("updates an existing key in place, preserving every other line", () => {
    writeFileSync(envPath, "JIRA_SITE_URL=https://example.atlassian.net\nCONFLUENCE_GUIDE_INDEX_URL=old\nJIRA_EMAIL=a@b.com\n");
    writeConfigValue("CONFLUENCE_GUIDE_INDEX_URL", "new", envPath);
    const lines = readFileSync(envPath, "utf-8").trim().split("\n");
    expect(lines).toEqual(["JIRA_SITE_URL=https://example.atlassian.net", "CONFLUENCE_GUIDE_INDEX_URL=new", "JIRA_EMAIL=a@b.com"]);
  });

  it("appends the key when the file exists but doesn't have it yet", () => {
    writeFileSync(envPath, "JIRA_SITE_URL=https://example.atlassian.net\n");
    writeConfigValue("CONFLUENCE_SPACE_KEY", "ENG", envPath);
    const lines = readFileSync(envPath, "utf-8").trim().split("\n");
    expect(lines).toEqual(["JIRA_SITE_URL=https://example.atlassian.net", "CONFLUENCE_SPACE_KEY=ENG"]);
  });
});
