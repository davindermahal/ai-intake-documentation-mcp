# Extract a shared Confluence client package; add Confluence-link fetching to document_area/start_documentation

## Motivation

Companion to `ai-intake-mcp`'s `.ai/plans/draft/confluence-references-in-planning.md`, which adds
explicit-link Confluence fetching to ticket planning (interactive and headless) and names a
cross-repo shared transport package (its Key decision #3) as the eventual home for the
fetch-by-URL/storage-parsing logic — deferred there so that plan didn't block on this one. This
plan builds that package, and is also this server's own consumption of it: `document_area`/
`start_documentation` gain the same "an operator names a relevant Confluence page" capability that
started this whole thread, since documenting a part of a system benefits from exactly the same input.

This also resolves a risk flagged when this repo's write-side guide-authoring client was first
built: `.ai/plans/completed/2026-09-06-add-confluence-guide-authoring.md` Key decision #2 warned
that this repo reads `ai-intake-mcp`'s `JIRA_*`/`CONFLUENCE_*` variable names "with no compile-time
signal across the repo boundary" if they're ever renamed there — and that this actually happened
once already during that plan's implementation (wrong names shipped, caught only by manually
re-reading the other repo's source). A shared package turns that into a real dependency with real
versioning, not a hand-maintained assumption.

## Goals (v1)

- One shared package, `@davindermahal/confluence-client`, published from this monorepo (same
  distribution pattern as `@davindermahal/context-schema`), holding: auth/config resolution, the
  HTTP client (with real retry/backoff), URL-to-page-ID parsing, and storage-format-to-text
  conversion in both directions — transport only, no product-specific policy.
- This server's existing write-path Confluence tools (`ensure_guide_index`, `list_guides`,
  `sync_guide`, `write_guide`) migrated onto the shared package, behavior-preserving.
- A new `fetch_confluence_pages` tool, plus wiring into `document_area` (and `start_documentation`)
  so an operator can name specific Confluence pages while documenting an area — same
  staleness-as-data citation discipline as `confluence-references-in-planning.md` Key decision #8.
- `ai-intake-mcp`'s own migration onto the package stays that repo's later, separate change — this
  plan builds and publishes the package and proves it out here; it does not edit `ai-intake-mcp`.

## Out of scope (v1)

- Actually migrating `ai-intake-mcp` onto the new package — separate change, that repo, once this
  package is published and stable (see `confluence-references-in-planning.md` Key decision #3).
- Any search/browse (space- or page-tree-scoped) capability — deferred on both sides, matching
  `confluence-references-in-planning.md` Key decision #1.
- A generic (non-Confluence) external-reference fetcher (articles, GitHub issues, etc.) — a
  materially different trust/auth/format problem, explicitly deferred to its own future plan.
- Confluence content-health/staleness tracking across the whole space (as opposed to
  per-citation staleness) — captured separately in `ai-intake-mcp`'s
  `.ai/plans/draft/confluence-content-health-and-staleness.md` brainstorm note, not this plan.

## Design overview

### 1. New package: `packages/confluence-client` (`@davindermahal/confluence-client`)

What moves in, and from where:

- **Config/auth resolution** — `loadConfluenceConfig`/`resolveConfluenceAuth`, currently duplicated
  near-verbatim in both `packages/documentation-mcp/src/config.ts` and `ai-intake-mcp/src/config.ts`
  — both already read the same `~/.config/ai-intake-mcp/.env` file and the same
  `CONFLUENCE_*`/`JIRA_*` variable names (per `add-confluence-guide-authoring.md` Key decision #1),
  so this is a pure de-duplication, not a behavior reconciliation. Scope: only the auth-triple
  resolution (site/email/token, `confluence* ?? jira*` fallback) and the raw `.env`+`process.env`
  loader. Product-specific fields (`CONFLUENCE_SPACE_KEY` here, `CONFLUENCE_GUIDE_INDEX_URL` in
  `ai-intake-mcp`) stay local to each consumer, read directly off the same raw loader.
- **HTTP client** — `ConfluenceClient`, based on `ai-intake-mcp`'s existing implementation (real
  retry/backoff with `Retry-After` handling — materially more robust than this repo's current
  client, which barely retries anything), extended with this repo's write methods (`createPage`,
  `updatePage`, `uploadAttachment`, including its hard-won attachment create-vs-version distinction)
  and read methods (`getPageById`, `getPageByTitle`).
