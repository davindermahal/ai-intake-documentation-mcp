import * as z from "zod";
import { readManifest, writeContextChunk } from "@ai-intake/context-schema";
import { recordSynthesis } from "../synthesis.js";

export const writeContextChunkTool = {
  name: "write_context_chunk",
  description:
    "Commits agent-authored, distilled content to .ai/context/<path> plus a metadata sidecar (title, " +
    "area tags, optional risk level) so a harness can retrieve chunks selectively by area instead of " +
    "loading everything. Full-file replacement, no diffing. If source_evidence_ids is given, those " +
    "evidence entries are marked synthesized and the manifest's pending counters are recomputed. " +
    "Requires .ai/ to already be initialized.",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
    path: z.string().describe("Path relative to .ai/context/, e.g. 'billing.md'."),
    content: z.string(),
    title: z.string(),
    area: z.array(z.string()).describe("Feature/module tags, e.g. ['billing', 'auth']."),
    risk: z.enum(["low", "medium", "high"]).optional(),
    source_evidence_ids: z.array(z.string()).default([]),
  }),
  handler: async ({
    repo_root,
    path,
    content,
    title,
    area,
    risk,
    source_evidence_ids,
  }: {
    repo_root?: string;
    path: string;
    content: string;
    title: string;
    area: string[];
    risk?: "low" | "medium" | "high";
    source_evidence_ids?: string[];
  }) => {
    const repoRoot = repo_root ?? process.cwd();
    if (!readManifest(repoRoot)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not-initialized: run init_ai_scaffold first" }, null, 2) }],
        isError: true,
      };
    }

    const ids = source_evidence_ids ?? [];
    writeContextChunk(repoRoot, path, content, {
      id: path,
      title,
      area,
      risk,
      updated_at: new Date().toISOString(),
      source_evidence_ids: ids,
    });

    const manifest = recordSynthesis(repoRoot, "context", path, ids);
    return { content: [{ type: "text" as const, text: JSON.stringify({ status: "written", path, manifest }, null, 2) }] };
  },
};
