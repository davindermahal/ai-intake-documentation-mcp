# Next steps after Phase 1 + Phase 2

Status as of 2026-09-04. Phase 1 (`420c58d`) and Phase 2 (`ab6f6cd`) are committed and build
clean; verification so far is synthetic scratch-dir smoke tests only — nothing here has been
exercised from a live client session against a real repo yet.

## 1. Real dry run — not started

Use the actual server (already registered in this repo's .mcp.json) from a live Claude Code
session against a real, messy third-party repo — not a synthetic scratch dir. This is the biggest
untested gap: everything verified so far is unit-level, not an actual agent calling these tools in
a real conversation.

**Next action:** restart/reload this Claude Code session so the project-scoped .mcp.json server
is picked up, then run the full tool sequence (detect_ai_dir -> scan_project ->
record_evidence -> list_evidence -> write_doc/write_context_chunk) against a real repo and
see what breaks or reads awkwardly.

**Why first:** likely to surface rough edges in the current tool shape that are cheaper to fix
before locking anything in behind tests, CI, or a published package.

## 2. Automated tests + CI for this repo — not started

No test suite yet (smoke-test scripts only, run manually, not checked into CI). No CI config
either — which is exactly what this repo's own scan_project run flagged as an open question
when we dogfooded it.

**Next action:** convert the smoke-test scripts into a real suite (Vitest or Node's built-in test
runner) checked into the repo, plus a GitHub Actions workflow running npm run build + the suite
on push.

## 3. File the ai-intake-harness integration ticket — drafted, not filed

Ticket text already drafted in conversation. Not filed — no create-issue tool available from this
session.

**Next action:** either file it manually now, or wait until after the dry run.

## 4. npm publishing — not started

Package scope is currently a placeholder (@ai-intake/*). Need a real decision on public npm vs.
an internal registry, then wire up npm publish.

## 5. Add a create-issue tool to ai-intake-mcp — noted, not actioned

Gap discovered while trying to file item #3 above. Separate repo, someone else's backlog.

## Update (2026-09-04)

The plans lifecycle itself (write_plan/list_plans/transition_plan, .ai/plans/{draft,active,completed})
has since been built and documented as its own piece of work, ahead of items 1-5 above — the user
uses plans actively and wanted it formalized. This very file is the first plan created through the
real tool rather than by hand.
