import { join } from "node:path";

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

export function resolveAiDir(repoRoot: string): string {
  return join(repoRoot, AI_DIR);
}
