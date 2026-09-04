import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { SCAFFOLD_DIRS, migrateManifestRaw, readManifestRaw, writeManifest } from "@ai-intake/context-schema";
import { detectAiDir } from "./detectAiDir.js";

export const upgradeAiDirTool = {
  name: "upgrade_ai_dir",
  description:
    "Fixes a .ai/ directory that detect_ai_dir reports as 'outdated' — an older schema_version " +
    "and/or missing directories the current version expects. Migrates the manifest through " +
    "MANIFEST_MIGRATIONS to the current schema version, then unconditionally backfills any " +
    "missing scaffold directories (version-independent — the current directory list is always " +
    "correct to create, regardless of which old version is being upgraded from). Refuses (with a " +
    "pointer to the right tool) if .ai/ is absent, already conformant, or non-conformant.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const repoRoot = repo_root ?? process.cwd();
    const status = detectAiDir(repoRoot);

    if (status.status === "absent") {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "absent: use init_ai_scaffold instead" }, null, 2) }],
        isError: true,
      };
    }
    if (status.status === "non-conformant") {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "non-conformant: use propose_ai_dir_migration / apply_ai_dir_migration instead" }, null, 2) },
        ],
        isError: true,
      };
    }
    if (status.status === "conformant") {
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: "already-current" }, null, 2) }] };
    }

    // status.status === "outdated"
    const raw = readManifestRaw(repoRoot) as Record<string, unknown>;
    let manifest, fromVersion, steps;
    try {
      ({ manifest, fromVersion, steps } = migrateManifestRaw(raw));
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2) }],
        isError: true,
      };
    }
    writeManifest(repoRoot, manifest);

    const directoriesCreated: string[] = [];
    for (const dir of SCAFFOLD_DIRS) {
      const full = join(repoRoot, dir);
      if (!existsSync(full)) {
        mkdirSync(full, { recursive: true });
        directoriesCreated.push(dir);
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { status: "upgraded", from_version: fromVersion, to_version: manifest.schema_version, migration_steps: steps, directories_created: directoriesCreated },
            null,
            2
          ),
        },
      ],
    };
  },
};
