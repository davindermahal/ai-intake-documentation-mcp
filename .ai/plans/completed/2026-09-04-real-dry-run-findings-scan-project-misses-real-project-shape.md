# Real dry-run findings: scan_project misses real project shapes

## What was done

Ran the actual documentation-mcp tools (not synthetic scratch dirs) against two real, local
projects outside this repo (kept generic here — see the note on this at the end).

1. **A real Python CLI project** — copied to a scratch dir (never touched the live project), full
   flow: detect_ai_dir -> init_ai_scaffold -> scan_project -> record_evidence (several real
   guardrail rules quoted from its own agent-instructions file) -> list_evidence ->
   write_context_chunk -> write_doc -> get_setup_status. Every step succeeded; counters and
   doc_index updated correctly; real punctuation-heavy text (em dashes, tildes, apostrophes)
   round-tripped through JSON with no issues.
2. **A real multi-service PHP/JS project** — read-only: called the pure scanProject() function
   directly against the live project (no init, no writes — that function has no side effects).
   Confirmed zero changes afterward (no `.ai/` created, git status clean).

## Findings

### 1. [High] scan_project only checked the repo root — missed subdirectory manifests entirely

Confirmed on both real projects:
- The Python project's actual package lived one directory below root, with its manifest file
  alongside it — invisible to scan_project. Result: `manifest_files: []` for a real, working
  project.
- The PHP/JS project had independent frontend/api/admin subprojects, each with its own manifest
  file, none at the repository root. All invisible. Result: `manifest_files: []` for a
  substantial real project, despite a root-level `docker-compose.yml` being detected correctly
  (it happens to sit at root).

This isn't an edge case — backend/frontend splits, src-layouts, and monorepo shapes are common.
scan_project's core value proposition (mechanically detecting what a project is) silently failed
for any project shaped this way, while looking like it succeeded (empty array, no error).

**Fixed:** manifest files and infra signals are now searched root + 2 directories deep, skipping
dependency/build/VCS/IDE directories. CI config deliberately stays root-only (GitHub Actions/
GitLab CI are read only from repo root by those tools, so depth-searching there would never find
anything real). Matches are now reported as repo-root-relative paths, not bare filenames, since
the same filename can legitimately appear more than once.

### 2. [High] existing_docs missed AI-agent-instruction files — including one sitting right at the project root

`existing_docs` only checked `README*`/`CONTRIBUTING*` prefixes. The Python project had a real,
substantial agent-instructions file at its root — containing exactly the kind of
guardrails/business-rules content this tool exists to capture (see the rules recorded as evidence
above) — and scan_project didn't see it. The same blind spot almost certainly applied to other
increasingly-common agent-instruction conventions.

This was the most on-the-nose miss of the whole dry run: a tool whose purpose is producing
AI-agent context failed to notice another AI-agent-context file sitting at the project root.

**Fixed:** added a new `existing_agent_docs` field (root-only, same reasoning as README) checking
`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, and `.github/copilot-instructions.md`. Kept separate
from `existing_docs` rather than merged in, since "agent context already exists" is a
meaningfully different signal from "human docs exist."

### 3. [Medium] evidence's source enum had no category for "quoted from the project's own existing docs"

Recording the agent-instructions guardrails as evidence required picking a source value from
`human | agent-inferred | legacy-doc`. None fit cleanly: `legacy-doc` is specifically for content
ingested via `apply_ai_dir_migration`'s non-conformant-`.ai/` flow; `agent-inferred` implies the
agent is inferring/observing something, not directly quoting a source the project already wrote
down. Used `agent-inferred` as the closest fit at the time, but it undersold that this evidence
was a direct citation of existing project documentation, not an inference.

**Fixed:** added a fourth source value, `existing-docs`, distinct from `legacy-doc`
(migration-specific) and `agent-inferred` (genuine inference/observation).

### Not a finding — worked correctly

- `git_sha` correctly returned `null` for the Python project (a real repo with zero commits at
  the time) without erroring anywhere downstream.
- `git_sha` and `infra_signals` (docker-compose.yml) both correctly detected on the PHP/JS
  project.
- All write/record tools handled real-world text cleanly — no escaping or serialization issues.

## Resolution

All three findings fixed in `scanProject.ts` and `evidence.ts`'s `EvidenceSourceSchema`. Verified
via a new synthetic scratch-repo test (a frontend/api/services layout plus a root-level
`AGENTS.md`, mirroring the real shapes found above without needing to touch either real project
again) — all checks pass, and all prior smoke tests (Phase 1, Phase 2, plans, upgrade) still pass
unmodified.

## Note on this plan's own history

The original version of this plan (while in `draft`) named the two specific personal project
directories used for the dry run and quoted a couple of their internal filenames. Since this repo
is intended to eventually be pushed to a public git repo, that content was rewritten before moving
to `completed` to remove anything identifying — the technical substance of each finding is
unchanged, only the specific project names/paths and internal filenames were generalized.
