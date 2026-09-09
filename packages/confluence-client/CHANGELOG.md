# Changelog

All notable changes to `@davindermahal/confluence-client` are documented here. Versions correspond
to tags (`confluence-client@X.Y.Z`) and npm releases; see this repo's `.ai/plans/` for the full
design record behind each change.

## 0.1.1 — 2026-09-09

### Fixed
- `markdownToStorage` now soft-wraps consecutive non-blank paragraph lines into a single `<p>`
  (space-joined), matching CommonMark's treatment of a single newline inside a paragraph. A
  markdown file that hard-wraps prose at ~80-100 columns previously produced one `<p>` per line,
  which Confluence rendered with a paragraph gap between every line instead of flowing text. A
  blank line, or a following heading/list/fence, still ends the paragraph as before.

## 0.1.0 — 2026-09-08

### Added
- Initial release: extracted from `documentation-mcp`/`ai-intake-mcp`'s duplicated Confluence
  implementations into a shared package. Provides auth/config resolution, `ConfluenceClient` (HTTP
  client with real 429/5xx + `Retry-After` retry/backoff), URL-to-page-ID parsing, and
  storage-format conversion both ways (`markdownToStorage`/storage-to-text). Transport only — no
  product-specific policy.

See `.ai/plans/completed/2026-09-09-extract-a-shared-confluence-client-package-add-confluence-li.md`.
