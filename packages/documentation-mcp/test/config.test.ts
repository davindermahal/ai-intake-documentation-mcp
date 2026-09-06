import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfluenceConfig, resolveConfluenceAuth, writeConfigValue } from "../src/config.js";

let dir: string;
let envPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "documentation-mcp-config-test-"));
  envPath = join(dir, ".env");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadConfluenceConfig", () => {
  it("returns all-undefined when the file doesn't exist", () => {
    expect(loadConfluenceConfig(envPath)).toEqual({
      jiraSiteUrl: undefined,
      jiraEmail: undefined,
      jiraApiToken: undefined,
      confluenceSiteUrl: undefined,
      confluenceEmail: undefined,
      confluenceApiToken: undefined,
      confluenceSpaceKey: undefined,
      confluenceGuideIndexUrl: undefined,
    });
  });

  it("parses KEY=value lines, ignoring comments and blanks", () => {
    writeFileSync(envPath, "# comment\n\nJIRA_SITE_URL=https://example.atlassian.net\nJIRA_INTAKE_EMAIL=a@b.com\n");
    const config = loadConfluenceConfig(envPath);
    expect(config.jiraSiteUrl).toBe("https://example.atlassian.net");
    expect(config.jiraEmail).toBe("a@b.com");
  });

  it("strips matching surrounding quotes from a value", () => {
    writeFileSync(envPath, 'JIRA_INTAKE_API_TOKEN="tok with spaces"\n');
    expect(loadConfluenceConfig(envPath).jiraApiToken).toBe("tok with spaces");
  });
});

describe("resolveConfluenceAuth", () => {
  it("returns null when any of site/email/token is missing", () => {
    expect(resolveConfluenceAuth({ jiraSiteUrl: "s", jiraEmail: undefined, jiraApiToken: "t" } as never)).toBeNull();
  });

  it("defaults to the Jira fields (Key decision #2)", () => {
    const config = { jiraSiteUrl: "jira-site", jiraEmail: "jira-email", jiraApiToken: "jira-token" } as never;
    expect(resolveConfluenceAuth(config)).toEqual({ siteUrl: "jira-site", email: "jira-email", apiToken: "jira-token" });
  });

  it("overrides per-field with the CONFLUENCE_* fields when set", () => {
    const config = {
      jiraSiteUrl: "jira-site",
      jiraEmail: "jira-email",
      jiraApiToken: "jira-token",
      confluenceSiteUrl: "confluence-site",
    } as never;
    expect(resolveConfluenceAuth(config)).toEqual({ siteUrl: "confluence-site", email: "jira-email", apiToken: "jira-token" });
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
