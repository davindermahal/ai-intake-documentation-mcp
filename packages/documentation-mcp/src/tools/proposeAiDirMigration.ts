import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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
      absent: "nothing-to-migrate: .ai/ is absent, use ensure_ai_dir",
      conformant: "nothing-to-migrate: .ai/ is already conformant",
      outdated: "nothing-to-migrate: .ai/ is ours but outdated, use ensure_ai_dir instead",
    };
    return { status: messages[status.status] };
  }
  const aiDir = resolveAiDir(repoRoot);
  return { status: "migration-available", files: walk(aiDir, aiDir) };
}
