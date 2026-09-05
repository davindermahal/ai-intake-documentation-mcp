import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as z from "zod";
import { resolveAiDir } from "@davindermahal/context-schema";
import { detectAiDir } from "./detectAiDir.js";

export interface LegacyFile {
  path: string; // relative to .ai/
  bytes: number;
}

function walk(dir: string, base: string): LegacyFile[] {
  const out: LegacyFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push({ path: relative(base, full), bytes: stat.size });
    }
  }
  return out;
}

export function proposeAiDirMigration(repoRoot: string): { status: string; files?: LegacyFile[] } {
  const status = detectAiDir(repoRoot);
  if (status.status !== "non-conformant") {
    const messages: Record<"absent" | "conformant" | "outdated", string> = {
      absent: "nothing-to-migrate: .ai/ is absent, use init_ai_scaffold",
      conformant: "nothing-to-migrate: .ai/ is already conformant",
      outdated: "nothing-to-migrate: .ai/ is ours but outdated, use upgrade_ai_dir instead",
    };
    return { status: messages[status.status] };
  }
  const aiDir = resolveAiDir(repoRoot);
  return { status: "migration-available", files: walk(aiDir, aiDir) };
}

export const proposeAiDirMigrationTool = {
  name: "propose_ai_dir_migration",
  description:
    "Read-only. If .ai/ is non-conformant (pre-existing content that isn't ours), lists every file " +
    "found under it with size. No classification into docs/context — apply_ai_dir_migration ingests " +
    "each as legacy evidence rather than guessing where it belongs.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const result = proposeAiDirMigration(repo_root ?? process.cwd());
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
};
