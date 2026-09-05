# Architecture

## Layout

```
ai-intake-documentation-mcp/       npm workspaces monorepo
  packages/
    context-schema/                 @davindermahal/context-schema
    documentation-mcp/               @davindermahal/documentation-mcp
  .ai/                               this repo's own onboarding output (dogfooded)
```

Monorepo is a dev-convenience choice, not a distribution one: a change touching the schema and
its one consumer here is one commit instead of two coordinated releases. Each package still
publishes to npm independently — a user installing `@davindermahal/documentation-mcp` never touches
the monorepo or the schema package's source directly.

## `@davindermahal/context-schema`

Pure data layer: path constants, TypeScript types, zod validators, and thin fs read/write helpers
for the `.ai/` directory (`paths.ts`, `manifest.ts`, `evidence.ts`, `context.ts`, `plans.ts`).
Deliberately excludes Jira/git/LLM logic and MCP tool definitions — both servers depend on it, so
it stays boring and side-effect-free by design rather than by discipline. This is also why plans
live here rather than only in `documentation-mcp`: `ai-intake-harness` (a separate MCP server)
must be able to write conformant plan files too, once its integration lands.

## `@davindermahal/documentation-mcp`

The MCP server itself (stdio transport, `@modelcontextprotocol/server` v2). Each tool is a plain
`{ name, description, inputSchema, handler }` object under `src/tools/`, registered in
`src/index.ts`. Tool call order encodes the actual dependency graph:

`detect_ai_dir` → `init_ai_scaffold` (refuses on non-conformant; non-conformant instead goes
`propose_ai_dir_migration` → `apply_ai_dir_migration`) → `scan_project` / `record_evidence` (both
require an initialized manifest) → `list_evidence` → `write_doc` / `write_context_chunk` →
`get_setup_status` / `check_drift` (both read the manifest back). Independently: `write_plan` →
`list_plans` / `transition_plan` for the plans lifecycle (see below) — not part of the
evidence/synthesis chain, since a plan isn't derived from evidence the way docs/context are.

`src/git.ts` holds `currentGitSha`/`changedFilesSince` (used by `scan_project` and `check_drift`;
`execFileSync` with an argv array, not shell-interpolated strings, since `changedFilesSince`'s sha
argument ultimately comes from a JSON file on disk). `src/synthesis.ts` holds the bookkeeping
shared by `write_doc`/`write_context_chunk`: record the path in `doc_index`, mark any referenced
evidence synthesized, and recompute the manifest's pending counters from actual unsynthesized
evidence rather than incrementing/decrementing by hand.

## `.ai/` directory schema

```
.ai/
  setup-mcp.json        # manifest: schema_version, last_scan_sha, last_synthesis_at,
                          #  evidence_pending_count, evidence_pending_corrections,
                          #  needs_resync, doc_index
  intake-mcp.json        # NOT ours — owned by ai-intake-mcp, we only ever read it
  cache/
    last-scan.json        # overwritten each scan_project run — a cache, not an archive
  evidence/
    onboarding/*.json       # human/legacy evidence not tied to a ticket
    tickets/*.json           # evidence recorded during ai-intake-mcp ticket work
  docs/                     # human-readable — narrative, rationale, diagrams
  context/                  # agent-facing — distilled, chunked by area
    <name>.md                 # plain markdown content
    <name>.md.meta.json         # sidecar: id, title, area[], risk?, source_evidence_ids[]
  plans/                    # required for all Jira ticket work and all planning work
    draft/                    # proposed, not yet approved
    active/                    # approved, currently governing work
    completed/                  # done
```

Evidence entries are append-only JSON (not markdown+frontmatter — simpler to validate reliably,
and evidence is an audit trail, not something meant to be read as prose). `docs/` and `context/`
stay markdown since both humans and LLMs read that well; the split between them is about content
strategy (narrative vs. distilled/chunked-for-retrieval), not file format. Context chunks carry
their retrieval metadata in a `.meta.json` sidecar rather than markdown frontmatter, for the same
reason evidence is JSON — no YAML parser needed, and the chunk itself stays plain, directly
readable markdown.

## Migration (non-conformant `.ai/`)

`propose_ai_dir_migration` never classifies content — it just lists what's there. Classification
(deciding what becomes a doc vs. a context chunk) is an interpretive step, so it's deferred to the
same evidence → `write_doc`/`write_context_chunk` flow as everything else: `apply_ai_dir_migration`
ingests every file under a non-conformant `.ai/` as a `source: "legacy-doc"`, `type: "raw-note"`
evidence entry, then creates the scaffold. Originals are left on disk unless `remove_originals` is
explicitly set — copy-first, delete-only-on-request, so a wrong ingestion never loses the original.

## Synthesis

