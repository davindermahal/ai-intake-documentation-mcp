import * as z from "zod";

/**
 * Frontmatter shape for chunks under docs/ and context/. Not yet read/written by any
 * Phase 1 tool — defined now so Phase 2's synthesis tools and the harness's selective
 * retrieval agree on the shape from the start.
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