- **URL parsing** — `extractPageIdFromUrl` (`ai-intake-mcp`'s slightly more precise version, which
  requires a path boundary after the digits) and `fetchPageByUrl`.
- **Storage-format conversion, both directions** — `storageToPlainText` (ported from `ai-intake-mcp`
  as-is, including its already-debugged CDATA-code-block fix) and `markdownToStorage` (moved from
  this repo). Kept together as one concern (Confluence storage format ↔ plain content) even though
  today only one consumer needs each direction.
- **Error type** — one canonical `ConfluenceApiError`.

### 2. This server's existing tools migrate onto the package

`ensure_guide_index`, `list_guides`, `sync_guide`, and `write_guide`'s use of `markdownToStorage`
switch from `packages/documentation-mcp/src/confluence/*` and `src/config.ts`'s Confluence fields to
importing from `@davindermahal/confluence-client`. Behavior-preserving — existing tests (adjusted
for new import paths) are the regression check; no new test scenarios needed for this step alone.

### 3. New tool: `fetch_confluence_pages`

Same shape as the tool `confluence-references-in-planning.md` specifies for `ai-intake-mcp`:
`urls: string[]` in, per-URL `{url, title, content, lastModified, error?}` out, partial-failure
tolerant, filtered by the same two checks (hostname matches the configured Confluence site,
`extractPageIdFromUrl` succeeds). Built directly on the new shared package from day one — no
separate local implementation to migrate later, since the package already exists before this step
starts (unlike `ai-intake-mcp`'s plan, which had to defer the package and build against its own
local client first).

### 4. Wiring into `document_area` / `start_documentation`

- `document_area` gains an optional `confluence_links` argument, mirroring `plan_ticket`'s in
  `ai-intake-mcp` (naming intentionally matches across both servers).
- Its instructions gain a step: fetch named links via the new tool, then treat each as one more
  source to reconcile against what's actually read in the code — same "background context, not
  authoritative" framing as `confluence-references-in-planning.md` Key decision #8, arguably even
  more natural here, since `document_area`'s whole design already prioritizes reading real code over
  any secondary source (its step 3 explicitly says "build a real understanding... rather than
  skimming for a summary").
- Each fetched page becomes a `record_evidence` call: `source: "existing-docs"` (already the
  exact-fit enum value for "content found in a pre-existing doc outside this evidence-authoring
  flow" — no `context-schema` change needed), `content` prefixed with the page's URL and
  `lastModified` date so provenance and staleness travel with the fact all the way into
  `.ai/docs`/`.ai/context`, not just into a citation line no later reader of those files will see.
- `start_documentation` gets the same argument/step for symmetry, though it's expected to matter
  less there (whole-repo scope, less likely one Confluence link is relevant to everything being
  documented).

## Key decisions

### 1. Package boundary is transport, not policy

Same principle already agreed with `ai-intake-mcp`: the shared package fetches and parses; it never
decides what's in scope (no curated-index gating, no "human must review" enforcement, no citation
formatting). Those stay local to each server's own tools/prompts. Keeps the shared package from
slowly accumulating one product's business rules into the other's dependency tree.

### 2. Base the shared client's retry/backoff on `ai-intake-mcp`'s, not this repo's

This repo's current `ConfluenceClient` barely retries — only `uploadAttachment` has any retry logic,
and only for its own specific create-vs-version quirk. `ai-intake-mcp`'s version already handles
429/5xx with `Retry-After` awareness and capped exponential backoff, generically, for every request.
Rather than maintaining two qualities of retry behavior inside one shared package, adopt the more
robust one as the baseline everywhere, including this repo's write calls, which never had it before
— a strict improvement, not a behavior change anyone currently depends on.

### 3. `ai-intake-mcp`'s own migration is a separate, later change

This plan builds and publishes the package and proves it out against this repo's own existing
write-path tools (an immediate, real consumer with real test coverage) plus the new
`fetch_confluence_pages` tool. `ai-intake-mcp` adopting it — deleting its own
`src/confluence/client.ts`/`storage-text.ts` in favor of the published package — is that repo's own
follow-up, once this package has shipped and had at least one real consumer prove it out. Matches
`confluence-references-in-planning.md` Key decision #3's "deferred, not blocked on" framing, from
the other side.

### 4. Citation reuses `record_evidence`'s existing `source: "existing-docs"` — no schema change

`existing-docs` already means exactly "content found in a pre-existing doc outside this
evidence-authoring flow" — a fetched Confluence page fits it precisely. No new evidence
source/type value, no `context-schema` change, no migration for existing `.ai/evidence/` entries.

## Open questions

- [ ] Exact package name — `@davindermahal/confluence-client` assumed throughout this plan; confirm
      before publishing (otherwise unreviewed).
- [ ] Does `ai-intake-mcp`'s `ConfluenceClientOptions` (a `{config, fetchImpl?, sleepImpl?}` shape,
      config-object-in) reconcile cleanly with this repo's (`{siteUrl, email, apiToken, fetchImpl?}`,
      resolved-triple-in) without either consumer needing an awkward adapter, or does the shared
      package need a third constructor shape both wrap? Needs the two actual call sites compared
      side by side before Implementation step 1, not just the reading already done for this plan.
