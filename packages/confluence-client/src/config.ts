import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Both `ai-intake-mcp` and `ai-intake-documentation-mcp` read this same file and the same
 * `JIRA_*`/`CONFLUENCE_*` variable names -- this package is what turns that from a hand-maintained
 * assumption into a real, versioned dependency (extract-a-shared-confluence-client-package plan,
 * Motivation).
 */
export function defaultConfigPath(): string {
  return join(homedir(), ".config", "ai-intake-mcp", ".env");
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const result: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Raw `.env`-file contents, keyed as written. Exported so each consumer can read its own
 * product-specific fields (e.g. `CONFLUENCE_SPACE_KEY`, `CONFLUENCE_GUIDE_INDEX_URL`) off the same
 * file/precedence rule as the auth fields below, without this package needing to know those fields
 * exist (Design #1's package-boundary split).
 */
export function loadRawConfig(configPath: string = defaultConfigPath()): Record<string, string> {
  return parseEnvFile(configPath);
}

/** Environment variables always win over the `.env` file, matching both repos' existing behavior. */
export function getConfigValue(raw: Record<string, string>, key: string): string | undefined {
  return process.env[key] || raw[key] || undefined;
}

export interface ConfluenceConfig {
  jiraSiteUrl: string | undefined;
  jiraEmail: string | undefined;
  jiraApiToken: string | undefined;
  confluenceSiteUrl: string | undefined;
  confluenceEmail: string | undefined;
  confluenceApiToken: string | undefined;
}

/** Only the auth-triple resolution fields -- product-specific config stays with each consumer. */
export function loadConfluenceConfig(configPath: string = defaultConfigPath()): ConfluenceConfig {
  const raw = loadRawConfig(configPath);
  const get = (key: string) => getConfigValue(raw, key);
  return {
    jiraSiteUrl: get("JIRA_SITE_URL"),
    jiraEmail: get("JIRA_INTAKE_EMAIL"),
    jiraApiToken: get("JIRA_INTAKE_API_TOKEN"),
    confluenceSiteUrl: get("CONFLUENCE_SITE_URL"),
    confluenceEmail: get("CONFLUENCE_EMAIL"),
    confluenceApiToken: get("CONFLUENCE_API_TOKEN"),
  };
}

export interface ResolvedConfluenceAuth {
  siteUrl: string;
  email: string;
  apiToken: string;
}

/** Reuses Jira credentials by default, overridable per-field. Null if incomplete. */
export function resolveConfluenceAuth(config: ConfluenceConfig): ResolvedConfluenceAuth | null {
  const siteUrl = config.confluenceSiteUrl ?? config.jiraSiteUrl;
  const email = config.confluenceEmail ?? config.jiraEmail;
  const apiToken = config.confluenceApiToken ?? config.jiraApiToken;
  if (!siteUrl || !email || !apiToken) return null;
  return { siteUrl, email, apiToken };
}
