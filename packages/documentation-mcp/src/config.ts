import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultConfigPath, getConfigValue, loadRawConfig } from "@davindermahal/confluence-client";

export { defaultConfigPath };

/**
 * This server's own Confluence fields, on top of the shared auth-triple resolution in
 * `@davindermahal/confluence-client` (extract-a-shared-confluence-client-package plan, Design #1) --
 * `CONFLUENCE_SPACE_KEY`/`CONFLUENCE_GUIDE_INDEX_URL` are this repo's product-specific config, so
 * they stay local, read off the same raw `.env`+`process.env` loader the shared package exports.
 */
export interface LocalConfluenceConfig {
  confluenceSpaceKey: string | undefined;
  confluenceGuideIndexUrl: string | undefined;
  /** Local directory of guide .md files for list_local_guides/publish_local_guides -- see those tools. */
  guidesLocalDir: string | undefined;
}

export function loadLocalConfluenceConfig(configPath: string = defaultConfigPath()): LocalConfluenceConfig {
  const raw = loadRawConfig(configPath);
  return {
    confluenceSpaceKey: getConfigValue(raw, "CONFLUENCE_SPACE_KEY"),
    confluenceGuideIndexUrl: getConfigValue(raw, "CONFLUENCE_GUIDE_INDEX_URL"),
    guidesLocalDir: getConfigValue(raw, "GUIDES_LOCAL_DIR"),
  };
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
