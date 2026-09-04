import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as z from "zod";
import { SETUP_MANIFEST } from "./paths.js";

export const ManifestSchema = z.object({
  schema_version: z.string(),
  last_scan_sha: z.string().nullable(),
  last_synthesis_at: z.string().nullable(),
  evidence_pending_count: z.number().int().nonnegative(),
  evidence_pending_corrections: z.number().int().nonnegative(),
  needs_resync: z.boolean(),
  doc_index: z.object({
    docs: z.array(z.string()),
    context: z.array(z.string()),
  }),
});

export type SetupManifest = z.infer<typeof ManifestSchema>;

export const CURRENT_SCHEMA_VERSION = "0.1.0";

export function emptyManifest(): SetupManifest {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    last_scan_sha: null,
    last_synthesis_at: null,
    evidence_pending_count: 0,
    evidence_pending_corrections: 0,
    needs_resync: false,
    doc_index: { docs: [], context: [] },
  };
}

/** Returns null if no manifest exists yet at repoRoot. Throws if the file exists but fails validation. */
export function readManifest(repoRoot: string): SetupManifest | null {
  const path = join(repoRoot, SETUP_MANIFEST);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return ManifestSchema.parse(raw);
}

/**
 * Unvalidated read — returns the parsed JSON as-is, or null if the file is missing or isn't
 * valid JSON. Used by detect_ai_dir/upgrade_ai_dir to distinguish "ours, but an older schema
 * version" (still worth reading) from "not recognizable at all" (readManifest would throw for
 * both cases, which loses that distinction).
 */
export function readManifestRaw(repoRoot: string): unknown | null {
  const path = join(repoRoot, SETUP_MANIFEST);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function writeManifest(repoRoot: string, manifest: SetupManifest): void {
  const path = join(repoRoot, SETUP_MANIFEST);
  ManifestSchema.parse(manifest);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}
