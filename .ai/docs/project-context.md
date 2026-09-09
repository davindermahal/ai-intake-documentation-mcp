# Project context

## What this is

`ai-intake-documentation-mcp` is an MCP server that onboards a codebase for AI-agent-assisted
development. Pointed at a project, it:

1. Scans the repo mechanically (manifest files, CI config, infra signals, existing docs — human
   and AI-agent-instruction docs alike), searching subdirectories as well as root.
2. Surfaces the questions only a human can answer — purpose, target users, success criteria,
   hard constraints — rather than guessing at them.
3. Maintains living documentation under `.ai/` built from an append-only evidence archive, so
   both humans and AI coding agents have reliable context to work from, and every fact is
   traceable back to where it came from.

The whole flow above is also packaged as a single `start_documentation` MCP prompt (in Claude
Code, the slash command `/mcp__documentation-mcp__start_documentation`), so a caller doesn't need
to know the tool call order by heart to kick off or resume onboarding. A second prompt,
`document_area` (optionally taking an `area` argument), documents one directory/module/feature at
a time instead of the whole repo — no drift check, no whole-repo scan, and its follow-up questions
are derived from what the agent actually reads in that area rather than a fixed list. It's meant
for the common case once a repo is already onboarded: documenting it incrementally, area by area.

## Why it exists

READMEs go stale, tribal knowledge lives in people's heads, and hand-maintained docs drift from
what the code actually does — which leaves both new contributors and AI coding agents working
from unreliable context. This project's answer is to never guess at what only a human knows, and
to make every documented fact traceable back to an append-only evidence entry, so staleness is
detectable (`check_drift`, `needs_resync`) instead of silent.

## Who it's for

- Developers/teams who want reliable AI-agent context for their own codebase, used directly from
  any MCP client (Claude Code, Gemini CLI, or others).
- The author (davindermahal), dogfooding it on this repo itself — the primary real-world usage
  so far, recorded under `.ai/evidence/onboarding/`.
- Downstream, `ai-intake-mcp` (a separate Jira ticket-execution harness) as a planned future
  consumer — reading `.ai/context/` during planning and calling `record_evidence` during
  implementation, once that integration lands (not yet built).

## What "done" looks like

There's no single "done" — this is an ongoing tool, not a one-shot deliverable. Two different
senses of success:

- **Per release milestone**: tracked in "Current status" below, and via `.ai/plans/`.
- **Per onboarding run**: a caller runs `start_documentation` once and gets accurate,
  evidence-traceable docs without needing to memorize tool call order, and can later detect
  staleness via `check_drift` (code has moved past the last scan) and `needs_resync` (evidence
  has moved past the last doc synthesis) — two separate, independently-tracked concerns.

## Constraints

Architectural invariants rather than compliance/performance/security requirements (this is a
local, stdio-transport dev tool — it never handles end-user data):

- Never write or touch `.ai/intake-mcp.json` — owned exclusively by `ai-intake-mcp`.
- Evidence entries (`.ai/evidence/**/*.json`) are append-only and never rewritten in place.
- The `.ai/` file layout must never drift between this server and `ai-intake-mcp` — enforced by
  both depending on the shared `@davindermahal/context-schema` package rather than duplicating
  types.
- Migrating pre-existing/foreign `.ai/` content must be non-destructive: copy-first, originals
  kept unless `remove_originals` is explicitly set.

## Deployment

No infrastructure: both packages are published to npm (`@davindermahal/context-schema`,
`@davindermahal/documentation-mcp`, currently `0.1.1`) and run as a local stdio-transport MCP
server subprocess, launched from an MCP client's own config (`npx -y
@davindermahal/documentation-mcp`). Nothing to provision or host — CI
(`.github/workflows/ci.yml`) only builds and tests on push/PR to `main`; it doesn't deploy
anything.

## Why it's separate from `ai-intake-mcp`

`ai-intake-mcp` is an existing, separately-repo'd Jira ticket-execution harness (fetches/comments
on/transitions tickets, creates worktrees, implements tickets, gates plans for approval). It
already auto-writes `.ai/intake-mcp.json` on first tracker use.

This project deliberately stays a separate server rather than merging into it:

- **Different lifecycle** — onboarding/doc-maintenance is occasional; ticket execution is
  continuous.
- **Different blast radius** — `implement_ticket` touches git worktrees and writes code;
  this server only reads code and writes markdown/JSON under `.ai/`.
- **Independent value** — someone may want good AI-agent context for a project without wanting
  Jira ticket automation at all.

They're kept interoperable through a shared schema package (`@davindermahal/context-schema`) rather
than shared runtime code, so the `.ai/` file layout can't drift between the two servers even
though they're developed and released independently.

## Cross-agent goal

Both this server and `ai-intake-mcp` are meant to work identically from Claude Code, Gemini CLI,
and any other MCP-capable client — achieved by publishing as ordinary npm packages and relying on
`npx -y @scope/pkg` as the launch command, since that exact command works verbatim in both
clients' config files.

## Current status

Built and committed: `ensure_ai_dir` (a single tool that detects `.ai/`'s state and, for the two
states that need no human input, fixes it in the same call — absent → scaffold, outdated →
migrate/backfill; non-conformant only reports what it found), `get_setup_status`, `scan_project`,
`record_evidence`, the legacy-`.ai/`-migration flow (`apply_ai_dir_migration`, the one remaining
step that still needs an explicit human `confirm: true`), evidence synthesis (`list_evidence` /
`write_doc` / `write_context_chunk`), drift detection (`check_drift`), the plans lifecycle
(`write_plan` / `list_plans` / `transition_plan`), and the `start_documentation` prompt that walks
a calling agent through the whole onboarding flow in one go. `ensure_ai_dir` used to be four
separate tools (`detect_ai_dir`/`init_ai_scaffold`/`upgrade_ai_dir`/`propose_ai_dir_migration`)
before being folded down to reduce the tool count exposed to a calling agent. `scan_project` has
since been hardened based on real dry-run testing against two real, external projects (see
`.ai/plans/completed/`): it now searches manifest/infra files up to 2 directories deep and detects
existing AI-agent-instruction docs (`AGENTS.md`/`CLAUDE.md`/etc.), not just README/CONTRIBUTING.

Both `@davindermahal/context-schema` and `@davindermahal/documentation-mcp` are packaged for real
distribution (`repository`/`publishConfig`/`files` set, per-package READMEs written) and have been
published to npm at `0.1.1`.

Still open: an automated test suite + CI for this repo (beyond the tests that exist per-package),
and filing the `ai-intake-harness` integration ticket externally. See `.ai/plans/active/` for
current tracked work.

See `.ai/evidence/onboarding/` for the full founding-conversation record this was originally
built from.
