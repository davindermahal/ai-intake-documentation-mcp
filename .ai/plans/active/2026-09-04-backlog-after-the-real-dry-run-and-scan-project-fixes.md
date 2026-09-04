# Backlog after the real dry run and scan_project fixes

Status as of 2026-09-04. This supersedes `2026-09-04-next-steps-after-phase-1-and-phase-2.md`
(now `completed`) — that plan's top-priority item (the real dry run) is done, along with follow-on
work it wasn't scoped to predict (3 real bugs found and fixed, the plans lifecycle built, the
outdated/upgrade mechanism built). Closing it out rather than leaving it open kept the active-plan
list honest; this plan carries forward everything from it that's still genuinely open, plus what's
changed since.

## Done since the last plan (for context, not action)

- Real dry run against two real external projects — found and fixed: `scan_project`'s root-only
  search, missing AI-agent-doc detection, and a gap in evidence `source` values. Commit `8444c06`.
- Plans lifecycle (`write_plan`/`list_plans`/`transition_plan`) — commit `7cd7500`.
- `outdated` detection + `upgrade_ai_dir` for schema/scaffold drift — commit `1414925`.
- Live MCP connectivity confirmed for the first time this session (this repo's own `.mcp.json`
  server, reachable as real tool calls, not scripts) — `get_setup_status`, `list_plans`,
  `check_drift`, `list_evidence`, `write_doc`, and `scan_project` all called for real against this
  repo and behaved correctly, including finding both workspace `package.json` files one directory
  deep (direct confirmation the depth-search fix works outside a test harness).
- The one lingering unsynthesized evidence entry from Phase 1 (the founding-conversation record)
  is now marked synthesized via `docs/project-context.md`, whose "Current status" section was also
  brought up to date (it still said Phase 1-only, migration/synthesis/drift "not yet built").

## Still open

### 1. Automated tests + CI for this repo

No test suite yet — verification has been manual smoke-test scripts (not checked into the repo)
run by hand after each change. No CI config either, which `scan_project`'s own run against this
repo just confirmed again (`ci_config: []`).

**Next action:** convert the smoke-test scripts into a real suite (Vitest or Node's built-in test
runner), check it into the repo, add a GitHub Actions workflow running `npm run build` + the suite
on push.

### 2. File the ai-intake-harness integration ticket

Ticket text drafted in conversation, never filed — no create-issue tool available from this
session (`ai-intake-mcp` only exposes get/comment/transition on existing tickets).

**Next action:** file it manually, or address item 4 below first so the tool exists.

### 3. npm publishing

Package scope is still a placeholder (`@ai-intake/*`). Needs a real decision on public npm vs. an
internal registry, then wiring up `npm publish` and updating the README's `.mcp.json` examples
from local `node` paths to `npx -y @scope/pkg`.

### 4. Add a create-issue tool to ai-intake-mcp

Gap discovered while trying to file item 2. Separate repo, someone else's backlog to prioritize —
kept here so it isn't lost.

## Recommendation

Tests/CI (item 1) is the highest-leverage next piece — everything built so far has only ever been
manually verified, and a real suite would catch the next real-world gap `scan_project`-style
without needing another live dry run to find it. Items 2-4 don't depend on it and can happen in
any order/parallel.
