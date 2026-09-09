# Changelog

All notable changes to `@davindermahal/documentation-mcp` are documented here. Versions correspond
to tags (`documentation-mcp@X.Y.Z`) and npm releases; see this repo's `.ai/plans/` for the full
design record behind each change.

## Unreleased

### Added
- `list_local_guides` and `publish_local_guides` tools: import guides authored in a separate repo
  (e.g. a shared `ai-context-guides` checkout) onto the Confluence guide index without hand-copying
  them one at a time. `list_local_guides` reads `.md` files from a configurable local directory
  (`GUIDES_LOCAL_DIR`, settable via its `guides_dir` argument) and reports which ones already exist
  on the index; `publish_local_guides` creates a page + index row for selected filenames (or every
  new one, via `["all"]`/omitted), always skipping — never overwriting — a guide already on the
  index.

## 0.4.0 — 2026-09-08

### Added
- `fetch_confluence_pages` tool and a matching `confluence_links` argument on `document_area` and
  `start_documentation`: name a relevant Confluence page (as an argument, or mid-conversation) and
  its content gets fetched and cited in the resulting docs via
  `record_evidence`/`source: "existing-docs"`.

### Changed
- Migrated `ensure_guide_index`/`list_guides`/`sync_guide` onto the new, shared
  `@davindermahal/confluence-client` package (also used by `ai-intake-mcp`) instead of this
  package's own client — behavior-preserving; real Confluence gained auth/retry/backoff parity
  with `ai-intake-mcp`'s implementation.

See `.ai/plans/completed/2026-09-09-extract-a-shared-confluence-client-package-add-confluence-li.md`.

## 0.3.0 — 2026-09-08

### Added
- Confluence guide-authoring tool set: `ensure_guide_index`, `list_guides`, `sync_guide`, and a
  `write_guide` prompt — publishes/updates guides on a shared Confluence index that `ai-intake-mcp`
  reads from during planning.
- Guide-attachment evidence (source markdown attached to synced guide pages) and a Last Modified
  column on the guide index.
- Opt-in `MCP_TRANSPORT=http` (loopback-only, Host/Origin-validated; existing stdio default
  unchanged).

## 0.2.0 — 2026-09-06

### Added
- `start_documentation` now checks for drift and confirms with the operator before rescanning,
  instead of leaving staleness to go unnoticed.

## 0.1.1 — 2026-09-05

### Added
- `start_documentation` prompt: walks a calling agent through the full
  detect → scan → ask → record → write onboarding flow in one call.

### Fixed
- `bin` path in `package.json` (a leading `./` made npm silently drop the bin entry on publish).

## 0.1.0 — 2026-09-03

### Added
- Initial release: `.ai/` scaffold/migration tools (`ensure_ai_dir`, `apply_ai_dir_migration`,
  `get_setup_status`), project scanning (`scan_project`), the evidence pipeline
  (`record_evidence`/`list_evidence`/`write_doc`/`write_context_chunk`), drift detection
  (`check_drift`), and plan management (`write_plan`/`list_plans`/`transition_plan`).
