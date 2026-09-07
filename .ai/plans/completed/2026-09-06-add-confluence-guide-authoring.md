# Add Confluence guide authoring and sync tools

## Motivation

Companion to `ai-intake-mcp`'s `.ai/plans/draft/curated-guide-retrieval.md`, which lets that
server discover and fetch curated Confluence "how-to" guides during ticket planning (e.g. a ticket
that says "upgrade to Symfony 5" gets matched against a "Symfony 4→5 Upgrade" row on a shared
Confluence index page). That plan explicitly deferred the *authoring* side — someone still has to
write these guides and get them onto the index in the right shape — and named this repo,
`ai-intake-documentation-mcp`, as the place that should happen. This plan builds that half.

Two guide shapes in scope:
- **Version-upgrade guides** (Symfony 4→5, 5→6, ...) — reusable across every app hitting that hop,
  no company- or repo-specific detail.
- **`build-<xyz>-task` guides** — how to do a specific, recurring kind of task within a particular
  repo (e.g. "build-add-migration-task" for one app's particular migration tooling). Repo-scoped by
  content, but still published to the same shared Confluence index — see Open question 2 on how
  that scoping is signaled.

## Goals (v1)

- New MCP tools/prompt in this server that draft a guide (following the sibling plan's authoring
  conventions — atomic steps, exact commands, explicit checkpoints, clear done-criteria per step),
  publish it to Confluence as a leaf page, and add/update its row on the shared index page.
- A one-time bootstrap path for an org that doesn't have the Confluence space/index page yet —
  today, per the sibling plan, nothing exists to point `CONFLUENCE_GUIDE_INDEX_URL` at until
  someone creates it by hand. This plan builds that "someone."
- Reuse `ai-intake-mcp`'s existing global config file (`~/.config/ai-intake-mcp/.env`) rather than
  inventing a second config location — one Confluence setup for a developer using either or both
  tools (see Key decision #1).
- Keep the index format ai-intake-mcp already committed to (Title | Description | Link | Tags
  table, flat, leaf-content-only links) — this plan is a producer for that exact shape, not a
  redesign of it.

## Out of scope (v1)

- Raw/unbounded Confluence search, crawling, or any read-side retrieval logic — that's entirely
  `ai-intake-mcp`'s side (its own `list_guides`/`fetch_guide`, per the sibling plan). This repo only
  writes.
- Deleting or archiving a guide/index row. A stale guide gets edited or superseded by a new row for
  now; removal is a manual Confluence edit until there's a real need for a tool.
- The automated lessons-learned feedback loop (a completed ticket's outcome rewriting a guide). Hook
  point named in the sibling plan's Key decision #4; not built on either side yet.
- Migrating any existing human-facing content already under a repo's `.ai/docs/` into a guide
  automatically. Guide authoring starts from a conversation (via the new prompt), not a bulk import.

## Design overview

### 1. Config: shared `~/.config/ai-intake-mcp/.env`

New fields, read the same way `ai-intake-mcp`'s `loadGlobalConfig()` reads `JIRA_SITE_URL`:

```
CONFLUENCE_SPACE_KEY=ENG
CONFLUENCE_GUIDE_INDEX_URL=https://confluence.example.com/pages/GUIDE_INDEX
```

- `CONFLUENCE_GUIDE_INDEX_URL` is the same field the sibling plan already defined — shared, not
  duplicated. If unset, `ensure_guide_index` (below) creates the page and writes it into this same
  file, so a developer who starts with this repo's tools never has to hand-copy a URL into
  `ai-intake-mcp`'s config.
- `CONFLUENCE_SPACE_KEY` is new — needed to create a page at all (Confluence's create-content API
  requires a target space). Required only for `ensure_guide_index`/`sync_guide`; everything else in
  this server works exactly as it does today without it.
- Auth and base site URL default to reusing `JIRA_SITE_URL`, `JIRA_INTAKE_EMAIL`, and
  `JIRA_INTAKE_API_TOKEN` from the same file (shared-tenant assumption; those are `ai-intake-mcp`'s
  actual field names, not `JIRA_EMAIL`/`JIRA_API_TOKEN` as earlier drafts of this plan said — that
  wording mismatch actually shipped as a bug and was caught and fixed during implementation), but
  per the sibling plan's (now-resolved) Key decision #6, three more optional fields override them
  individually if Confluence ever turns out to be a separate tenant:
  ```
  CONFLUENCE_SITE_URL=   # falls back to JIRA_SITE_URL if unset
  CONFLUENCE_EMAIL=      # falls back to JIRA_INTAKE_EMAIL if unset
  CONFLUENCE_API_TOKEN=  # falls back to JIRA_INTAKE_API_TOKEN if unset
  ```
  See Key decision #2 for the cross-repo coupling this creates.

This server has never read a global config file before (it only reads/writes a target project's
own `.ai/`) — this plan adds that capability for the first time, as its own small parser
(`packages/documentation-mcp/src/config.ts`), not a shared package import from `ai-intake-mcp`
(separate repos, separate release cycles, same precedent as the HTTP-transport work duplicating
code across both rather than sharing it).

### 2. Confluence write client

`packages/documentation-mcp/src/confluence/client.ts` — a new, write-capable client, targeting
`/wiki/rest/api/content` (REST API v1 — confirmed correct for Confluence **Cloud**, the deployment
actually in use). Supports:
- `createPage({ spaceKey, title, storageBody, parentId? })`
- `updatePage({ pageId, title, storageBody, version })` (Confluence's update API requires the
  current version number — fetch-then-increment, standard optimistic-locking pattern for this API)
- `getPageByTitle({ spaceKey, title })` — used to decide create vs. update

Auth: Basic (`email:apiToken`, base64) resolved as `confluenceSiteUrl ?? jiraSiteUrl`,
`confluenceEmail ?? jiraEmail`, `confluenceApiToken ?? jiraApiToken` (Key decision #2) — same shape
as `JiraClient`'s token path (`src/jira/client.ts:52-75` in `ai-intake-mcp`) — no cookie-auth
fallback needed here, since guide authoring is expected to run with a real API token configured,
not an interactive browser session.

### 3. Guide content format

Authored as markdown (agent- and human-readable while drafting), converted to Confluence's storage
format (XHTML-ish) only at publish time. `packages/documentation-mcp/src/confluence/markdown-to-storage.ts`
handles the small, known subset guides actually need — headings, numbered/bulleted steps, fenced
code blocks, and a table (for the index itself) — not general CommonMark fidelity. See Open
question 1 on hand-rolling vs. a library.

### 4. Index table handling

`packages/documentation-mcp/src/confluence/index-table.ts`: parses the index page's storage-format
table into `{title, description, link, tags}[]` (same shape the sibling plan's `list_guides`
produces, so the two independently-built parsers must agree on the table's exact shape — see
Verification #3), and serializes an updated row set back into the same table markup for
`sync_guide`'s upsert.

### 5. New MCP tools

- **`ensure_guide_index`** — idempotent bootstrap, modeled on this server's own `ensure_ai_dir`:
  - `CONFLUENCE_GUIDE_INDEX_URL` set and resolves to a real page → report `status: "conformant"`.
  - Unset → create a new page (title configurable, default e.g. "AI Agent Guides") in
    `CONFLUENCE_SPACE_KEY` with an empty four-column table, write the resulting URL into
    `~/.config/ai-intake-mcp/.env`, report `status: "initialized"` plus the URL.
- **`list_guides`** — fetch + parse the index (via `index-table.ts`), for pre-authoring checks
  ("does something like this already exist?"). Read-only; independent of `ai-intake-mcp`'s own
  tool of the same name (different MCP server, no collision — each host namespaces by server).
- **`sync_guide`** — the actual publish tool.
  - Input: `title`, `description`, `content` (markdown), `tags` (array), optional `page_id` (to
    force-update a specific known page rather than match by title).
  - Behavior: convert `content` to storage format; find the existing leaf page by `page_id` if
    given, else by exact `title` match within `CONFLUENCE_SPACE_KEY`; create it (as a child of the
    index page, Key decision #3) or update it; then upsert its row on the index table (replace on
    exact title match, else append). If `page_id` is given but doesn't resolve to a real page,
    error rather than silently falling through to create a new one — caught during implementation
    review, since the tool's own contract is "match by `page_id` if given," not "try `page_id`,
    then fall back to creating."
  - Output: the guide's page URL and whether it was created or updated.

### 6. New prompt: `write_guide`

Interview-driven, same style as this server's existing `start_documentation` prompt:

1. Ask what the guide is for — a version-upgrade guide, or a `build-<xyz>-task` guide for a
   specific repo — and get a working title.
2. Call `ensure_guide_index` first, so there's always a real index to publish into.
3. Call `list_guides`; if something close already exists, ask the user whether to update that page
   (pass its link back in as `page_id`) or write a new one.
4. Gather the actual steps — interview the user, and/or (if this session already has repo context,
   e.g. documenting a task just completed) read the relevant code/evidence — following the sibling
   plan's authoring notes: atomic steps, exact commands not descriptions, explicit test/checkpoint
   steps, clear done-criteria per step.
5. Draft the full content and show it to the user for confirmation. **Never publish without an
   explicit yes** — same "don't guess or fabricate on the user's behalf" discipline as
   `start_documentation`.
6. Call `sync_guide`.
7. Report the resulting URL back to the user.

## Key decisions

### 1. Shared config file, not a second config directory

Agreed together with the sibling plan (now that plan's Key decision #7): this server reads/writes
`~/.config/ai-intake-mcp/.env` rather than `~/.config/ai-intake-documentation-mcp/.env`. One
Confluence setup, whether a developer uses one of these tools or both. The tradeoff: this server
now has a real (if narrow) coupling to a config file whose name and variable schema live in a
different repo's plan, not this one — see Key decision #2's related risk.

### 2. Reuses Jira credentials for Confluence auth by default, with per-field override

**Resolved**, matching the sibling plan's (now-resolved) Key decision #6: default behavior (all
three `CONFLUENCE_*` override fields unset) reuses `JIRA_SITE_URL`/`JIRA_INTAKE_EMAIL`/
`JIRA_INTAKE_API_TOKEN` — believed to be correct (same Atlassian Cloud tenant) but not confirmed
with certainty. If that turns out to be wrong, setting
`CONFLUENCE_SITE_URL`/`CONFLUENCE_EMAIL`/`CONFLUENCE_API_TOKEN` overrides it per-field, no
config-shape change needed either side.

Risk specific to this plan, confirmed real during implementation, not just theoretical: this
server reads `JIRA_SITE_URL`/`JIRA_INTAKE_EMAIL`/`JIRA_INTAKE_API_TOKEN` — variable names it
doesn't own. An earlier draft of this plan (and the first implementation pass) used
`JIRA_EMAIL`/`JIRA_API_TOKEN` instead, which don't exist in `ai-intake-mcp`'s actual `GlobalConfig`
— silently breaking the shared-credentials default for anyone who hadn't also set the
`CONFLUENCE_*` overrides. Caught and fixed by reading `ai-intake-mcp`'s `src/config.ts` directly
rather than trusting this plan's prose. `src/config.ts` here now has a comment pointing at that
file as the source of truth, but a future rename there still breaks this silently, with no
compile-time signal across the repo boundary — re-verify these three names against
`ai-intake-mcp`'s actual `loadGlobalConfig()` before relying on this default again.

### 5. Markdown → Confluence storage-format: hand-rolled converter, not a library

**Resolved.** `markdown-to-storage.ts` is hand-written, covering exactly the subset guides need
(headings, ordered/unordered lists, fenced code blocks, the index's table shape) — no new
dependency for functionality this plan only needs a narrow, fully-known slice of. Fully unit-
testable against fixed fixtures since `write_guide` constrains the input shape at the source.

### 6. `build-<xyz>-task` guides are scoped by title convention, not a new index column

**Resolved**, matching the sibling plan's existing preference (its Key decision #2) for reusing
mechanisms over adding structured fields. The index table stays at four columns
(Title/Description/Link/Tags); `write_guide` enforces a naming convention for repo-scoped guides,
e.g. `"Build: <repo-name> — <task>"`. `ai-intake-mcp`'s planning-side matching already works off
title/description text, so this needs no change on that side either.

### 3. New guide pages are created as children of the index page

Default `parentId` for `createPage` is the index page itself. Purely organizational (makes guides
browsable as a page tree in the Confluence UI, easy to find outside the index table too) — it does
**not** change the sibling plan's "no recursion" retrieval rule, since `ai-intake-mcp` only ever
follows the index table's explicit `Link` column, never lists a page's children.

### 4. `sync_guide` matches by exact title string, no separate guide ID

Good enough for v1 — same "don't build for a cost that hasn't been observed" reasoning as the
sibling plan's no-persistent-cache decision (Key decision #3 there). If title collisions or
renames become a real problem, `sync_guide`'s existing optional `page_id` parameter is already the
escape hatch (explicit page targeting bypasses title matching entirely) — no rearchitecture needed
to add stronger identity later.

## Open questions

All four resolved except one genuinely unknowable-in-advance item:

1. **Confluence API permissions**: does the API token need space-admin/edit rights on the guides
   space beyond whatever a normal Jira/Confluence user already has? Not knowable in the abstract —
   verify at the first real dry run (Verification #2). Not blocking implementation.

Resolved: markdown-conversion approach (Key decision #5), `build-<xyz>-task` repo scoping (Key
decision #6), Confluence deployment confirmed as Cloud (Key decision #2's client section), and
Jira/Confluence auth reuse with per-field override (Key decision #2).

## Implementation steps (draft)

1. Add `packages/documentation-mcp/src/config.ts` — parses `~/.config/ai-intake-mcp/.env` (its own
   small parser, not imported from `ai-intake-mcp`), exposing `jiraSiteUrl`/`jiraEmail`/
   `jiraApiToken`, the optional `confluenceSiteUrl`/`confluenceEmail`/`confluenceApiToken`
   overrides, `confluenceSpaceKey`, and `confluenceGuideIndexUrl`.
2. Add `packages/documentation-mcp/src/confluence/client.ts` (create/get/update page, `confluence*
   ?? jira*` auth resolution per Key decision #2) and `markdown-to-storage.ts` (content conversion,
   Key decision #5).
3. Add `packages/documentation-mcp/src/confluence/index-table.ts` (parse + serialize the index
   table).
4. Add `packages/documentation-mcp/src/tools/ensureGuideIndex.ts`, `listGuides.ts`, `syncGuide.ts`,
   and register them in `packages/documentation-mcp/src/index.ts`.
5. Add `packages/documentation-mcp/src/prompts/writeGuide.ts` (enforcing the `"Build: <repo-name>
   — <task>"` title convention from Key decision #6 for repo-scoped guides) and register it.
6. Validate end-to-end against a real Confluence space, using a Symfony upgrade guide as the first
   real case (matches the sibling plan's own proof case) — see Verification.

## Verification

1. `npm run build && npm test` — unit test the storage-format converter and the index-table
   parse/serialize logic with fixed fixtures; fake the Confluence client's fetch (injectable, same
   testability pattern as `ai-intake-mcp`'s `JiraClient`) so no real HTTP runs in unit tests.
2. Real dry run against an actual Confluence space (manual — needs live org credentials, can't be
   automated in this environment): `ensure_guide_index` creates the index page from nothing, then
   `sync_guide` publishes a real guide; confirm both render correctly in the Confluence UI.
3. Round-trip check: once `ai-intake-mcp`'s `curated-guide-retrieval.md` plan is implemented,
   confirm its `list_guides`/`fetch_guide` can correctly read a guide this server published —
   proves the two independently-built index-table parsers agree on the exact same shape.
