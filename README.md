# ai-intake-documentation-mcp

An MCP server that onboards a codebase for AI-agent-assisted development: it scans the project,
asks the questions only a human can answer (purpose, target users, constraints), and maintains
living documentation under `.ai/` — one set for humans, one distilled for AI coding agents — built
from an append-only evidence archive so nothing is lost and every fact is traceable.

Works with Claude Code, Gemini CLI, or any other MCP-capable client, and alongside (but
independently of) [`ai-intake-mcp`](#relationship-to-ai-intake-mcp), a separate Jira
ticket-execution harness.

## Status

**Phase 1 + Phase 2 done**, plus a plans lifecycle: scan a repo, detect/initialize `.ai/`, record
evidence, ingest pre-existing/legacy `.ai/` content, fold evidence into polished docs, detect
drift, and track plans through draft/active/completed. See
[`.ai/docs/project-context.md`](.ai/docs/project-context.md) for the full picture and
[`.ai/evidence/onboarding/`](.ai/evidence/onboarding/) for the design record this was built from.

**All Jira ticket work and all planning work must have a plan file under `.ai/plans/`** — see the
[Tools](#tools) table below.

## Why documentation lives in two places

- **`.ai/docs/`** — narrative, for a human building a mental model: rationale, history, "why we
  chose X over Y."
- **`.ai/context/`** — distilled, for an AI agent: terse factual statements and business rules,
  chunked so a harness can load only what's relevant to a given task instead of everything.

Both are regenerated from **`.ai/evidence/`**, an append-only archive of raw human answers, agent
discoveries, and corrections — the evidence is the actual source of truth; the docs are a view
onto it. See [`.ai/docs/architecture.md`](.ai/docs/architecture.md) for the full schema.

## Repo structure

```
packages/
  context-schema/       @davindermahal/context-schema — shared .ai/ types, validators, fs helpers
  documentation-mcp/     @davindermahal/documentation-mcp — the MCP server
.ai/                      this project's own onboarding output (dogfooded)
  plans/                    draft/ active/ completed/ — required for all ticket + planning work
```

A monorepo purely for development convenience (one commit can touch the schema and its consumer
together) — each package still publishes to npm independently.

## Getting started

```bash
npm install
npm run build          # builds both packages
```

Build `context-schema` before `documentation-mcp` if building manually with `tsc` instead of the
root script — the server imports the schema package's compiled output.

### Add it to an MCP client

**Claude Code** (`.mcp.json` at a repo root, or `claude mcp add`):
```json
{
  "mcpServers": {
    "documentation-mcp": {
      "command": "node",
      "args": ["path/to/ai-intake-documentation-mcp/packages/documentation-mcp/dist/index.js"]
    }
  }
}
```

**Gemini CLI** (`~/.gemini/settings.json` or `.gemini/settings.json`) uses the same
`mcpServers`/`command`/`args` shape.

This repo's own [`.mcp.json`](.mcp.json) already points at the local build, so it's usable
directly from a Claude Code session opened here. Once published to npm, `command`/`args` becomes
`npx -y @davindermahal/documentation-mcp` instead of a local path — identical config in both clients.

### Kicking off documentation

Rather than calling tools one at a time, run the `start_documentation` prompt — in Claude Code
that's the slash command `/mcp__documentation-mcp__start_documentation` (no arguments needed). It
walks the agent through the whole flow in one go: detect/initialize `.ai/`, ask what to focus the
scan on, run `scan_project`, ask you its `open_questions` (and anything else it notices missing)
instead of guessing, record your answers as evidence, and write the resulting `.ai/docs` /
`.ai/context`. Re-run it any time to pick up where you left off or after the code has moved on.

## Tools

| Tool | Does |
|---|---|
| `detect_ai_dir` | Reports `absent` / `conformant` / `outdated` (ours, but stale — fix with `upgrade_ai_dir`) / `non-conformant` (not ours at all — fix with the migration flow) for a repo's `.ai/` — read-only, always safe to call. |
| `init_ai_scaffold` | Creates `.ai/{docs,context,evidence,cache}` + a manifest. Refuses if `.ai/` already has non-conformant content. Idempotent once conformant. |
| `get_setup_status` | Reads back the manifest: last scan/synthesis time, pending evidence counts, `needs_resync`. |
| `scan_project` | Read-only repo scan: manifest files and infra signals up to 2 directories deep (catches a frontend/api-style split, not just root), root-only CI config, existing human docs (README/CONTRIBUTING) and existing AI-agent docs (`AGENTS.md`/`CLAUDE.md`/`.cursorrules`/`.github/copilot-instructions.md`) separately, plus open questions only a human can answer. Requires `.ai/` to be initialized first. |
| `record_evidence` | Appends an immutable evidence entry (`new-rule` / `correction` / `clarification` / `raw-note`; source `human` / `agent-inferred` / `legacy-doc` / `existing-docs`). A `correction` sets `needs_resync`. Requires `.ai/` to be initialized first. |
| `propose_ai_dir_migration` | Read-only. If `.ai/` is non-conformant, lists every file found under it with size — no auto-classification. |
| `apply_ai_dir_migration` | Ingests a non-conformant `.ai/`'s content as legacy evidence (`source: "legacy-doc"`), then scaffolds normally. Requires `confirm: true`; originals are kept unless `remove_originals` is set. |
| `list_evidence` | Reads back evidence entries (unsynthesized by default) for the calling agent to review before writing docs/context. |
| `write_doc` | Commits agent-authored markdown to `.ai/docs/<path>`. Marks any referenced evidence synthesized and recomputes the manifest's pending counters. |
| `write_context_chunk` | Same, to `.ai/context/<path>`, plus a `.meta.json` sidecar (title/area/risk) so a harness can retrieve chunks selectively by area. |
| `check_drift` | Compares the manifest's `last_scan_sha` to current git HEAD; returns changed files if stale. Separate concern from `needs_resync` (evidence staleness). |
| `write_plan` | Creates a plan file — **required for all Jira ticket work and all planning work**. Starts `draft` by default; filename is `<date>-<slug>.md` (or `<ticket_key>-<date>-<slug>.md`), auto-deduplicated on collision. |
| `list_plans` | Returns full plan metadata + content, optionally filtered by `status` and/or `ticket_key`. |
| `transition_plan` | Moves a plan between `draft`/`active`/`completed` — physically relocates the file, not just a status flag. Sets `approved_at` the first (and only the first) time a plan reaches `active`. |
| `upgrade_ai_dir` | Fixes an `outdated` `.ai/`: migrates the manifest through `MANIFEST_MIGRATIONS` to the current schema version, and unconditionally backfills any missing `SCAFFOLD_DIRS` directory. Refuses (pointing to the right tool) if `.ai/` is absent, already conformant, or non-conformant. |

Typical call order: `detect_ai_dir` → (`init_ai_scaffold` or, if non-conformant,
`propose_ai_dir_migration` → `apply_ai_dir_migration`) → `scan_project` → `record_evidence` (as
needed) → `list_evidence` → `write_doc` / `write_context_chunk` → `get_setup_status` /
`check_drift`. Independently, for any ticket or planning work: `write_plan` →
`transition_plan` (draft → active on approval → completed when done).

## Relationship to `ai-intake-mcp`

`ai-intake-mcp` is a separate, already-existing repo — a Jira ticket-execution harness
(`tracker_get_issue`, `implement_ticket`, `approve_plan`, `worktree_create`, etc.) that auto-writes
`.ai/intake-mcp.json` on first tracker use. This project never touches that file. The two stay
separate servers (different lifecycle, different blast radius) but share the `.ai/` schema via
`@davindermahal/context-schema`, so their file layout can't drift even though they're released
independently. The planned integration — the harness reading `.ai/context/` during planning and
calling `record_evidence` during implementation — is tracked as future work, not yet built here.

## Development

- `npm run build` — builds both packages (`tsc`).
- `npm run clean` — removes `dist/` in both packages.
- `npm test` — runs the [Vitest](https://vitest.dev) suite (`packages/*/test/**/*.test.ts`),
  covering everything the manual smoke-test scripts used to: `detect_ai_dir`/`init_ai_scaffold`
  states, `scan_project`'s depth search and `existing_agent_docs` detection, evidence recording +
  synthesis, the legacy-`.ai/` migration flow, the plans lifecycle (including the collision-suffix
  case), and `upgrade_ai_dir` (missing-directory backfill, an unmigratable `schema_version` failing
  cleanly, non-conformant repos left untouched).
- CI (`.github/workflows/ci.yml`) runs `npm run build` + `npm test` on push/PR to `main`.

## License

[MIT](LICENSE)
