import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as z from "zod";
import { CONTEXT_DIR } from "./paths.js";

/**
 * Metadata for chunks under context/, so the harness can retrieve selectively by area instead
 * of loading everything. Carried in a `<chunk>.meta.json` sidecar rather than markdown
 * frontmatter — no YAML parser needed, and the chunk itself stays plain, directly-readable
 * markdown.
 */
export const ContextChunkFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  area: z.array(z.string()),
  risk: z.enum(["low", "medium", "high"]).optional(),
  updated_at: z.string(),
  source_evidence_ids: z.array(z.string()),
});

export type ContextChunkFrontmatter = z.infer<typeof ContextChunkFrontmatterSchema>;

export function contextChunkMetaPath(relPath: string): string {
  return `${relPath}.meta.json`;
}

export interface ContextChunk {
  content: string;
  frontmatter: ContextChunkFrontmatter;
}

/** relPath is relative to context/, e.g. "billing.md". */
export function writeContextChunk(
  repoRoot: string,
  relPath: string,
  content: string,
  frontmatter: ContextChunkFrontmatter
): void {
  ContextChunkFrontmatterSchema.parse(frontmatter);
  const contentPath = join(repoRoot, CONTEXT_DIR, relPath);
  const metaPath = join(repoRoot, CONTEXT_DIR, contextChunkMetaPath(relPath));
  mkdirSync(dirname(contentPath), { recursive: true });
  writeFileSync(contentPath, content, "utf-8");
  writeFileSync(metaPath, JSON.stringify(frontmatter, null, 2) + "\n", "utf-8");
}

export function readContextChunk(repoRoot: string, relPath: string): ContextChunk | null {
  const contentPath = join(repoRoot, CONTEXT_DIR, relPath);
  const metaPath = join(repoRoot, CONTEXT_DIR, contextChunkMetaPath(relPath));
  if (!existsSync(contentPath) || !existsSync(metaPath)) return null;
  return {
    content: readFileSync(contentPath, "utf-8"),
    frontmatter: ContextChunkFrontmatterSchema.parse(JSON.parse(readFileSync(metaPath, "utf-8"))),
  };
}
