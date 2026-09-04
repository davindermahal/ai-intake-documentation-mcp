# Backlog after tests/CI

Status as of 2026-09-04. Supersedes `2026-09-04-backlog-after-the-real-dry-run-and-scan-project-fixes.md`
(now `completed`) — its item 1 (automated tests + CI) is done (commit `b748534`: 43 Vitest tests
across 10 files, GitHub Actions running build+test on push/PR). Carrying forward the three items
that weren't scoped to that piece of work.

## Done since the last plan (for context, not action)

- Vitest suite + CI — commit `b748534`.

## Still open

### 1. File the ai-intake-harness integration ticket

Ticket text drafted in conversation, never filed — no create-issue tool available from this
session (`ai-intake-mcp` only exposes get/comment/transition on existing tickets).

**Next action:** file it manually, or do item 3 below first so the tool exists to file it with.

### 2. npm publishing

Package scope is still a placeholder (`@ai-intake/*`). Needs a real decision on public npm vs. an
internal registry, then wiring up `npm publish` and updating the README's `.mcp.json` examples
from local `node` paths to `npx -y @scope/pkg`. This is what makes the server actually installable
by anyone rather than local-path-only.

### 3. Add a create-issue tool to ai-intake-mcp

Gap discovered while trying to file item 1. Separate repo, someone else's backlog to prioritize —
kept here so it isn't lost.

## Recommendation

These three are independent — no ordering dependency forces one first. npm publishing (item 2) is
probably the highest-leverage since it's what makes this project usable by anyone outside this
machine; item 3 is genuinely out of scope for this repo (a different codebase's backlog) and item
1 is blocked on either doing item 3 or filing manually.
