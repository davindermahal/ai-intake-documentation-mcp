## Motivation

The Confluence guide-authoring plan (`.ai/plans/active/2026-09-06-add-confluence-guide-authoring.md`)
has been implemented (branch `add-confluence-guide-authoring`) and is currently in QA. Discussing it
afterward surfaced a gap: `sync_guide` takes markdown as input and converts it to Confluence storage
format via a hand-rolled, intentionally narrow converter (that plan's Key decision #5) — and that
conversion is one-way. The original markdown, which in practice is often already sitting in a `.md`
file because an authoring agent produced it before ever calling this tool, is thrown away once the
page is published. Two consequences:

- Editing a guide later means hand-editing Confluence's storage/wiki markup directly (or re-deriving
  markdown from it, which nothing in this repo does and which storage-format HTML doesn't losslessly
  reverse into).
- Nothing preserves an exact, diffable copy of what was actually authored — useful as evidence of
  guide provenance, and as a source an agent could re-read later without needing a storage-format
  parser.

We considered (and rejected) making the raw `.md` file the *primary* published artifact — i.e.
uploading it as a Confluence attachment instead of a rendered page. Confluence Cloud has no built-in
preview/render for `.md` attachments (unlike PDF/Office formats), so that would make guides worse to
read in Confluence, and it would break `ai-intake-mcp`'s existing "index Link column points at a
leaf page" assumption (from the sibling `curated-guide-retrieval.md` plan) — a cross-repo compat
change for no UX benefit. Instead: keep the rendered page as the primary, readable artifact, and add
the original markdown as a secondary attachment on that same page — always there, evidentiary, never
the thing a human or `ai-intake-mcp` is expected to read by default.

## Goals (v1)

- `sync_guide` uploads the exact markdown string it was given (the `content` input, pre-conversion)
  as a file attachment on the guide's own leaf page, on every create *and* every update.
- Re-syncing an existing guide creates a new version of the same attachment (Confluence's native
  attachment versioning), not a growing pile of duplicate files.
- No change to `ensure_guide_index`, `list_guides`, the index table shape/columns, or
  `markdown-to-storage.ts` — this is additive to `sync_guide` only.

## Out of scope (v1)

- Any storage-format → markdown reverse converter. Not needed now that the original is preserved
  verbatim.
- Reading the attachment back from anywhere in this repo or from `ai-intake-mcp`'s
  `list_guides`/`fetch_guide` — this plan only produces the attachment. Consuming it is a future
  plan (either repo) if/when something actually needs raw markdown instead of rendered content.
- Pruning old attachment versions. Confluence's own version history covers this for v1, same
  "don't build for a cost that hasn't been observed" reasoning as the original plan's Key decision #4
  (no delete/archive tooling).
- Attaching anything to the index page itself — only guide leaf pages get an attachment.

## Design overview

### 1. `ConfluenceClient.uploadAttachment`

New method in `packages/documentation-mcp/src/confluence/client.ts`, targeting
`POST /wiki/rest/api/content/{pageId}/child/attachment`. This is a real departure from the existing
`request()` helper, which hardcodes `Content-Type: application/json` and JSON-stringifies the body —
the attachment endpoint needs `multipart/form-data` (a `FormData` body, filename + blob) and an
`X-Atlassian-Token: nocheck` header instead. So `uploadAttachment` makes its own `fetchImpl` call
rather than going through `request()`, but still reuses `ConfluenceApiError` for non-2xx responses
for consistent error handling.

