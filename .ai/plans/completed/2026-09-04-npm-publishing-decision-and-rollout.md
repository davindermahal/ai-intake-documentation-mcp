# npm publishing decision and rollout

**Status**: complete — all three open questions below resolved, differently than originally framed.
Both packages are live on public npm (`@davindermahal/documentation-mcp@0.3.0`,
`@davindermahal/context-schema@0.1.1`, confirmed via `npm view`), and the sibling `ai-intake-mcp`
repo (`@davindermahal/ai-intake-mcp@0.2.0`) shipped the same way. Versioning/release (open question
#3) landed as a real CI workflow, not the "release script or changesets" the question posed:
`.github/workflows/release.yml`, triggered by pushing an annotated tag matching
`<package-dir>@<semver>` (this repo) / `v<semver>` (`ai-intake-mcp`), using npm's OIDC Trusted
Publisher (no `NPM_TOKEN` secret) — verified via real, successful runs (`documentation-mcp@0.3.0`
2026-09-08, `ai-intake-mcp v0.2.0` 2026-09-08, the latter after fixing two real CI failures live:
missing `libsecret-1-0`, an `npm ci` install-scripts allowlist gap). Tag-vs-`package.json`-version
mismatch and (this repo's monorepo case) a private-root canary both fail the job before any publish
step, so a malformed tag or a stale version bump can't reach the registry.
**Updated**: 2026-09-08

Status as of 2026-09-04 (superseded above). Carried forward from
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
2. **Package scope.** ~~Currently a placeholder~~ ~~Resolved 2026-09-05: `@dmahal`~~ **Superseded
   2026-09-05**: `@davindermahal` — your actual npm username's personal scope (free, automatic, no
   org needed), used instead of the separately-created `@dmahal` org. Packages renamed to
   `@davindermahal/context-schema` and `@davindermahal/documentation-mcp` across `package.json`,
   source imports, and docs.
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
