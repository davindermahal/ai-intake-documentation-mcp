import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { readManifest, resolveAiDir } from "@ai-intake/context-schema";

export type AiDirStatus =
  | { status: "absent" }
  | { status: "conformant" }
  | { status: "non-conformant"; found: string[] };

export function detectAiDir(repoRoot: string): AiDirStatus {
  const aiDir = resolveAiDir(repoRoot);
  if (!existsSync(aiDir)) return { status: "absent" };

  try {
    const manifest = readManifest(repoRoot);
    if (manifest) return { status: "conformant" };
  } catch {
    // falls through to non-conformant — manifest exists but fails schema validation
  }

  return { status: "non-conformant", found: readdirSync(aiDir) };
}

export const detectAiDirTool = {
  name: "detect_ai_dir",
  description:
    "Checks whether the repo's .ai/ directory is absent, conformant with the expected schema, or " +
    "non-conformant (something's there that isn't ours — e.g. a pre-existing/legacy .ai dir). " +
    "Never modifies anything. Always call this before init_ai_scaffold.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const result = detectAiDir(repo_root ?? process.cwd());
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
};
