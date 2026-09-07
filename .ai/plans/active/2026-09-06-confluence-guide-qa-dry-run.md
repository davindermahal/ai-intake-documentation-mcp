# Confluence guide retrieval/authoring — end-to-end QA / dry run

**Status**: active — **in progress**. Phases A/B/D partially run for real against
`https://dmahal.atlassian.net/wiki/spaces/QT/pages/196804/AI+Context+Guides` (2026-09-06/07),
finding and fixing 3 real bugs no unit test or code review caught. Phases C, E, F not yet run.
**Created**: 2026-09-06
**Updated**: 2026-09-07 — see "Real run log" after the Goal section below.
**Related**: this repo's `2026-09-06-add-confluence-guide-authoring.md` (the authoring/sync side
this validates, branch `add-confluence-guide-authoring`) and `ai-intake-mcp`'s
`curated-guide-retrieval.md` (the retrieval side, branch `add-confluence-guide-retrieval`) — both
implemented, both fully unit-tested (85/85 and 366/366 respectively), neither ever run against a
real Confluence instance. This plan is that missing verification checkpoint, modeled on
`ai-intake-mcp`'s own `headless-automation-qa.md` (its "companion QA plan" precedent, named
explicitly in the authoring plan's Verification section).

## Goal

Answer, with evidence, not assumption: **does the whole guide-authoring → Confluence →
guide-retrieval loop actually work**, end to end, against a real Confluence Cloud space and a real
Jira ticket — before either PR is treated as production-ready. The unit test suites on both
branches prove internal logic against *mocked* HTTP. They cannot prove:

- Confluence's real REST API v1 (`/wiki/rest/api/content`) actually accepts the exact storage-format
  XHTML `markdown-to-storage.ts` and `index-table.ts` produce — untested against a real API response
  shape (noted explicitly as a risk during implementation).
- The real optimistic-locking version-bump behavior on update actually works as
  `client.ts`'s `updatePage` assumes (fetch-then-increment).
