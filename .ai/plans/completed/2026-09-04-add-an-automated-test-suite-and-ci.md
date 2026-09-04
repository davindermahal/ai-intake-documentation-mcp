# Add an automated test suite and CI

## Why

Every tool in this project has only ever been verified by manually running throwaway `.mjs`
scripts against scratch directories, copy-pasted and re-run by hand after each change (they live
in a session scratchpad, not the repo). That's already caught real bugs (the `scan_project`
root-only gap), which is exactly the argument for making verification permanent and automatic
instead of something that only happens when someone remembers to re-run five separate scripts.

## Proposed design

**Framework: Vitest.** ESM-native (matches this project's `"type": "module"` + NodeNext setup
throughout), fast, minimal config, first-class TypeScript support without a separate compile
step. Node's built-in `node --test` was considered — zero extra dependency — but Vitest's nicer
assertions and watch mode are worth one devDependency for a project this size. Flagging this as
the one real judgment call in this plan, in case you'd rather go dependency-free.

**Structure** — one `test/` directory per package, mirroring `src/`:

```
packages/context-schema/test/
  evidence.test.ts       # createEvidence/evidenceFilename/appendEvidence/markSynthesized/pendingCounts
  plans.test.ts            # slugify, filename collision suffixing, writePlan/movePlan round-trips
  migrations.test.ts        # migrateManifestRaw: no-op at current version, clean error on no path
  context.test.ts            # writeContextChunk/readContextChunk sidecar pairing

packages/documentation-mcp/test/
  helpers.ts                # shared: mkTempRepo() -> git-init'd scratch dir, cleaned up after
  detect-init.test.ts         # absent/conformant/outdated/non-conformant, init idempotency
  scan.test.ts                  # depth search, existing_agent_docs, node_modules exclusion, CI
                                  #   staying root-only — direct ports of smoke-test-scan-fixes.mjs
  evidence-synthesis.test.ts     # record -> list -> write_doc/write_context_chunk -> counters
  migration.test.ts               # propose/apply on a non-conformant .ai/, confirm/remove_originals
  plans.test.ts                    # write/list/transition through draft/active/completed
  upgrade.test.ts                   # missing-dir backfill, unmigratable schema_version failing clean
```

Each existing smoke-test script maps directly to one file above — this is a mechanical port, not
a rewrite of what's being verified, since the scripts already found real bugs and already encode
the right assertions.

**Config**: one root `vitest.config.ts` (workspace-aware via `projects`, or simplest: point it at
`packages/*/test/**/*.test.ts` directly — a decision to make concretely at implementation time,
not worth over-specifying here). `vitest` and `@types/node` (already a dependency) added as a root
devDependency; a `test` script added to the root `package.json` (`vitest run`).

**CI**: `.github/workflows/ci.yml` — checkout, `actions/setup-node` (Node 24, matching local dev),
`npm ci`, `npm run build`, `npm test`. Triggers on push and PR to `main`. Deliberately minimal —
one Node version, no matrix — since this isn't a published library yet needing broad compat
testing.

## Explicitly not in scope for this pass

- Testing the actual stdio MCP transport / `index.ts` wiring (`server.registerTool` calls) —
  the tool handlers themselves are what's being tested; the transport layer is the SDK's problem,
  not ours.
- Coverage thresholds/reporting — can layer on later once a suite exists.
- Testing `ai-intake-mcp` or `ai-intake-harness` — out of this repo entirely.

## Execution steps (once approved)

1. Add `vitest` (+ config) at the root; `test` script.
2. Port each smoke-test script to its corresponding `test/*.test.ts` file per the structure above,
   converting console-log-and-eyeball assertions into real `expect(...)` checks.
3. Delete the now-redundant scratchpad smoke-test scripts (or leave them — they're outside the
   repo already, in session scratch space, so nothing to clean up in-repo).
4. Add the GitHub Actions workflow.
5. Confirm `npm test` passes locally, then push and confirm the workflow runs green.

## Verification

- `npm test` passes locally, covering everything the five existing smoke-test scripts covered.
- A deliberately-broken assertion (temporarily) proves the suite actually fails when something's
  wrong, not just that it runs.
- First CI run on GitHub Actions is green.
