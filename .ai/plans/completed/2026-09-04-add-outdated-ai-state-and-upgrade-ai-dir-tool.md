# Add outdated .ai/ state and upgrade_ai_dir tool

## Context

detect_ai_dir originally had three states: absent, conformant, non-conformant. Anything that
failed manifest validation — including a .ai/ written by an older version of this same tool —
fell into non-conformant, the same bucket as totally foreign content. That's the wrong remedy: an
old-but-ours manifest needs a cheap in-place upgrade, not full re-ingestion as evidence via
apply_ai_dir_migration.

This was also directly motivated by a real gap found while building the plans lifecycle: this
repo's own .ai/ was briefly missing plans/{draft,active,completed} while detect_ai_dir still
reported conformant, because conformant only checked that the manifest parsed — never that the
expected directories actually existed.

## Design

- detect_ai_dir now reads the manifest raw (readManifestRaw, no strict validation) and classifies
  into four states: absent, conformant (current schema_version, fully valid, all SCAFFOLD_DIRS
  present), outdated (has a schema_version — recognizably ours — but stale and/or missing
  directories), non-conformant (no schema_version at all, truly foreign).
- New upgrade_ai_dir tool: migrates the manifest through MANIFEST_MIGRATIONS (a from->to step
  chain in context-schema/src/migrations.ts, empty today since only 0.1.0 has ever existed), then
  unconditionally backfills any missing SCAFFOLD_DIRS entry. Directory backfill needs no
  per-version logic — the current SCAFFOLD_DIRS list is always correct to create, regardless of
  which old version is being upgraded from.
- init_ai_scaffold and propose_ai_dir_migration both updated to redirect to upgrade_ai_dir on an
  outdated repo instead of their old messages.

## Files changed

- packages/context-schema/src/manifest.ts — added readManifestRaw.
- packages/context-schema/src/migrations.ts — new: ManifestMigrationStep, MANIFEST_MIGRATIONS
  (empty), migrateManifestRaw.
- packages/documentation-mcp/src/tools/detectAiDir.ts — four-state classification.
- packages/documentation-mcp/src/tools/upgradeAiDir.ts — new tool.
- packages/documentation-mcp/src/tools/initAiScaffold.ts, proposeAiDirMigration.ts — outdated
  branch/message fixes.
- .ai/docs/architecture.md, README.md — documented the four states and the new tool.

## Verification

Three smoke-test scenarios, all passed:
1. Missing directory (this repo's exact real case): init -> conformant -> delete plans/completed
   by hand -> outdated with correct missing_dirs -> upgrade_ai_dir backfills it -> conformant
   again -> re-running upgrade_ai_dir on an already-conformant repo is a clean no-op.
2. Unmigratable schema_version (hand-edited to 0.0.9): detect_ai_dir reports outdated,
   upgrade_ai_dir fails with a clear error naming the missing migration step rather than crashing
   or silently corrupting the manifest.
3. Non-conformant repo (foreign .ai/ content): unaffected by any of the above — still routes to
   the existing migration flow, upgrade_ai_dir correctly refuses it.

Re-ran all prior smoke tests (Phase 1, Phase 2, plans lifecycle) to confirm no regressions —
all passed unmodified.

Committed as ca712b2 (this plan file is being added retroactively via commit --amend, per the
now-documented rule that all planning work must have a plan file under .ai/plans/).