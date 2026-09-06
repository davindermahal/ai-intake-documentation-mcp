import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CURRENT_SCHEMA_VERSION, ManifestSchema, SCAFFOLD_DIRS, readManifestRaw, resolveAiDir } from "@davindermahal/context-schema";

export type AiDirStatus =
  | { status: "absent" }
  | { status: "conformant" }
  | { status: "outdated"; schema_version: string; missing_dirs: string[] }
  | { status: "non-conformant"; found: string[] };

export function detectAiDir(repoRoot: string): AiDirStatus {
  const aiDir = resolveAiDir(repoRoot);
  if (!existsSync(aiDir)) return { status: "absent" };

  const raw = readManifestRaw(repoRoot);
  const schemaVersion =
    raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).schema_version === "string"
      ? (raw as Record<string, unknown>).schema_version as string
      : null;

  if (schemaVersion !== null) {
    // Recognizably ours (has a schema_version) — either fully current, or ours-but-outdated.
    // Never bucketed with truly-foreign content, which needs a different remedy entirely.
    const missingDirs = SCAFFOLD_DIRS.filter((dir) => !existsSync(join(repoRoot, dir)));
    let parses = false;
    try {
      ManifestSchema.parse(raw);
      parses = true;
    } catch {
      // falls through — treated as outdated, not non-conformant
    }

    if (schemaVersion === CURRENT_SCHEMA_VERSION && parses && missingDirs.length === 0) {
      return { status: "conformant" };
    }
    return { status: "outdated", schema_version: schemaVersion, missing_dirs: missingDirs };
  }

  return { status: "non-conformant", found: readdirSync(aiDir) };
}