- The "reuse Jira credentials by default" auth path (`JIRA_SITE_URL`/`JIRA_INTAKE_EMAIL`/
  `JIRA_INTAKE_API_TOKEN`) actually resolves against a real Atlassian tenant — this exact assumption
  was already found to be *wrong* once during code review (documentation-mcp read `JIRA_EMAIL`/
  `JIRA_API_TOKEN`, which don't exist) and fixed against ai-intake-mcp's real `GlobalConfig`, but a
  live check is the only way to confirm nothing else is still mismatched.
- The two independently-built index-table parsers (one per repo) actually agree, byte-for-byte, on
  what a *real* Confluence page's storage format looks like — this was deliberately deferred to here
  (Verification #3 in the authoring plan) rather than assumed from matching test fixtures.
- The full `ai-intake-mcp` planning-procedure integration: does a real ticket asking for a Symfony
  upgrade actually cause a real planning agent to find and cite the guide, end to end.
- Confluence API permissions: does the configured token need space-admin/edit rights beyond a normal
  user's — genuinely unknowable until this is run (the one open question neither plan resolved).

## Real run log (2026-09-06/07)

Real Confluence Cloud site: `dmahal.atlassian.net` (free Jira account, Confluence added to the same
site, free tier). Real space: `QT`. Index page created **by hand** in the Confluence UI rather than
via `ensure_guide_index` (a deviation from Phase A step 2 below, noted there) at
`https://dmahal.atlassian.net/wiki/spaces/QT/pages/196804/AI+Context+Guides`, containing only
placeholder prose (an intro paragraph, an "Updates" heading, three plain-text lines naming the
Symfony hops) — no actual table. `~/.config/ai-intake-mcp/.env` already had real, working
`JIRA_SITE_URL`/`JIRA_INTAKE_EMAIL`/`JIRA_INTAKE_API_TOKEN` from prior Jira use; added
`CONFLUENCE_SPACE_KEY=QT` and `CONFLUENCE_GUIDE_INDEX_URL=<the page above>` by hand (again bypassing
`ensure_guide_index`'s normal auto-write path, since the page already existed).

**3 real bugs found and fixed, none caught by 451 combined pre-existing unit tests or code review:**

1. **`documentation-mcp`'s `ConfluenceClient` rejected a bare-domain `JIRA_SITE_URL`.** The real
   config value is `dmahal.atlassian.net` (no `https://` scheme) — `ai-intake-mcp`'s own client
   already normalizes this, but `documentation-mcp`'s didn't, and would have thrown on the very
   first real `fetch()` call. Found by inspecting the real config value before running anything, not
   by a failure. Fixed (`ai-intake-documentation-mcp` PR, commit `ce29d32`).
2. **Entity decoding, both repos.** Confluence's storage format autoformats plain Unicode
   typographic characters into named HTML entities on save — publishing "Symfony 4→5 Upgrade" via a
   real `sync_guide` call came back from Confluence's API as "Symfony 4&rarr;5 Upgrade", and neither
   `index-table.ts` (documentation-mcp) nor `index-parser.ts` (ai-intake-mcp) decoded anything beyond
   `&amp;`/`&lt;`/`&gt;`. Fixed in both (documentation-mcp commit `0f659e8`, ai-intake-mcp commit
   `a2e57ea`) with the same entity set, confirmed live afterward: `list_guides` on both sides now
   correctly reads back the real arrow character.
3. **`ai-intake-mcp`'s `storage-text.ts` silently destroyed every real command in a guide.** Its
   blanket tag-strip regex has no concept of `<![CDATA[...]]>` and matched clean through from the
   opening `<![CDATA[` to the *first* `>` it found — the one inside the CDATA section's own closing
   `]]>` — deleting the entire real command content and leaving only the code macro's leftover
   `language` parameter text ("none") behind. This file had **zero test coverage** before being
   fixed, and its one existing caller's test fixture used a plain `<code>` tag rather than
   Confluence's actual `ac:structured-macro`/CDATA shape — exactly why 366 passing tests never
   caught it. Fixed (ai-intake-mcp commit `a2e57ea`), confirmed live: `fetch_guide` on the real
   published guide now returns every real command (`composer update symfony/*...`,
   `vendor/bin/phpunit`, etc.) instead of the literal word "none".

**Real results after all three fixes**, confirmed by direct calls to the built tools against the
live page (not through a full MCP host — direct Node invocation of the compiled `dist/` code):
- `ensure_guide_index`... not run this way (page pre-existed by hand) — see Phase A note.
- `sync_guide` — real call, `title: "Symfony 4→5 Upgrade"`, real content including a heading,
  prose, ordered steps, and 4 fenced code blocks. Result: `{"status":"created","url":".../pages/458754/..."}`.
  This **overwrote** the hand-created page's placeholder prose with the real index table, as
  expected and confirmed with the user beforehand.
- `list_guides` (documentation-mcp) — real call, correctly returned the one published guide,
  title/description/tags all correct (post entity-decoding fix).
- `list_guides` (ai-intake-mcp) — real call, agrees byte-for-byte with documentation-mcp's read —
  **Verification #3 from the authoring plan, confirmed for real.**
- `fetch_guide` (ai-intake-mcp) — real call, full content correct (post CDATA fix), and a real call
  with a title not in the index correctly rejected with `"... is not in the guide index."` (the
  "no raw search" boundary, confirmed against a real index, not a mocked one).

## Who runs this

Needs a real Confluence Cloud space with edit access, a real Atlassian API token, and a throwaway
Jira test project — same category of prerequisite as `headless-automation-qa.md`. I can drive
individual steps if asked (calling a specific tool, reading back a response, inspecting file
contents) but I don't have real org credentials, and whether rendered Confluence content actually
*looks right* to a human is exactly the kind of judgment call this plan exists to have a human make
before trusting the feature unattended.

## Prerequisites

- [ ] Both branches checked out and built (`add-confluence-guide-authoring` in
      `ai-intake-documentation-mcp`, `add-confluence-guide-retrieval` in `ai-intake-mcp`),
      `npm test` green on both — confirmed already as of 2026-09-06 (85/85, 366/366).
- [ ] A **throwaway Confluence Cloud space** you don't mind creating/editing test pages in — not a
      production knowledge base.
- [ ] `~/.config/ai-intake-mcp/.env` populated with real, working `JIRA_SITE_URL`,
      `JIRA_INTAKE_EMAIL`, `JIRA_INTAKE_API_TOKEN` (needed for Phase A's default-credentials check
      regardless of whether you use Jira features at all), plus `CONFLUENCE_SPACE_KEY` set to the
      throwaway space's key.
- [ ] A throwaway Jira test project/ticket, for Phase E.
- [ ] Both MCP servers registered against each branch's built `dist/` in whatever host you're
      testing through (Claude Code, Gemini CLI, etc.) so the actual tools are callable, not just
      unit-testable.

## Phase A — Config smoke test (no writes yet)

**Objective**: confirm the "absent config = feature fully off" and default-credentials behaviors
against real config-loading, before any real Confluence write happens.

1. **Not run live** — doesn't touch Confluence at all regardless of outcome, and is exhaustively
   covered by unit tests (`config.test.ts`, `list-guides.test.ts` on both repos); no additional
   confidence from re-running it against a real (absent) config.
2. **Deviated.** The index page was created **by hand** in the Confluence UI instead of via
   `ensure_guide_index`, so this step's own create-path was never exercised. What *was* confirmed
   live: `CONFLUENCE_SPACE_KEY`/`CONFLUENCE_GUIDE_INDEX_URL` set by hand, then a raw `getPageById`
   call against the real page succeeded — this is what surfaced Bug 1 (bare-domain `JIRA_SITE_URL`,
   see "Real run log" above) before any write was attempted.
3. **Confirmed, but not as specified.** The page exists and is reachable, but since it was
   hand-created rather than produced by `ensure_guide_index`, it did **not** have the expected empty
   four-column table — it had placeholder prose instead (see "Real run log"). Real table structure
   was only established once Phase B's `sync_guide` call ran and replaced the page body.
4. **PASSED**, run for real after Phase B (order swapped from the plan, since the page already
   existed): `ensure_guide_index` with no arguments against the now-configured real page returned
   `{"status":"conformant","url":"https://dmahal.atlassian.net/wiki/spaces/QT/pages/196804/AI+Context+Guides"}`
   — correctly recognized the existing page, did not create a duplicate.

## Phase B — First real guide publish

**Objective**: the first real write, and the first real check of the markdown → storage-format
conversion against Confluence's actual renderer.

**PASSED, after fixing 2 of the 3 real bugs found this session** (see "Real run log" above).

1. **Done.** Real `sync_guide` call, title "Symfony 4→5 Upgrade", content with a heading, prose,
   ordered steps, and 4 fenced code blocks. First attempt surfaced Bug 1 (site URL); after fixing,
   returned `{"status":"created","url":".../pages/458754/Symfony+4+5+Upgrade"}`.
2. **Not visually confirmed in the Confluence UI** (only verified programmatically, by fetching the
   real page back via the API) — worth a human eyeballing the actual rendered page at least once
   before treating this as fully closed, per this plan's own "who runs this" caveat about judgment
   calls a human should make.
3. **Confirmed programmatically, not yet visually.** `list_guides` (documentation-mcp) round-tripped
   the index correctly (title/description/link/tags all correct) — but only after fixing Bug 2
   (entity decoding); before that fix, the title came back as literal `"Symfony 4&rarr;5 Upgrade"`.
4. **PASSED** — see step 3; same call.

## Phase C — Update path, including the page_id-not-found fix

**Objective**: confirm updates work, and specifically confirm the bug found and fixed during code
review (`sync_guide` erroring rather than silently creating a duplicate on a bad `page_id`) holds
against the real API's actual 404 behavior, not just a mocked one.

1. Call `sync_guide` again with the **same title**, different description/content.
   **Pass**: response reports "updated", not "created". The Confluence page's version number
   incremented (check the page's version history in the UI). The index still has exactly one row
   for this title (replaced, not duplicated).
2. Note the guide page's real numeric Confluence page ID from its URL. Call `sync_guide` again with
   an explicit `page_id` set to that ID and yet another content change.
   **Pass**: updates the same page (confirm via version history again incrementing).
3. Call `sync_guide` with a deliberately wrong `page_id` (e.g. `"999999999"`, or any ID you're
   confident doesn't exist in your space).
   **Pass**: returns a clear error naming that `page_id` — **no new page gets created**. This is the
   real-API confirmation of the fix made during code review; the unit test only proves it against a
   mocked 404.

## Phase D — Read-side round trip (`ai-intake-mcp`)

**Objective**: the two independently-built index-table parsers' real agreement check — deliberately
deferred here rather than assumed from matching test fixtures (Verification #3 in the authoring
plan).

**PASSED, after fixing Bug 2 (both repos) and Bug 3** (see "Real run log" above) — run ahead of
Phase C since the read side was the priority once Phase B produced real content to read.

1. **PASSED.** `ai-intake-mcp`'s `list_guides` against the real page agrees exactly with
   documentation-mcp's own read (Verification #3, confirmed for real) — but only after Bug 2's fix;
   before it, this side had the identical `&rarr;` literal-text problem, independently.
2. **PASSED, after fixing Bug 3.** Before the fix, `fetch_guide`'s real content had every command
   inside a fenced code block replaced by the literal word "none" — the CDATA-swallowing bug (see
   "Real run log"). After the fix, real content includes every real command
   (`composer update symfony/*...`, `vendor/bin/phpunit`, etc.), confirmed by direct inspection.
3. **PASSED.** A real call with a title not in the index (`"Not A Real Guide"`) was correctly
   rejected: `"Not A Real Guide" is not in the guide index. Call list_guides to see available
   titles."` — the "no raw search" boundary holds against the real index.

## Phase E — Full planning-procedure integration

**Objective**: the actual end-user scenario both plans exist for — does a real ticket cause a real
planning agent to find and use the guide.

1. Create a real, throwaway Jira ticket along the lines of "Upgrade billing-app from Symfony 4.4 to
   5.x."
2. Run the real `plan_ticket` prompt against it (or drive `docs://planning-procedure` manually),
   with both MCP servers' real tools available.
   **Pass**: the planning agent calls `list_guides`, matches the ticket against the published guide,
   calls `fetch_guide`, and the resulting plan file has a `**Guides used**:` line naming it.
3. Check the ticket comment the planning session posts.
   **Pass**: the guide is named in the comment summary, per `curated-guide-retrieval.md`'s Key
   decision #2.

## Phase F — Auth-fallback confirmation

**Objective**: confirm both the default-credentials path and (if applicable) the override path work
for real — not just against the unit tests' fabricated fixtures.

1. If Phases A–E all ran with only `JIRA_INTAKE_EMAIL`/`JIRA_INTAKE_API_TOKEN` set (no
   `CONFLUENCE_*` overrides), that already live-confirms the shared-credentials default — note this
   explicitly in your results rather than leaving it implicit.
2. **If** your org's Confluence is actually a separate tenant/credentials from Jira, additionally set
   `CONFLUENCE_SITE_URL`/`CONFLUENCE_EMAIL`/`CONFLUENCE_API_TOKEN` and re-run Phase A step 1
   (`list_guides`). **Pass**: the override values take precedence and auth still resolves correctly.
   Skip this step if your tenant genuinely is shared — there's nothing to override.

## Sign-off

- [ ] Phase A passed
- [ ] Phase B passed
- [ ] Phase C passed
- [ ] Phase D passed
- [ ] Phase E passed
- [ ] Phase F passed (default-credentials case at minimum; override case if your org needs it)

**Verdict: not yet run.** Neither PR should be treated as production-ready for a real org rollout
until every phase above passes for real — the 85/85 and 366/366 unit tests only prove internal
logic against mocks, not real Confluence/Jira behavior. Record the actual run's evidence (page
links, screenshots, ticket links) in this file, in place, the same way `headless-automation-qa.md`
does, when this is actually executed.

## Open items this plan deliberately does not resolve

- **Confluence Server/Data Center** — only Cloud is confirmed as the deployment in use (both plans'
  now-resolved Key decision on shared auth). If your org later moves to Server/DC, re-verify every
  phase above there; the REST API v1 endpoint is expected to still work, but is unconfirmed on that
  deployment type.
- **Load/scale** — this plan exercises one guide on an otherwise-empty or single-row index, not a
  large catalog. Table-parsing correctness/performance at scale (dozens of rows) is unverified.
- **The lessons-learned feedback loop** — deferred as out of scope in both plans (hook point named,
  not built), so obviously untested here too.
