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
to know the tool call order by heart to kick off or resume onboarding.

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

Built and committed: `detect_ai_dir`, `init_ai_scaffold`, `get_setup_status`, `scan_project`,
`record_evidence`, the legacy-`.ai/`-migration flow (`propose_ai_dir_migration` /
`apply_ai_dir_migration`), evidence synthesis (`list_evidence` / `write_doc` /
`write_context_chunk`), drift detection (`check_drift`), the plans lifecycle (`write_plan` /
`list_plans` / `transition_plan`), `upgrade_ai_dir` for schema/scaffold drift, and the
`start_documentation` prompt that walks a calling agent through the whole onboarding flow in one
call. `scan_project` has since been hardened based on real dry-run testing against two real,
external projects (see `.ai/plans/completed/`): it now searches manifest/infra files up to 2
directories deep and detects existing AI-agent-instruction docs (`AGENTS.md`/`CLAUDE.md`/etc.),
not just README/CONTRIBUTING.

Both `@davindermahal/context-schema` and `@davindermahal/documentation-mcp` are packaged for real
distribution (`repository`/`publishConfig`/`files` set, per-package READMEs written) and have been
published to npm at `0.1.1`.

Still open: an automated test suite + CI for this repo (beyond the tests that exist per-package),
and filing the `ai-intake-harness` integration ticket externally. See `.ai/plans/active/` for
current tracked work.

See `.ai/evidence/onboarding/` for the full founding-conversation record this was originally
built from.
