# Project context

Monorepo: `packages/confluence-client`, `packages/context-schema`,
`packages/documentation-mcp` — each an independently versioned/published npm
package (`@davindermahal/<name>`). Root `package.json` is `"private": true`
and is never itself published.

## Releasing

Publishing happens **only** via a pushed release tag, never a local
`npm publish` — packages publish through OIDC trusted publishing in CI
(`.github/workflows/release.yml`), which has no `NPM_TOKEN` secret. A local
personal npm token isn't the sanctioned path and skips CI's build/test gate.

For each package you're releasing:

1. Bump `"version"` in `packages/<package-dir>/package.json` (semver; patch
   for bug fixes).
2. If `packages/<package-dir>/CHANGELOG.md` exists, add a dated entry
   (`## <version> — YYYY-MM-DD` with `### Added`/`### Changed`/`### Fixed`
   subsections, matching existing entries). `context-schema` currently has
   no CHANGELOG.md — don't add one unless asked, that's a deliberate gap,
   not an oversight.
3. From repo root: `npm run build && npm test` — confirms everything still
   passes before tagging.
4. Commit (bundle all changed `package.json`/`CHANGELOG.md` files together
   if releasing multiple packages in one pass).
5. `git push origin main`.
6. Tag + push, once per package released:
   ```bash
   git tag -a <package-dir>@<version> -m "<package-dir> <version>"
   git push origin <package-dir>@<version>
   ```
7. Pushing the tag triggers the release workflow: it verifies the tag
   matches `package.json`, builds in dependency order
   (`confluence-client` → `context-schema` → `documentation-mcp`), runs
   `npm test`, then publishes. Watch it with `gh run list` /
   `gh run watch <run-id>`.

`documentation-mcp` depends on `context-schema`/`confluence-client` via
`^0.1.0` caret ranges, so a patch/minor bump to either doesn't require
touching `documentation-mcp`'s dependency declaration — only bump
`documentation-mcp`'s own version+changelog if its own code changed too.
