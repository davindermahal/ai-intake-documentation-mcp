## Motivation

`ai-intake-mcp`'s `curated-guide-retrieval.md` (its own draft plan) already anticipated this: "Curation/
staleness risk is accepted as a tradeoff for control. Consider a 'last reviewed' column later." Right
now the shared guide index (Title | Description | Link | Tags) has no signal for how recently a guide
was actually touched — neither a human curator nor a planning agent deciding whether to trust a guide
has anything to go on. This repo (`documentation-mcp`) is the index's sole writer (`sync_guide`), so
this is the write-side half of adding that signal.

**Companion plan**: `ai-intake-mcp`'s `.ai/plans/draft/guide-index-last-modified-column.md` (a plain
hand-written plan file, matching that repo's own convention — its `.ai/` predates this tool's
`ensure_ai_dir`/manifest scheme, so it isn't managed via `write_plan`) is the read side of this exact
same table shape. The two plans must agree on the column name, position, and date format below — that
agreement *is* the design, not an implementation detail either side can quietly drift on later (same
class of risk as the original authoring plan's Verification #3: "the two independently-built parsers
must agree on the table's exact shape").

## Goals (v1)

- Index table gains a fifth column, header text exactly `Last Modified`, appended after `Tags` (not
  inserted between existing columns) — additive, minimizes risk to anything positionally reading the
  first four columns.
- Date format: plain ISO date, `YYYY-MM-DD` (no time-of-day component — a guide's staleness doesn't
  need sub-day precision, and a bare date reads cleanly in the Confluence UI table).
- `sync_guide` stamps the current date (server "now", not any Confluence-derived timestamp — no extra
  API round-trip needed since this tool is the sole writer and already knows exactly when the write
  happens) into that column on **every** upsert — both create and update.
- Migration: the real index page already published under the 4-column shape (per the original
  authoring plan, currently in QA) must keep working. The next time `sync_guide` or
  `ensure_guide_index` touches that page, detect a 4-column table and upgrade it in place: add the
  `Last Modified` header, backfill existing rows with a blank cell (never a fabricated date) — the
  row being upserted in that same call gets a real date, untouched rows stay blank until their next
  sync.

## Out of scope (v1)

- Any staleness enforcement/alerting (flagging guides older than N days). Just the data column; acting
  on it is left to the read side / agent judgment, per the companion plan.
- Recomputing accurate historical dates for already-published guides. Migration backfills blank, not
  a guess.
- Changing the Title/Description/Link/Tags columns' shape or order.

## Design overview

### 1. `index-table.ts` — parse/serialize gains the 5th column

`parseIndexTable`'s row shape gains `lastModified: string` (empty string for a blank/unmigrated cell,
never `undefined`, to keep the type simple since every row will have the column present after the
migration step runs). `serializeIndexTable` writes the 5-column header and cells.

### 2. Migration: detect column count on read, upgrade on write

`parseIndexTable` tolerates both a 4-column and 5-column table on input (old page, not yet migrated
by any call vs. already-migrated). Whichever tool next calls `serializeIndexTable` on that page's rows
always writes the current 5-column shape — so a single `sync_guide` or `ensure_guide_index` call
against an old page silently upgrades it, no separate migration tool needed.

### 3. `sync_guide` stamping

In `packages/documentation-mcp/src/tools/syncGuide.ts`, the row passed to `upsertIndexRow` gains
`lastModified: new Date().toISOString().slice(0, 10)` (the upserted row only — every other row keeps
whatever `lastModified` it already had after the parse step above, blank or not).

## Key decisions

### 1. Column position: append after Tags

Rejected inserting it earlier (e.g. between Description and Link) — appending is strictly additive and
safest against anything that might positionally index into the first four columns rather than by
header name (nothing in either repo does today, but no reason to introduce that risk for free).

### 2. Date-only, not a full timestamp

Resolved: `YYYY-MM-DD`. Sufficient precision for a staleness signal a human or agent is going to eyeball,
not compute a diff against down to the second.

### 3. Migration ownership: write side upgrades in place, read side must not assume it already ran

This repo owns upgrading an existing 4-column page (Goals above). But because this repo and
`ai-intake-mcp` are two independently deployed tools that won't always be on matching versions, the
read side's parser (companion plan) is specified to tolerate a missing 5th column defensively too —
belt-and-suspenders, not a substitute for this side actually doing the upgrade.

## Open questions

None — column name, position, format, and migration ownership are all decided above, matching the
companion plan.

## Implementation steps (draft)

1. Update `packages/documentation-mcp/src/confluence/index-table.ts`: `parseIndexTable` tolerant of
   4- or 5-column input, `lastModified` defaults to `""` when absent; `serializeIndexTable` always
   emits 5 columns.
2. Update `packages/documentation-mcp/src/tools/syncGuide.ts`: stamp `lastModified` on the upserted
   row per Design overview §3.
3. Confirm `ensure_guide_index`'s empty-table bootstrap path already creates a 5-column table from
   the start (no migration needed for a page that's created fresh after this ships).
4. Unit tests in `packages/documentation-mcp/test/`: extend `index-table` fixtures with a legacy
   4-column fixture (parses, `lastModified: ""` on every row) and a 5-column fixture (parses/serializes
   round-trip exactly); extend `sync-guide.test.ts` to assert the upserted row's `lastModified` matches
   today's date (mock/inject the clock if the existing test setup makes that easy, otherwise assert
   the format via regex rather than an exact value).

## Verification

1. `npm run build && npm test`.
2. Real dry run (manual, live credentials, piggybacking on this plan's sibling plans' own live
   testing): run `sync_guide` against the real, currently-4-column index page from the original
   authoring plan's QA; confirm it upgrades to 5 columns with only the touched row's date populated,
   and every other existing row's `Last Modified` cell is blank (not fabricated) until its own next
   sync.
3. Hand off to the companion `ai-intake-mcp` plan's own verification once this ships — its round-trip
   check depends on a real page written by this implementation.