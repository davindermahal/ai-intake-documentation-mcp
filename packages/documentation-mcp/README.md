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

Run the `start_documentation` prompt to kick off (or resume/resync) onboarding — in Claude Code
that's the slash command `/mcp__documentation-mcp__start_documentation`, no arguments required. It
directs the calling agent to detect/initialize `.ai/`, and — on a repo that's already been scanned
before — check for drift first and confirm with you before rescanning rather than leaving you to
notice staleness and drive `check_drift`/`scan_project` yourself. From there it asks what you want
documented, scans the project, asks you its open questions (purpose, users, constraints, and
anything else it notices missing) instead of guessing, records your answers as evidence, and
writes the resulting docs. Calling the tools below directly also works, in the order described
under "Typical call order".

For documenting one specific part of the system — a directory, module, feature, or flow — instead
of a whole-repo pass, run the `document_area` prompt (`/mcp__documentation-mcp__document_area`,
optionally with an `area` argument, e.g. `/mcp__documentation-mcp__document_area src/billing`). It
skips the drift check and whole-repo scan, reads the actual code in that area, asks you dynamic
follow-up questions derived from what it finds (business rules, non-obvious decisions, edge cases)
rather than a fixed checklist, then writes both `.ai/docs` and `.ai/context` scoped to that area.
This is the one to reach for repeatedly as a team documents its apps incrementally.

Either prompt also accepts a `confluence_links` argument (or you can just name a page mid-session)
— any relevant Confluence page you point at gets fetched and cited in the resulting docs via
`fetch_confluence_pages`, the same "operator names a page, not a search" model `ai-intake-mcp` uses
during planning.

## Confluence guide catalog

Separately from the docs above, `write_guide` (`/mcp__documentation-mcp__write_guide`) publishes or
updates a guide (e.g. an upgrade walkthrough) on a shared Confluence index that `ai-intake-mcp`
reads from during ticket planning — see the `ensure_guide_index`/`list_guides`/`sync_guide` tools
below.

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
| `ensure_guide_index` | Gets the shared Confluence guide index page into a good state: creates it (empty table) if `CONFLUENCE_GUIDE_INDEX_URL` is unset, otherwise confirms the existing page still resolves. Safe to call anytime, including repeatedly. |
| `list_guides` | Fetches and parses the shared Confluence guide index into structured rows. |
| `sync_guide` | Publishes a guide: creates/updates its Confluence page (as a child of the index), adds/updates its index row (stamping today's date into Last Modified), and best-effort attaches the source markdown as evidence. |
| `fetch_confluence_pages` | Fetches specific Confluence pages by URL — operator-named links, not a catalog or search. Partial-failure tolerant: a URL that isn't a fetchable page on the configured site is silently skipped. |

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

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## License

MIT — see the [full repo](https://github.com/davindermahal/ai-intake-documentation-mcp) for
license text.
