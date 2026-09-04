import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { PlanStatus, planStatusDir } from "./paths.js";

export const PlanStatusSchema = z.enum(["draft", "active", "completed"]);

export const PlanMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  description: z.string(),
  ticket_key: z.string().nullable(),
  status: PlanStatusSchema,
  created_by: z.string(),
  approved_at: z.string().nullable(),
  updated_at: z.string(),
});

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;

export interface Plan {
  meta: PlanMetadata;
  content: string;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Filename (no directory) — same ticket-prefix convention as evidenceFilename in evidence.ts. */
export function planFilename(meta: Pick<PlanMetadata, "id">): string {
  return `${meta.id}.md`;
}

function metaPath(filename: string): string {
  return `${filename}.meta.json`;
}

function uniqueId(repoRoot: string, date: string, slug: string, ticketKey: string | null): string {
  const base = ticketKey ? `${ticketKey}-${date}-${slug}` : `${date}-${slug}`;
  const taken = new Set(listAllFilenames(repoRoot));
  if (!taken.has(`${base}.md`)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}.md`)) n++;
  return `${base}-${n}`;
}

function listAllFilenames(repoRoot: string): string[] {
  const statuses: PlanStatus[] = ["draft", "active", "completed"];
  return statuses.flatMap((s) => {
    const dir = join(repoRoot, planStatusDir(s));
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith(".md"));
  });
}

/** Writes plan content + sidecar to disk for the given metadata (used by writePlan and movePlan). */
function writePlanFiles(repoRoot: string, meta: PlanMetadata, content: string): string {
  const filename = planFilename(meta);
  const dir = join(repoRoot, planStatusDir(meta.status));
  mkdirSync(dir, { recursive: true });
  const contentPath = join(dir, filename);
  writeFileSync(contentPath, content, "utf-8");
  writeFileSync(join(dir, metaPath(filename)), JSON.stringify(meta, null, 2) + "\n", "utf-8");
  return contentPath;
}

/**
 * Creates a new plan (status comes from the caller-supplied meta, typically "draft") and returns
 * the relative path written. Handles filename collisions by appending -2, -3, ...
 */
export function writePlan(
  repoRoot: string,
  input: Omit<PlanMetadata, "id" | "updated_at">,
  content: string
): { relPath: string; meta: PlanMetadata } {
  const id = uniqueId(repoRoot, input.date.slice(0, 10), slugify(input.title), input.ticket_key);
  const meta: PlanMetadata = { ...input, id, updated_at: new Date().toISOString() };
  PlanMetadataSchema.parse(meta);
  const relPath = writePlanFiles(repoRoot, meta, content);
  return { relPath, meta };
}

export function readPlan(repoRoot: string, status: PlanStatus, filename: string): Plan | null {
  const dir = join(repoRoot, planStatusDir(status));
  const contentPath = join(dir, filename);
  const metaFilePath = join(dir, metaPath(filename));
  if (!existsSync(contentPath) || !existsSync(metaFilePath)) return null;
  return {
    content: readFileSync(contentPath, "utf-8"),
    meta: PlanMetadataSchema.parse(JSON.parse(readFileSync(metaFilePath, "utf-8"))),
  };
}

export function listPlans(repoRoot: string, status?: PlanStatus): Plan[] {
  const statuses: PlanStatus[] = status ? [status] : ["draft", "active", "completed"];
  return statuses.flatMap((s) => {
    const dir = join(repoRoot, planStatusDir(s));
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => readPlan(repoRoot, s, f))
      .filter((p): p is Plan => p !== null);
  });
}

export function movePlan(repoRoot: string, id: string, from: PlanStatus, to: PlanStatus): Plan {
  const filename = `${id}.md`;
  const plan = readPlan(repoRoot, from, filename);
  if (!plan) throw new Error(`no plan found: ${id} in ${from}`);

  const now = new Date().toISOString();
  const meta: PlanMetadata = {
    ...plan.meta,
    status: to,
    updated_at: now,
    approved_at: plan.meta.approved_at ?? (to === "active" ? now : null),
  };

  const fromDir = join(repoRoot, planStatusDir(from));
  unlinkSync(join(fromDir, filename));
  unlinkSync(join(fromDir, metaPath(filename)));
  writePlanFiles(repoRoot, meta, plan.content);

  return { meta, content: plan.content };
}
