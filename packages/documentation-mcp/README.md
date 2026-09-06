# @davindermahal/documentation-mcp

An MCP server that onboards a codebase for AI-agent-assisted development: it scans the project,
asks the questions only a human can answer (purpose, target users, constraints), and maintains
living documentation under `.ai/` — one set for humans, one distilled for AI coding agents — built
from an append-only evidence archive so nothing is lost and every fact is traceable.

Works with Claude Code, Gemini CLI, or any other MCP-capable client.

## Install

Add it to your MCP client's config — no separate install step needed, `npx` handles it:

**Claude Code** (`.mcp.json` at a repo root, or `claude mcp add`):
```json
{
  "mcpServers": {
    "documentation-mcp": {
      "command": "npx",
      "args": ["-y", "@davindermahal/documentation-mcp"]
    }
  }
}
```

**Gemini CLI** (`~/.gemini/settings.json` or `.gemini/settings.json`) uses the same
`mcpServers`/`command`/`args` shape.

## Getting started

Run the `start_documentation` prompt to kick off (or resume) onboarding — in Claude Code that's
the slash command `/mcp__documentation-mcp__start_documentation`, no arguments required. It
directs the calling agent to detect/initialize `.ai/`, ask what you want documented, scan the
project, ask you its open questions (purpose, users, constraints, and anything else it notices
missing) instead of guessing, record your answers as evidence, and write the resulting docs. Calling
the tools below directly also works, in the order described under "Typical call order".

## Tools

| Tool | Does |
|---|---|
| `ensure_ai_dir` | Gets `.ai/` into a good state in one call: `absent` → creates the scaffold + manifest, `outdated` (ours, but stale) → migrates/backfills automatically, `conformant` → no-op. `non-conformant` (foreign content already there) is never touched automatically — returns the files found so you can ask before calling `apply_ai_dir_migration`. Always call this first. |
| `get_setup_status` | Reads back the manifest: last scan/synthesis time, pending evidence counts, `needs_resync`. |
| `scan_project` | Read-only repo scan: manifest files and infra signals up to 2 directories deep (catches a frontend/api-style split, not just root), root-only CI config, existing human docs (README/CONTRIBUTING) and existing AI-agent docs (`AGENTS.md`/`CLAUDE.md`/`.cursorrules`/`.github/copilot-instructions.md`) separately, plus open questions only a human can answer. Requires `.ai/` to be initialized first. |
| `record_evidence` | Appends an immutable evidence entry (`new-rule` / `correction` / `clarification` / `raw-note`; source `human` / `agent-inferred` / `legacy-doc` / `existing-docs`). A `correction` sets `needs_resync`. Requires `.ai/` to be initialized first. |
| `apply_ai_dir_migration` | Ingests a non-conformant `.ai/`'s content as legacy evidence (`source: "legacy-doc"`), then scaffolds normally. Requires `confirm: true`; originals are kept unless `remove_originals` is set. |
| `list_evidence` | Reads back evidence entries (unsynthesized by default) for the calling agent to review before writing docs/context. |
| `write_doc` | Commits agent-authored markdown to `.ai/docs/<path>`. Marks any referenced evidence synthesized and recomputes the manifest's pending counters. |
| `write_context_chunk` | Same, to `.ai/context/<path>`, plus a `.meta.json` sidecar (title/area/risk) so a harness can retrieve chunks selectively by area. |
| `check_drift` | Compares the manifest's `last_scan_sha` to current git HEAD; returns changed files if stale. Separate concern from `needs_resync` (evidence staleness). |
| `write_plan` | Creates a plan file — required for all ticket work and all planning work. Starts `draft` by default; filename is `<date>-<slug>.md` (or `<ticket_key>-<date>-<slug>.md`), auto-deduplicated on collision. |
| `list_plans` | Returns full plan metadata + content, optionally filtered by `status` and/or `ticket_key`. |
| `transition_plan` | Moves a plan between `draft`/`active`/`completed` — physically relocates the file, not just a status flag. Sets `approved_at` the first (and only the first) time a plan reaches `active`. |

Typical call order: `ensure_ai_dir` → (if it reports `non-conformant`, ask the user, then
`apply_ai_dir_migration`) → `scan_project` → `record_evidence` (as needed) → `list_evidence` →
`write_doc` / `write_context_chunk` → `get_setup_status` / `check_drift`. Independently, for any
ticket or planning work: `write_plan` → `transition_plan` (draft → active on approval → completed
when done).

## Relationship to `ai-intake-mcp`

`ai-intake-mcp` is a separate Jira ticket-execution harness (`tracker_get_issue`,
`implement_ticket`, `approve_plan`, `worktree_create`, etc.) that auto-writes `.ai/intake-mcp.json`
on first tracker use. This project never touches that file. The two stay separate servers
(different lifecycle, different blast radius) but share the `.ai/` schema via
[`@davindermahal/context-schema`](https://www.npmjs.com/package/@davindermahal/context-schema), so
their file layout can't drift even though they're released independently.

## Source and development

Full source, tests, and contribution notes live in the
[monorepo](https://github.com/davindermahal/ai-intake-documentation-mcp).

## License

MIT — see the [full repo](https://github.com/davindermahal/ai-intake-documentation-mcp) for
license text.