Confluence's v1 attachment endpoint is upsert-by-filename: POSTing a file with the same name as an
attachment that already exists on that page automatically creates a new version of it — no
"does this attachment already exist" lookup needed (unlike page create/update's title-matching).

### 2. Fixed filename: `source.md`

Every guide page gets exactly one markdown attachment, always named `source.md`. Fixed name (not
derived from the guide title) keeps the upsert-by-filename behavior reliable across title edits/
renames and avoids any filename-sanitization concerns.

### 3. Wiring into `sync_guide`

In `packages/documentation-mcp/src/tools/syncGuide.ts`, after `guidePage` is resolved (post
create/update, so `guidePage.id` is known either way), call:

```ts
await client.uploadAttachment({
  pageId: guidePage.id,
  filename: "source.md",
  content,          // the raw markdown input, not storageBody
  mimeType: "text/markdown",
});
```

placed before the index-table upsert/`updatePage` call on the index page — see Key decision #1 for
why ordering matters here.

### 4. Tool output

`sync_guide`'s returned JSON gains an `attachmentUrl` (or `attached: true/false`) field so
`write_guide`'s final report-back step can mention it, without changing the existing `status`/`url`
fields anything else depends on.

## Key decisions

### 1. Attachment failure must not fail `sync_guide` — success means the page (and index) got
   written, with retries before giving up on the attachment

**Resolved.** Page + index write is what "success" means for `sync_guide`, unchanged from today —
the attachment is evidence layered on top, never a gate. Concretely:

- `uploadAttachment` gets a small built-in retry: on failure, retry up to 2 more times (3 attempts
  total) with a short fixed delay (e.g. 500ms) between attempts — attachment upload failures are
  typically transient (network blip, momentary rate limit), and a page that just successfully
  created/updated is strong evidence the connection to Confluence is otherwise fine.
- If all attempts fail, swallow the final error: don't throw out of `sync_guide`, don't block the
  index-table update, and surface `attached: false` plus the last error message in the tool result
  so a caller can notice and re-run `sync_guide` later to retry (re-running is always safe — same
  upsert-by-filename behavior as a normal update).
- The attachment call stays placed before the index-table update in the flow (per the Design
  overview), simply so the tool result's `attached` field reflects a fully-settled attempt (success
  or exhausted retries) by the time the index write happens — not because index-write ordering
  depends on it.

Rejected alternatives: failing the whole call on attachment error (would make a fully valid guide
publish fragile to an unrelated upload hiccup — rejected per your framing of the attachment as
"nice to have" evidence, not a requirement); no retry at all (cheap to add, and a single transient
failure shouldn't need a full manual re-run when three quick attempts would likely have succeeded).

### 2. Fixed `source.md` filename vs. deriving one from the guide title

**Resolved**: fixed name. A derived name (e.g. slugified title) would break the upsert-by-filename
behavior across any future guide rename, turning a rename into "old attachment orphaned + new one
created" instead of a clean version bump. One guide = one page = one attachment; the page itself is
already the disambiguator, so the filename doesn't need to be unique or descriptive.

### 3. `ai-intake-mcp`'s read side keeps reading the rendered page, not the attachment

Not this plan's to build (see Out of scope), but worth recording the answer since it shaped Key
decision #3 of the original authoring plan and came up again here: per `ai-intake-mcp`'s own
`curated-guide-retrieval.md` (still draft, not yet built), `fetch-guide.ts` is designed to fetch a
matched guide's "full content" from its Confluence page — i.e. `body.storage`, the same field this
repo's own `ConfluenceClient.getPageById`/`getPageByTitle` already read. It has no notion of
attachments today, and this plan doesn't give it one. The `source.md` attachment this plan adds is
therefore inert from `ai-intake-mcp`'s perspective until/unless a future change there deliberately
teaches `fetch-guide.ts` to prefer it (falling back to page body when absent) — a decision for that
repo's plan, not this one, and not needed until something actually requires raw-markdown fidelity on
the read side.

## Open questions

None outstanding — both prior open items (failure semantics, filename convention) are resolved above.

## Implementation steps (draft)

1. Add `uploadAttachment` to `packages/documentation-mcp/src/confluence/client.ts` (multipart POST,
   injectable fetch, retry loop per Key decision #1, `ConfluenceApiError` reused for a non-2xx
   response on any given attempt).
2. Wire the call into `packages/documentation-mcp/src/tools/syncGuide.ts` per the Design overview,
   with the try/catch-after-retries per Key decision #1.
3. Extend `sync_guide`'s output shape (`attached: boolean`, `attachmentError?: string` on failure)
   and its tool description string.
4. Update `packages/documentation-mcp/src/prompts/writeGuide.ts`'s final report-back step to mention
   the attachment when present (check current content first — may already be generic enough to need
   no change).
5. Tests — see comprehensive QA plan below.

## QA plan

Three layers: unit (client method in isolation), integration (`sync_guide` end to end against a
faked Confluence), and a live manual dry run against a real Confluence space. All three are required
before this plan moves to `completed` — the original guide-authoring plan shipped with layer 1+2 only
and layer 3 is what's currently surfacing gaps in QA, so this plan holds itself to a higher bar.

### 1. Unit tests — `packages/documentation-mcp/test/confluence-client.test.ts`

Extend the existing `describe("ConfluenceClient", ...)` block (same injectable-`fetchImpl` pattern
already used there for `createPage`/`updatePage`):

- Sends a `multipart/form-data` request to `/wiki/rest/api/content/{pageId}/child/attachment` with
  the `X-Atlassian-Token: nocheck` header and **not** `Content-Type: application/json`.
- The uploaded part's filename is exactly `source.md` and its content matches the input string
  byte-for-byte (including any trailing newline / non-ASCII characters — round-trip fidelity is the
  entire point of this plan).
- Retries on failure: fake `fetchImpl` that fails twice (rejects, or returns a non-2xx) then
  succeeds on the 3rd call — assert it resolves successfully and `fetchImpl` was called exactly 3
  times.
- Gives up after exhausting retries: fake `fetchImpl` that always fails — assert the method's
  returned/thrown result reflects final failure (whatever shape `syncGuide.ts` needs to turn into
  `attached: false`), and that it was called exactly 3 times, not looped forever.
- A 2xx response on the *first* attempt does not retry (`fetchImpl` called exactly once) — cheap but
  worth asserting explicitly so a future refactor can't silently make the happy path slower.

### 2. Integration tests — `packages/documentation-mcp/test/sync-guide.test.ts`

Extend the existing mocked-`ConfluenceClient` block (same pattern as the current create/update/
page_id tests in that file — add an `uploadAttachment` stub to the mock class):

- Happy path (create): `uploadAttachment` is called with the new page's id and the exact `content`
  string passed to `sync_guide`; result JSON includes `attached: true`.
- Happy path (update): same, called with the *existing* page's id, not the index page's id (easy
  mistake to regress into given both ids are in scope at that point in the handler).
- Failure path: mock `uploadAttachment` to reject (simulating retries already exhausted inside the
  client) — assert `sync_guide` still returns `status: "created"`/`"updated"` (not `isError: true`),
  `attached: false`, an `attachmentError` string is present, and — critically — the index-table
  `updateCalls` entry for the index page still happened (regression guard for Key decision #1: an
  attachment failure must never silently skip the index upsert).
- Ordering/isolation: a failing attachment upload doesn't throw an unhandled rejection or otherwise
  crash the handler — the existing `isError`-based error-result convention stays intact for genuine
  config/lookup errors (the four existing error-path tests in this file must keep passing unmodified).

### 3. Live manual dry run (needs real Confluence credentials — cannot be automated in this
   environment)

