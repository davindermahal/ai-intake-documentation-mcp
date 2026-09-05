import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { SCAFFOLD_DIRS, emptyManifest, writeManifest } from "@davindermahal/context-schema";
import { detectAiDir } from "./detectAiDir.js";

export const initAiScaffoldTool = {
  name: "init_ai_scaffold",
  description:
    "Creates the .ai/{docs,context,evidence,cache,plans} structure and an initial manifest. " +
    "Refuses if detect_ai_dir would report non-conformant (use propose_ai_dir_migration / " +
    "apply_ai_dir_migration instead) or outdated (use upgrade_ai_dir instead), so it never " +
    "overwrites pre-existing content. Safe to call again once conformant; it's a no-op then.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const repoRoot = repo_root ?? process.cwd();
    const existing = detectAiDir(repoRoot);

    if (existing.status === "non-conformant") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "non-conformant .ai/ directory already exists; refusing to overwrite",
                found: existing.found,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    if (existing.status === "conformant") {
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: "already-initialized" }, null, 2) }] };
    }

    if (existing.status === "outdated") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "outdated .ai/ directory (ours, but older) — use upgrade_ai_dir instead", ...existing },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    for (const dir of SCAFFOLD_DIRS) {
      mkdirSync(join(repoRoot, dir), { recursive: true });
    }
    writeManifest(repoRoot, emptyManifest());

    return { content: [{ type: "text" as const, text: JSON.stringify({ status: "initialized" }, null, 2) }] };
  },
};