- [ ] Should `document_area`'s new step run even when no `confluence_links` argument was given, but
      the operator mentions a link mid-conversation instead? `plan_ticket`'s ticket-scanning path
      exists because a Jira ticket is structured data the agent can scan; `document_area` has no
      equivalent structured input to scan when the argument's absent. Probably just "the
      instructions mention the tool exists, use it if the conversation surfaces a relevant link" —
      worth confirming that doesn't need a more explicit trigger before Implementation step 4.

## Implementation steps (draft)

1. Resolve the constructor-shape open question above, then scaffold `packages/confluence-client`
   (`package.json`, `tsconfig.json`, following `packages/context-schema`'s existing setup) with the
   auth/config loader (Design #1) and `ConfluenceClient` (Key decision #2's retry baseline, this
   repo's write methods, `ai-intake-mcp`'s read/URL-parsing/storage-conversion functions).
2. Migrate this repo's existing Confluence tools (`ensure_guide_index`, `list_guides`, `sync_guide`,
   `write_guide`) onto the new package; delete `packages/documentation-mcp/src/confluence/*` and the
   Confluence fields from `src/config.ts` once nothing local references them. Full existing test
   suite is the regression gate.
3. Build `fetch_confluence_pages` (Design #3) directly against the new package.
4. Add the `confluence_links` argument and instructions step to `document_area` and
   `start_documentation` (Design #4), including the `record_evidence`/`source: "existing-docs"`
   citation convention.
5. Publish `@davindermahal/confluence-client` to npm alongside the next `documentation-mcp` release.

## Verification

1. `npm run build && npm test` across the monorepo — the migrated write-path tools' existing tests
   continue passing unchanged in behavior (only import paths differ), plus new unit tests for
   `fetch_confluence_pages`'s URL filter and `document_area`'s new evidence-recording step.
2. Real dry run against an actual Confluence space (manual, needs live credentials): confirm
   `sync_guide` still publishes/updates correctly through the new package (regression check on the
   migration), and that `fetch_confluence_pages` correctly fetches a real page's content plus
   `lastModified` for a fresh `document_area` session.
3. Once `ai-intake-mcp` migrates onto the package (its own later change), confirm its existing
   `list_guides`/`fetch_guide` behavior is unchanged — the package's public API must not have
   silently drifted from what that migration will expect, based on this plan's Design #1.
