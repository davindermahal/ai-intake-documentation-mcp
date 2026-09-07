# Confluence guide retrieval/authoring — end-to-end QA / dry run

**Status**: active — **not yet run**. This document is the plan to execute, not a record of
execution. Nothing below has happened yet.
**Created**: 2026-09-06
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

1. With only `JIRA_SITE_URL`/`JIRA_INTAKE_EMAIL`/`JIRA_INTAKE_API_TOKEN` set (no `CONFLUENCE_*`
   overrides, no `CONFLUENCE_GUIDE_INDEX_URL`, no `CONFLUENCE_SPACE_KEY` yet), call `list_guides` on
   **both** servers.
   **Pass**: both report a clean "not configured" result — no crash, no confusing error, no attempt
   to reach Confluence at all.
2. Set `CONFLUENCE_SPACE_KEY` only (still no index URL). Call `ensure_guide_index` (documentation-mcp)
   with no arguments.
   **Pass**: creates a real page in that space, returns a real URL, **and** that exact
   `CONFLUENCE_GUIDE_INDEX_URL=...` line now exists in `~/.config/ai-intake-mcp/.env` — open the
   file directly, don't just trust the tool's return value.
3. Open the created page in the real Confluence UI.
   **Pass**: it exists, titled "AI Agent Guides" (or whatever title you passed), with an empty
   four-column table (Title | Description | Link | Tags headers only, zero data rows).
4. Re-run `ensure_guide_index` with no arguments.
   **Pass**: reports the "already conformant" status — does **not** create a second page. Confirm
   in the Confluence UI that only one page exists.

## Phase B — First real guide publish

**Objective**: the first real write, and the first real check of the markdown → storage-format
conversion against Confluence's actual renderer.

1. Call `sync_guide` with a real, small guide — reuse the Symfony 4→5 upgrade proof case both plans
   name. Deliberately include at least one heading, one ordered list, and one fenced code block, so
   every branch of `markdown-to-storage.ts` gets exercised against the real API in one pass.
2. Open the resulting page in the real Confluence UI.
   **Pass**: the heading renders as an actual heading (not literal `#` characters), the list renders
   as a real numbered list, and the code block renders inside Confluence's code macro with a
   language label — not as escaped plain-text paragraphs.
3. Open the index page.
   **Pass**: exactly one new row. Title/Description match what was sent, Link is a real, clickable
   link to the guide page, Tags render as expected from the comma-separated input.
4. Call `list_guides` (documentation-mcp).
   **Pass**: the new guide appears with the right title/description/tags.

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

1. With `CONFLUENCE_GUIDE_INDEX_URL` now pointing at the real page from Phases B/C, call
   `ai-intake-mcp`'s `list_guides`.
   **Pass**: sees the exact same guide(s) `documentation-mcp` published — titles/descriptions/tags
   match exactly, byte for byte on the visible text.
2. Call `fetch_guide` with the guide's exact title.
   **Pass**: returns real content that recognizably matches what was published (headings/steps
   intact after the storage-format → plain-text conversion on this side).
3. Call `fetch_guide` with a title that is **not** in the index.
   **Pass**: a clear error, not a raw Confluence search and not a crash — confirms the "no raw
   search" boundary holds against a real index, not just a mocked one.

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
