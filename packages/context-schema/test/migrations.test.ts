import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, emptyManifest } from "../src/manifest.js";
import { migrateManifestRaw } from "../src/migrations.js";

describe("migrateManifestRaw", () => {
  it("is a no-op (0 steps) when the manifest is already at the current schema version", () => {
    const raw = emptyManifest();
    const { manifest, fromVersion, steps } = migrateManifestRaw(raw);
    expect(steps).toBe(0);
    expect(fromVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(manifest.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("throws a clear error when no migration step covers an unknown older version", () => {
    const raw = { ...emptyManifest(), schema_version: "0.0.9" };
    expect(() => migrateManifestRaw(raw)).toThrow(/no migration path from schema_version "0.0.9"/);
  });
});
