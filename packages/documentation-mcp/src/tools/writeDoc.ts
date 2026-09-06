import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as z from "zod";
import { DOCS_DIR, readManifest } from "@davindermahal/context-schema";
import { recordSynthesis } from "../synthesis.js";

export const writeDocTool = {
  name: "write_doc",
  description:
    "Commits agent-authored markdown to .ai/docs/<path> — narrative, human-facing documentation. " +
    "Full-file replacement, no diffing. If source_evidence_ids is given, those evidence entries are " +
    "marked synthesized and the manifest's pending counters are recomputed. Requires .ai/ to already " +
    "be initialized.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    path: z.string().describe("Path relative to .ai/docs/, e.g. 'billing.md'."),
    content: z.string(),
    source_evidence_ids: z.array(z.string()).optional(),
  }),
  handler: async ({
    repo_root,
    path,
    content,
    source_evidence_ids,
  }: {
    repo_root?: string;
    path: string;
    content: string;
    source_evidence_ids?: string[];
  }) => {
    const repoRoot = repo_root ?? process.cwd();
    if (!readManifest(repoRoot)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not-initialized: run ensure_ai_dir first" }, null, 2) }],
        isError: true,
      };
    }

    const fullPath = join(repoRoot, DOCS_DIR, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");

    const manifest = recordSynthesis(repoRoot, "docs", path, source_evidence_ids ?? []);
    return { content: [{ type: "text" as const, text: JSON.stringify({ status: "written", path, manifest }, null, 2) }] };
  },
};
