import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { SCAFFOLD_DIRS, emptyManifest, migrateManifestRaw, readManifestRaw, writeManifest } from "@davindermahal/context-schema";
import { detectAiDir } from "./detectAiDir.js";
import { proposeAiDirMigration } from "./proposeAiDirMigration.js";

export const ensureAiDirTool = {
  name: "ensure_ai_dir",
  description:
    "Gets the repo's .ai/ directory into a good state, fixing what's safe to fix automatically in " +
    "one call: absent -> creates the {docs,context,evidence,cache,plans} scaffold + manifest; " +
    "outdated (ours, but an older schema_version and/or missing directories) -> migrates the " +
    "manifest and backfills missing directories; conformant -> no-op, reports so. Non-conformant " +
    "(something already there that isn't ours) is never touched automatically — instead returns " +
    "every file found under .ai/ so the calling agent can show the user and ask before calling " +
    "apply_ai_dir_migration with confirm:true. Safe to call anytime, including repeatedly; always " +
    "call this before any other tool that touches .ai/.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const repoRoot = repo_root ?? process.cwd();
    const status = detectAiDir(repoRoot);

    if (status.status === "conformant") {
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: "conformant" }, null, 2) }] };
    }

    if (status.status === "absent") {
      for (const dir of SCAFFOLD_DIRS) {
        mkdirSync(join(repoRoot, dir), { recursive: true });
      }
      writeManifest(repoRoot, emptyManifest());
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: "initialized" }, null, 2) }] };
    }

    if (status.status === "outdated") {
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
              {
                status: "upgraded",
                from_version: fromVersion,
                to_version: manifest.schema_version,
                migration_steps: steps,
                directories_created: directoriesCreated,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // status.status === "non-conformant"
    const proposal = proposeAiDirMigration(repoRoot);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "non-conformant",
              files: proposal.files,
              note: "ask the user before calling apply_ai_dir_migration with confirm:true",
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
