# npm publishing decision and rollout

Status as of 2026-09-04. Carried forward from
`2026-09-04-backlog-after-tests-ci-harness-ticket-npm-publishing-ai-inta.md` (now `completed` — its
other two items are done: the `ai-intake-harness` integration ticket was filed for real as
[DAV-27](https://dmahal.atlassian.net/browse/DAV-27), and the `tracker_create_issue` tool that
filed it is built and committed in `ai-intake-mcp`). This is the one item left, split into its own
plan since there's no committed timeline for it yet — kept in `draft` rather than `active` so the
backlog doesn't misrepresent it as currently in progress.

## Why this is its own plan

The other two items were concrete, scoped, single-session work. This one has open questions that
need a decision before there's an execution plan worth writing — see below. Splitting it out means
the reconciled backlog isn't blocked on resolving those questions first.

## Open questions (need your input before this can become a real execution plan)

1. **Public npm vs. an internal registry.** Affects the npm scope, the auth/publish setup, and
   whether `documentation-mcp`/`context-schema` are meant for anyone outside this machine to use
   yet, or just other repos/sessions you control.
2. **Package scope.** Currently a placeholder — `@ai-intake/context-schema` and
   `@ai-intake/documentation-mcp`. Worth confirming before it's published anywhere real, since
   renaming a published package is disruptive in a way renaming an unpublished one isn't.
3. **Versioning/release process.** Manual `npm publish` per package, or something more automated
   (a release script, changesets, CI-triggered publish on tag)? No CI publish step exists yet —
   the current GitHub Actions workflow only builds and tests.

## What's already true, for whenever this resumes

- Both packages already build clean and pass their own smoke tests via `npm run build`/`npm test`.
- `README.md` already documents the eventual `npx -y @scope/pkg` config shape for both Claude Code
  and Gemini CLI — just needs the placeholder scope swapped for a real one once decided.
- No code changes are needed to *make* these packages publishable — `package.json`'s `name`/
  `version`/`bin` fields are already in place; this is a registry/process decision, not an
  implementation task.

## Next action

None right now — sitting in draft until you're ready to decide the open questions above. When you
are, this can be turned into a real execution plan (transition to `active` or write a fresh one)
with concrete steps once the scope/registry/versioning questions are answered.
