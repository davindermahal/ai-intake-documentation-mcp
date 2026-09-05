import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { LAST_SCAN_CACHE, readManifest, writeManifest } from "@davindermahal/context-schema";
import { currentGitSha } from "../git.js";

const MANIFEST_FILES = [
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
];

const INFRA_SIGNALS = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "terraform", "k8s", "kubernetes"];

const AGENT_DOC_FILES = ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md"];

/** Directories never worth descending into: dependency trees, build output, VCS/IDE metadata. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "target",
  ".next",
  "out",
  "coverage",
  ".ai",
  ".idea",
  ".vscode",
]);

function findExisting(repoRoot: string, candidates: string[]): string[] {
  return candidates.filter((c) => existsSync(join(repoRoot, c)));
}

/**
 * Root-only checks (findExisting) miss real subprojects — e.g. a frontend/api/admin split each
 * with their own package manifest, none at repo root. This walks root + maxDepth levels of
 * subdirectories, skipping SKIP_DIRS, and returns matches as paths relative to repo root (not
 * bare filenames, since the same filename can now legitimately appear more than once).
 */
function findExistingDeep(repoRoot: string, candidates: string[], maxDepth: number): string[] {
  const found: string[] = [];

  function walk(dir: string, relDir: string, depth: number) {
    for (const candidate of candidates) {
      if (existsSync(join(dir, candidate))) {
        found.push(relDir ? join(relDir, candidate) : candidate);
      }
    }
    if (depth >= maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full, relDir ? join(relDir, entry) : entry, depth + 1);
    }
  }

  walk(repoRoot, "", 0);
  return found;
}

function findByPrefix(repoRoot: string, prefixes: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(repoRoot);
  } catch {
    return [];
  }
  return entries.filter((e) => prefixes.some((p) => e.toLowerCase().startsWith(p.toLowerCase())));
}

export interface ScanResult {
  git_sha: string | null;
  manifest_files: string[];
  ci_config: string[];
  infra_signals: string[];
  existing_docs: string[];
  existing_agent_docs: string[];
  open_questions: string[];
}

const SCAN_DEPTH = 2;

export function scanProject(repoRoot: string): ScanResult {
  const manifestFiles = findExistingDeep(repoRoot, MANIFEST_FILES, SCAN_DEPTH);

  // CI config is deliberately root-only: GitHub Actions / GitLab CI are only ever read from the
  // repo root by those tools, so depth-searching for them would find nothing real.
  const ciConfig: string[] = [];
  if (existsSync(join(repoRoot, ".github", "workflows"))) ciConfig.push(".github/workflows");
  if (existsSync(join(repoRoot, ".gitlab-ci.yml"))) ciConfig.push(".gitlab-ci.yml");

  const infraSignals = findExistingDeep(repoRoot, INFRA_SIGNALS, SCAN_DEPTH);
  const existingDocs = findByPrefix(repoRoot, ["README", "CONTRIBUTING"]);
  const existingAgentDocs = findExisting(repoRoot, AGENT_DOC_FILES);

  const openQuestions = [
    "What is the primary purpose of this project, and what business problem does it solve?",
    "Who are the target users or stakeholders?",
    "What does 'done'/success look like for this project?",
    "Are there hard constraints (compliance, performance, security) that any change must respect?",
  ];
  if (existingDocs.length === 0) openQuestions.push("No README found — is there existing documentation elsewhere?");
  if (ciConfig.length === 0) openQuestions.push("No CI configuration detected — is testing/deployment automated elsewhere?");
  if (infraSignals.length === 0) openQuestions.push("No infra/deployment config found — how is this deployed?");

  return {
    git_sha: currentGitSha(repoRoot),
    manifest_files: manifestFiles,
    ci_config: ciConfig,
    infra_signals: infraSignals,
    existing_docs: existingDocs,
    existing_agent_docs: existingAgentDocs,
    open_questions: openQuestions,
  };
}

export const scanProjectTool = {
  name: "scan_project",
  description:
    "Read-only mechanical scan of the repo: detects manifest files and infra signals up to 2 " +
    "directories deep (catches subprojects like a frontend/api split, not just repo root), " +
    "root-only CI config, existing human-facing docs (README/CONTRIBUTING), existing AI-agent " +
    "docs (AGENTS.md/CLAUDE.md/.cursorrules/.github/copilot-instructions.md), plus a list of open " +
    "questions only a human can answer (purpose, users, constraints). Writes a cache snapshot to " +
    ".ai/cache/last-scan.json (overwritten each run — a cache, not an archive) and updates the " +
    "manifest's last_scan_sha. Requires .ai/ to already be initialized (run init_ai_scaffold first).",
  inputSchema: z.object({
    repo_root: z.string().optional().describe("Absolute path to the repo root. Defaults to the server's cwd."),
  }),
  handler: async ({ repo_root }: { repo_root?: string }) => {
    const repoRoot = repo_root ?? process.cwd();
    const manifest = readManifest(repoRoot);
    if (!manifest) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "not-initialized: run init_ai_scaffold first" }, null, 2) },
        ],
        isError: true,
      };
    }

    const result = scanProject(repoRoot);

    const cachePath = join(repoRoot, LAST_SCAN_CACHE);
    mkdirSync(join(cachePath, ".."), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(result, null, 2) + "\n", "utf-8");

    manifest.last_scan_sha = result.git_sha;
    writeManifest(repoRoot, manifest);

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
};
