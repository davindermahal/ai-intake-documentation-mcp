import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { EVIDENCE_ONBOARDING_DIR, EVIDENCE_TICKETS_DIR } from "./paths.js";

export const EvidenceTypeSchema = z.enum(["new-rule", "correction", "clarification", "raw-note"]);
export const EvidenceSourceSchema = z.enum(["human", "agent-inferred", "legacy-doc"]);

export const EvidenceSchema = z.object({
  id: z.string(),
  ticket_key: z.string().nullable(),
  date: z.string(),
  type: EvidenceTypeSchema,
  source: EvidenceSourceSchema,
  content: z.string(),
  related_files: z.array(z.string()).default([]),
  synthesized: z.boolean().default(false),
});

export type EvidenceEntry = z.infer<typeof EvidenceSchema>;

/** Builds a new evidence entry with a fresh id/date, ready for appendEvidence(). */
export function createEvidence(
  input: Omit<EvidenceEntry, "id" | "date" | "synthesized" | "related_files"> & {
    related_files?: string[];
  }
): EvidenceEntry {
  return {
    id: randomUUID(),
    date: new Date().toISOString(),
    synthesized: false,
    related_files: input.related_files ?? [],
    ticket_key: input.ticket_key,
    type: input.type,
    source: input.source,
    content: input.content,
  };
}

export function evidenceFilename(entry: EvidenceEntry): string {
  const day = entry.date.slice(0, 10);
  const base = `${day}-${entry.id}.json`;
  return entry.ticket_key
    ? join(EVIDENCE_TICKETS_DIR, `${entry.ticket_key}-${base}`)
    : join(EVIDENCE_ONBOARDING_DIR, base);
}

export function appendEvidence(repoRoot: string, entry: EvidenceEntry): string {
  EvidenceSchema.parse(entry);
  const relPath = evidenceFilename(entry);
  const path = join(repoRoot, relPath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n", "utf-8");
  return relPath;
}

function evidenceDirs(repoRoot: string): string[] {
  return [join(repoRoot, EVIDENCE_TICKETS_DIR), join(repoRoot, EVIDENCE_ONBOARDING_DIR)];
}

function readEvidenceDir(dir: string): EvidenceEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => EvidenceSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf-8"))));
}

export function listAllEvidence(repoRoot: string): EvidenceEntry[] {
  return evidenceDirs(repoRoot).flatMap(readEvidenceDir);
}

export function listUnsynthesized(repoRoot: string): EvidenceEntry[] {
  return listAllEvidence(repoRoot).filter((e) => !e.synthesized);
}

/** Full path to the file backing an evidence id, or null if no entry with that id exists. */
function findEvidenceFile(repoRoot: string, id: string): string | null {
  for (const dir of evidenceDirs(repoRoot)) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const path = join(dir, f);
      const entry = EvidenceSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
      if (entry.id === id) return path;
    }
  }
  return null;
}

/** Marks the given evidence ids as synthesized. Silently skips ids that don't resolve to a file. */
export function markSynthesized(repoRoot: string, ids: string[]): void {
  for (const id of ids) {
    const path = findEvidenceFile(repoRoot, id);
    if (!path) continue;
    const entry = EvidenceSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
    entry.synthesized = true;
    writeFileSync(path, JSON.stringify(entry, null, 2) + "\n", "utf-8");
  }
}

/** Counts derived fresh from actual unsynthesized evidence — never hand-incremented/decremented. */
export function pendingCounts(repoRoot: string): { pending: number; corrections: number } {
  const unsynthesized = listUnsynthesized(repoRoot);
  return {
    pending: unsynthesized.length,
    corrections: unsynthesized.filter((e) => e.type === "correction").length,
  };
}