`list_evidence` → the calling agent reads it and authors content → `write_doc` /
`write_context_chunk` commits it. Neither tool diffs or merges — full-file replacement, since the
agent already has the current content to work from if it wants it. Passing `source_evidence_ids`
marks those entries synthesized and recomputes `evidence_pending_count` /
`evidence_pending_corrections` / `needs_resync` from the actual remaining unsynthesized set.

## Plans

Every filename is `<date>-<slug>.md` (or `<ticket_key>-<date>-<slug>.md` when tied to a ticket) —
same ticket-prefix convention as evidence filenames, and a `.md.meta.json` sidecar for the same
reason context chunks have one. A plan's status is a *place*, not just a field: `transition_plan`
physically moves the file between `draft/`/`active/`/`completed/`, so `ls .ai/plans/active/` alone
is a truthful answer to "what's currently governing work" without opening every file. `approved_at`
is set automatically the first time a plan reaches `active` and never overwritten after — it's an
approval timestamp, not a "last time this was active" timestamp. No manifest tracking for plans
(unlike `doc_index` for docs/context) — the three directories are already a complete index, and a
manifest schema change would mean a migration for every existing `.ai/setup-mcp.json`.

Transitions are intentionally unrestricted (any status to any status) — a plan getting sent back
to draft, or a completed one reopened, are both real things that happen; enforcing a strict state
machine here would be a rule nobody asked for.

## `detect_ai_dir`'s four states, and fixing drift with `upgrade_ai_dir`

`detect_ai_dir` classifies a repo's `.ai/` into one of four states, each with exactly one correct
remedy:

| Status | Meaning | Fix |
|---|---|---|
| `absent` | No `.ai/` at all | `init_ai_scaffold` |
| `conformant` | Manifest is current *and* every `SCAFFOLD_DIRS` entry exists | nothing |
| `outdated` | Manifest has a `schema_version` (recognizably ours) but it's stale, and/or some current-version directories are missing | `upgrade_ai_dir` |
| `non-conformant` | No recognizable manifest at all — truly foreign content | `propose_ai_dir_migration` → `apply_ai_dir_migration` |

The `schema_version` field is what separates `outdated` from `non-conformant`: its presence alone
means the file is recognizably ours, however old, and deserves an in-place upgrade rather than
full re-ingestion as evidence. `conformant` isn't just "the manifest parses" — it also requires
every `SCAFFOLD_DIRS` entry to exist, since a manifest can be perfectly valid while the directory
structure it describes is incomplete (this repo's own `.ai/` was missing `plans/{draft,active,completed}`
for a time, with a fully-valid manifest, and nothing detected it before this existed).

`upgrade_ai_dir` has two independent jobs, run together: migrate the manifest through
`MANIFEST_MIGRATIONS` (a from→to step chain in `context-schema/src/migrations.ts`, empty today —
only `0.1.0` has ever existed) to the current schema version, and unconditionally backfill any
`SCAFFOLD_DIRS` entry that's missing. The directory backfill needs no per-version logic at all:
`SCAFFOLD_DIRS` already lists the complete current set, so "create whatever's missing" is
correct regardless of which old version is being upgraded from. If a manifest's `schema_version`
has no path to current (no migration step covers it), `upgrade_ai_dir` fails with a clear error
naming the missing step rather than guessing or silently leaving the manifest as-is.

## `scan_project`'s search depth

Manifest files and infra signals (Dockerfile/docker-compose) are searched root + 2 directories
deep, skipping dependency/build/VCS/IDE directories (`SKIP_DIRS` in `scanProject.ts`) — real
projects commonly split into subprojects (a frontend/api/admin layout, a services/ directory of
independent services) with no manifest at the actual repo root, which a root-only check silently
misses (an empty array, not an error — the worst kind of gap, since it looks like success).
Matches are reported as paths relative to repo root, not bare filenames, since the same filename
can legitimately appear more than once.

**CI config stays root-only, deliberately** — GitHub Actions and GitLab CI are both read only from
the repo root by those tools themselves, so depth-searching for `.github/workflows` or
`.gitlab-ci.yml` would never find anything real; it would just cost more without adding value.

`existing_agent_docs` (`AGENTS.md`/`CLAUDE.md`/`.cursorrules`/`.github/copilot-instructions.md`)
is also root-only, same reasoning as README/CONTRIBUTING — these are a root-level convention, not
a per-subproject one. Kept as its own field rather than merged into `existing_docs`, since
"agent-context already exists" is a meaningfully different signal from "human docs exist."

## Why `scan_project` and `record_evidence` require `init_ai_scaffold` first

Both write into `.ai/` (a cache file, or a new evidence entry + manifest update). Letting them run
before `.ai/` exists would mean the first thing to touch a fresh repo silently creates a
non-conformant `.ai/` directory that `detect_ai_dir` would then flag as a conflict — so the
manifest's existence is the gate, not an inconvenience.
