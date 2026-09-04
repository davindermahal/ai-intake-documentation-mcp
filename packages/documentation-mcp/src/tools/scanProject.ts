import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { LAST_SCAN_CACHE, readManifest, writeManifest } from "@ai-intake/context-schema";
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

function findExisting(repoRoot: string, candidates: string[]): string[] {
  return candidates.filter((c) => existsSync(join(repoRoot, c)));
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
  open_questions: string[];
}

export function scanProject(repoRoot: string): ScanResult {
  const manifestFiles = findExisting(repoRoot, MANIFEST_FILES);

  const ciConfig: string[] = [];
  if (existsSync(join(repoRoot, ".github", "workflows"))) ciConfig.push(".github/workflows");
  if (existsSync(join(repoRoot, ".gitlab-ci.yml"))) ciConfig.push(".gitlab-ci.yml");

  const infraSignals = findExisting(repoRoot, INFRA_SIGNALS);
  const existingDocs = findByPrefix(repoRoot, ["README", "CONTRIBUTING"]);

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
    open_questions: openQuestions,
  };
}

export const scanProjectTool = {
  name: "scan_project",
  description:
    "Read-only mechanical scan of the repo: detects manifest files, CI config, infra signals, and " +
    "existing docs, plus a list of open questions only a human can answer (purpose, users, constraints). " +
    "Writes a cache snapshot to .ai/cache/last-scan.json (overwritten each run — a cache, not an " +
    "archive) and updates the manifest's last_scan_sha. Requires .ai/ to already be initialized " +
    "(run init_ai_scaffold first).",
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