Run against a real space, ideally the same one used for the original plan's Verification #2, so this
can piggyback on QA already in flight there:

1. **Create path**: `sync_guide` a brand-new guide. Confirm in the Confluence UI: the page exists as
   before, *and* it has exactly one attachment named `source.md`. Download it and diff against the
   exact markdown string that was passed in — must be byte-identical.
2. **Update path**: `sync_guide` the same guide again with different `content`. Confirm: the page
   body updates as before, and `source.md` now shows **version 2** in Confluence's attachment
   history (not a second attachment) — open both versions and confirm v1 still matches the original
   content and v2 matches the new content.
3. **Repeat update 2-3 more times** to confirm versioning keeps incrementing cleanly rather than
   breaking after the first bump.
4. **Attachment metadata sanity check**: confirm the attachment's reported MIME type is
   `text/markdown` (or Confluence's closest accepted equivalent) and its size matches the source
   string's byte length — catches a subtly wrong encoding that byte-diffing the downloaded file might
   still mask if the download step itself normalizes line endings.
5. **Retry behavior, best effort**: true transient-failure injection isn't practical against a real
   API, so this is covered primarily by the unit tests in layer 1. If feasible, one lightweight live
   check: temporarily point `CONFLUENCE_SITE_URL` at an unreachable host for just the attachment step
   (e.g. by testing directly against `uploadAttachment` in a scratch script rather than through the
   full tool) to confirm it fails gracefully end-to-end rather than hanging — optional, not a
   blocking QA gate given layer 1 already covers the retry logic itself directly.
6. **No regression check**: confirm `ensure_guide_index` and `list_guides` still behave exactly as
   verified in the original plan's live dry run — this plan changes `sync_guide` only, but a live
   pass is the cheapest way to catch an accidental cross-wire.

### Verification gate

`npm run build && npm test` must pass (layers 1+2) before attempting layer 3. This plan moves to
`completed` only once all three layers have been run and layer 3's results are recorded (e.g. as
evidence via `record_evidence`, matching this repo's own convention for its other plans).

## Implementation notes (2026-09-07)

Layers 1 and 2 done on branch `add-guide-attachment-and-last-modified`:
- `ConfluenceClient.uploadAttachment` added (multipart POST, `X-Atlassian-Token: nocheck`, 3-attempt
  retry with a short fixed delay between attempts) — matches Key decision #1's resolved semantics
  exactly: failure never propagates out of `sync_guide`, only out of `uploadAttachment` itself after
  retries are exhausted.
- `sync_guide` wired per the Design overview: uploads `content` (the raw markdown, not the converted
  storage body) as `source.md` on the resolved guide page's id, wrapped in try/catch; result JSON
  gains `attached`/`attachmentError`.
- `write_guide`'s step 7 now mentions a failed attachment when `attached: false`.
- All layer-1 and layer-2 test cases from the QA plan above are implemented as written: multipart
  shape + header assertions, first-attempt-success (no retry), retry-then-succeed, exhausted-retries
  failure, plus the integration tests (create/update path pageId correctness, and the regression
  guard that an attachment failure still lets the index upsert complete).
- `npm run build && npm test` — 18 test files, 99 tests, all passing (includes the companion
  Last-Modified-column plan's tests too, implemented in the same branch).

## Real run log (2026-09-07) — Layer 3, GO after 1 real bug found and fixed

Run against the same real Confluence Cloud test space as the original authoring plan's QA
(`dmahal.atlassian.net`, space `QT`, index page id 196804) — real credentials were available in
`~/.config/ai-intake-mcp/.env` after all (an earlier assumption that none were available in this
environment was wrong; checked directly this time rather than re-assumed).

**1 real bug found and fixed, not caught by 99/99 mocked unit/integration tests:**

- **Key decision #1's stated assumption — "Confluence's v1 attachment endpoint is upsert-by-
  filename" — was wrong.** Real first `sync_guide` call (create path) succeeded and attached
  `source.md` correctly. The **second** call (update path, same title) returned
  `attached: false`, `attachmentError: "... 400 Bad Request: ... Cannot add a new attachment with
  same file name as an existing attachment: source.md"`. Real Confluence Cloud requires a *different*
  endpoint to version an existing attachment (`POST .../child/attachment/{attachmentId}/data`) than
  to create a new one (`POST .../child/attachment`) — there is no single upsert-by-filename endpoint
  as the design assumed. Fixed: `uploadAttachment` now looks up an existing attachment by filename
  first (`GET .../child/attachment?filename=...`), then POSTs to whichever endpoint applies. Also
  discovered live: the update-data endpoint's success response is the attachment object directly, not
  wrapped in `{results: [...]}` like the create endpoint's — handled with a type guard.

**Real results after the fix**, direct Node calls against the compiled `dist/` (not through a full MCP
host, same pattern as the original plan's own live QA):

- **Create**: `sync_guide` on a new title ("QA Test: Attachment and Last Modified") →
  `{"status":"created", "attached":true, ...}`. Confirmed via a direct Confluence API call: exactly
  one attachment, `source.md`, `mediaType: "text/markdown"`, `size: 147` — matches
  `Buffer.byteLength` of the exact content sent. Downloaded the attachment and diffed against the
  original string: **byte-identical**.
- **Update (post-fix)**: re-ran `sync_guide` on the same title with different content →
  `{"status":"updated", "attached":true, ...}`. Confirmed: still exactly **one** attachment (same id),
  now at **version 2** — real versioning, not a duplicate. Downloaded v2's content: matches the new
  content exactly.
- **Repeated update**: a third `sync_guide` call → version incremented cleanly to **3**, still one
  attachment. Versioning holds up across repeats, not just the first bump.
- **No regression**: `list_guides` throughout continued to correctly report the pre-existing
  "Symfony 4→5 Upgrade" row untouched, confirming this plan's changes didn't disturb existing guides.

**Verdict: GO**, after the one fix above. `npm run build && npm test` — 18 files, 100 tests (99 + 1
new regression test added for the create-vs-update-endpoint distinction) — all passing.

One real artifact left behind: the "QA Test: Attachment and Last Modified" guide page and its index
row are now live in the shared `QT` test space (same space the original plan's QA used and left its
own "Symfony 4→5 Upgrade" test guide in) — deleting a guide/row is explicitly out of scope for these
tools (per the original plan's Out of scope), so it was left in place rather than removed by hand
outside the tool's own contract. Worth a human decision on whether to clean it up.
