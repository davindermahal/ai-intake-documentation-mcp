# Project context

## What this is

`ai-intake-documentation-mcp` is an MCP server that onboards a codebase for AI-agent-assisted
development. Pointed at a project, it:

1. Scans the repo mechanically (manifest files, CI config, infra signals, existing docs).
2. Surfaces the questions only a human can answer — purpose, target users, success criteria,
   hard constraints — rather than guessing at them.
3. Maintains living documentation under `.ai/` built from an append-only evidence archive, so
   both humans and AI coding agents have reliable context to work from, and every fact is
   traceable back to where it came from.

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

They're kept interoperable through a shared schema package (`@ai-intake/context-schema`) rather
than shared runtime code, so the `.ai/` file layout can't drift between the two servers even
though they're developed and released independently.

## Cross-agent goal

Both this server and `ai-intake-mcp` are meant to work identically from Claude Code, Gemini CLI,
and any other MCP-capable client — achieved by publishing as ordinary npm packages and relying on
`npx -y @scope/pkg` as the launch command, since that exact command works verbatim in both
clients' config files.

## Current status

Phase 1 (this build): `detect_ai_dir`, `init_ai_scaffold`, `get_setup_status`, `scan_project`,
`record_evidence`. Deliberately not yet built: the legacy-`.ai/`-content migration flow, the
doc-synthesis tools that turn evidence into polished `docs/`/`context/` content, and
`check_drift`. See `.ai/evidence/onboarding/` for the full founding-conversation record this was
built from.
