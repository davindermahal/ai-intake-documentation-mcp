import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Shared with `ai-intake-mcp` (Key decision #1 of the Confluence guide-authoring plan) — that repo
 * owns the JIRA_SITE_URL/JIRA_INTAKE_EMAIL/JIRA_INTAKE_API_TOKEN variable names read below, via its
 * own `src/config.ts` (`loadGlobalConfig()`). There is no shared package between these two repos,
 * so a rename over there would silently break Confluence auth here with no compile-time signal —
 * confirm these three names still match that file before assuming the "reuse Jira creds" default
 * actually works.
 */
export function defaultConfigPath(): string {
  return join(homedir(), ".config", "ai-intake-mcp", ".env");
}

export interface ConfluenceConfig {
  jiraSiteUrl: string | undefined;
  jiraEmail: string | undefined;
  jiraApiToken: string | undefined;
  confluenceSiteUrl: string | undefined;
  confluenceEmail: string | undefined;
  confluenceApiToken: string | undefined;
  confluenceSpaceKey: string | undefined;
  confluenceGuideIndexUrl: string | undefined;
}

export interface ResolvedConfluenceAuth {
  siteUrl: string;
  email: string;
  apiToken: string;
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

export function loadConfluenceConfig(configPath: string = defaultConfigPath()): ConfluenceConfig {
  const file = parseEnvFile(configPath);
  const get = (key: string): string | undefined => process.env[key] || file[key] || undefined;
  return {
    jiraSiteUrl: get("JIRA_SITE_URL"),
    jiraEmail: get("JIRA_INTAKE_EMAIL"),
    jiraApiToken: get("JIRA_INTAKE_API_TOKEN"),
    confluenceSiteUrl: get("CONFLUENCE_SITE_URL"),
    confluenceEmail: get("CONFLUENCE_EMAIL"),
    confluenceApiToken: get("CONFLUENCE_API_TOKEN"),
    confluenceSpaceKey: get("CONFLUENCE_SPACE_KEY"),
    confluenceGuideIndexUrl: get("CONFLUENCE_GUIDE_INDEX_URL"),
  };
}

/** Key decision #2: reuse Jira credentials by default, overridable per-field. Null if incomplete. */
export function resolveConfluenceAuth(config: ConfluenceConfig): ResolvedConfluenceAuth | null {
  const siteUrl = config.confluenceSiteUrl ?? config.jiraSiteUrl;
  const email = config.confluenceEmail ?? config.jiraEmail;
  const apiToken = config.confluenceApiToken ?? config.jiraApiToken;
  if (!siteUrl || !email || !apiToken) return null;
  return { siteUrl, email, apiToken };
}

/** Writes/updates a single KEY=value line in the shared .env file, preserving every other line. */
export function writeConfigValue(key: string, value: string, configPath: string = defaultConfigPath()): void {
  mkdirSync(dirname(configPath), { recursive: true });
  const lines = existsSync(configPath) ? readFileSync(configPath, "utf-8").split("\n") : [];
  let found = false;
  const updated = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  while (updated.length > 0 && updated[updated.length - 1] === "") updated.pop();
  if (!found) updated.push(`${key}=${value}`);
  writeFileSync(configPath, updated.join("\n") + "\n", "utf-8");
}
