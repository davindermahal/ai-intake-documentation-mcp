import { CURRENT_SCHEMA_VERSION, ManifestSchema, type SetupManifest } from "./manifest.js";

export interface ManifestMigrationStep {
  from: string;
  to: string;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Empty today — only CURRENT_SCHEMA_VERSION ("0.1.0") has ever existed. Add a step here whenever
 * ManifestSchema changes in a way an old manifest can't already satisfy on its own, e.g.:
 *
 *   { from: "0.1.0", to: "0.2.0", migrate: (m) => ({ ...m, new_field: "some-default" }) }
 *
 * migrateManifestRaw walks this chain from a manifest's own schema_version to
 * CURRENT_SCHEMA_VERSION, applying steps in sequence — so bumping the version by more than one
 * step just means adding one step per version, not a combinatorial number of direct paths.
 */
export const MANIFEST_MIGRATIONS: ManifestMigrationStep[] = [];

export function migrateManifestRaw(raw: Record<string, unknown>): {
  manifest: SetupManifest;
  fromVersion: string;
  steps: number;
} {
  let current = raw;
  let version = typeof raw.schema_version === "string" ? raw.schema_version : "unknown";
  const fromVersion = version;
  let steps = 0;

  while (version !== CURRENT_SCHEMA_VERSION) {
    const step = MANIFEST_MIGRATIONS.find((m) => m.from === version);
    if (!step) {
      throw new Error(
        `no migration path from schema_version "${version}" to "${CURRENT_SCHEMA_VERSION}" — add a step to MANIFEST_MIGRATIONS`
      );
    }
    current = step.migrate(current);
    version = step.to;
    steps++;
  }

  return { manifest: ManifestSchema.parse(current), fromVersion, steps };
}
