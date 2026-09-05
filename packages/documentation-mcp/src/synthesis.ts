import { markSynthesized, pendingCounts, readManifest, writeManifest, type SetupManifest } from "@davindermahal/context-schema";

/**
 * Shared bookkeeping for write_doc / write_context_chunk: records the written path in
 * doc_index, marks any referenced evidence synthesized, and recomputes the manifest's pending
 * counters from actual state (never hand-incremented). Returns the updated manifest, or null if
 * .ai/ isn't initialized (caller should treat that as an error).
 */
export function recordSynthesis(
  repoRoot: string,
  kind: "docs" | "context",
  relPath: string,
  sourceEvidenceIds: string[] = []
): SetupManifest | null {
  const manifest = readManifest(repoRoot);
  if (!manifest) return null;

  if (!manifest.doc_index[kind].includes(relPath)) {
    manifest.doc_index[kind].push(relPath);
  }
  if (sourceEvidenceIds.length > 0) {
    markSynthesized(repoRoot, sourceEvidenceIds);
  }
  const counts = pendingCounts(repoRoot);
  manifest.evidence_pending_count = counts.pending;
  manifest.evidence_pending_corrections = counts.corrections;
  manifest.needs_resync = counts.corrections > 0;
  manifest.last_synthesis_at = new Date().toISOString();

  writeManifest(repoRoot, manifest);
  return manifest;
}
