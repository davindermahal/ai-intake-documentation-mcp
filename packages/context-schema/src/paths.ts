import { isAbsolute, join, relative, resolve } from "node:path";

/** Canonical `.ai/` layout. Single source of truth for both MCP servers. */
export const AI_DIR = ".ai";

/** Owned by ai-intake-mcp — written on first tracker use. We only read it, never write it. */
export const INTAKE_CONFIG = join(AI_DIR, "intake-mcp.json");

/** Owned by this project's setup/documentation tooling. */
export const SETUP_MANIFEST = join(AI_DIR, "setup-mcp.json");

export const CACHE_DIR = join(AI_DIR, "cache");
export const LAST_SCAN_CACHE = join(CACHE_DIR, "last-scan.json");

export const EVIDENCE_DIR = join(AI_DIR, "evidence");
export const EVIDENCE_TICKETS_DIR = join(EVIDENCE_DIR, "tickets");
export const EVIDENCE_ONBOARDING_DIR = join(EVIDENCE_DIR, "onboarding");

export const DOCS_DIR = join(AI_DIR, "docs");
export const CONTEXT_DIR = join(AI_DIR, "context");

export const PLANS_DIR = join(AI_DIR, "plans");
export const PLANS_DRAFT_DIR = join(PLANS_DIR, "draft");
export const PLANS_ACTIVE_DIR = join(PLANS_DIR, "active");
export const PLANS_COMPLETED_DIR = join(PLANS_DIR, "completed");

export function resolveAiDir(repoRoot: string): string {
  return join(repoRoot, AI_DIR);
}

/**
 * Joins `relPath` onto `baseDir` and rejects the result if it would land outside `baseDir`
 * (via `..` segments or an absolute path). Callers that accept a caller-supplied relative path
 * (e.g. an MCP tool's `path` argument) must route it through this instead of a bare `join`.
 */
export function resolveWithinDir(baseDir: string, relPath: string): string {
  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(resolvedBase, relPath);
  const rel = relative(resolvedBase, resolvedPath);
  if (rel === ".." || rel.startsWith(`..${"/"}`) || isAbsolute(rel)) {
    throw new Error(`path escapes base directory: ${relPath}`);
  }
  return resolvedPath;
}

/**
 * Every directory ensure_ai_dir (and apply_ai_dir_migration, which scaffolds after ingesting
 * legacy content) must create. Single source of truth so the two never drift apart.
 */
export const SCAFFOLD_DIRS = [
  DOCS_DIR,
  CONTEXT_DIR,
  EVIDENCE_TICKETS_DIR,
  EVIDENCE_ONBOARDING_DIR,
  CACHE_DIR,
  PLANS_DRAFT_DIR,
  PLANS_ACTIVE_DIR,
  PLANS_COMPLETED_DIR,
];

export type PlanStatus = "draft" | "active" | "completed";

export function planStatusDir(status: PlanStatus): string {
  switch (status) {
    case "draft":
      return PLANS_DRAFT_DIR;
    case "active":
      return PLANS_ACTIVE_DIR;
    case "completed":
      return PLANS_COMPLETED_DIR;
  }
}
