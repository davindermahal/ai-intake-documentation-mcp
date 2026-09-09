import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfigValue, loadConfluenceConfig, loadRawConfig, resolveConfluenceAuth } from "../src/config.js";

let dir: string;
let envPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "confluence-client-config-test-"));
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

  it("prefers a real environment variable over the file", () => {
    writeFileSync(envPath, "JIRA_SITE_URL=file-value\n");
    process.env.JIRA_SITE_URL = "env-value";
    try {
      expect(loadConfluenceConfig(envPath).jiraSiteUrl).toBe("env-value");
    } finally {
      delete process.env.JIRA_SITE_URL;
    }
  });
});

describe("loadRawConfig / getConfigValue", () => {
  it("lets a consumer read its own product-specific keys off the same file", () => {
    writeFileSync(envPath, "CONFLUENCE_SPACE_KEY=ENG\n");
    const raw = loadRawConfig(envPath);
    expect(getConfigValue(raw, "CONFLUENCE_SPACE_KEY")).toBe("ENG");
    expect(getConfigValue(raw, "CONFLUENCE_GUIDE_INDEX_URL")).toBeUndefined();
  });
});

describe("resolveConfluenceAuth", () => {
  it("returns null when any of site/email/token is missing", () => {
    expect(resolveConfluenceAuth({ jiraSiteUrl: "s", jiraEmail: undefined, jiraApiToken: "t" } as never)).toBeNull();
  });

  it("defaults to the Jira fields", () => {
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
