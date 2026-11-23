# Standalone CLI distribution qualification

The initial exact target `node --test tests/cli.test.mjs` failed once because the
CLI channel did not exist. Its formula/manifest cases now pass. The complete
`npm test` suite passes; the existing opt-in native test stays skipped locally.
`npm run check` passes, including Ruby syntax for generated CLI and existing
cask fixtures and production casks. An intermediate misplaced shebang caused
four test-module failures and a syntax-check failure; moving the import below
the shebang repaired those original targets without assertion changes.

The CLI channel verifies a public stable Server release, resolves the actual tag
source and verifies the size/SHA-256 of each canonical archive before writing a
formula or opening a two-file-only PR. It refuses source/tag mismatch, missing
or duplicate targets/assets, altered hashes/coordinates and changed same-version
manifests. Credentials are not forwarded to public downloads. Existing desktop
channels retain their complete tests and progression rules.

Native CI executes formula installation, help/version and `brew test`, reinstall
and uninstall on macOS ARM64 and Linux ARM64/x64 once a verified CLI manifest is
present. Native qualification and the first real formula update remain pending;
this infrastructure commit contains no invented release hashes or formula.
Desktop's existing restricted tap App will reconcile the published CLI release
using this channel. A corrected Server release must report the same executable
and archive version; published older assets are never replaced.

A follow-up exact legacy-version regression failed once before source-version
admission. The verifier now reads the exact tag's CLI Cargo identity and refuses
archives whose release version disagrees with that executable source version.
This keeps existing v2.9.1 archives out of the formula channel while the corrected
patch release is pending. The same exact target and complete Node/Ruby checks
then pass. Prototype-inherited archive target names are refused as well.

The first hosted tap check found two new Homebrew style offenses in the unchanged
Linux desktop-entry interpolation. The exact local XDG regression failed once
before the fix. Both owning generators now compute the same precedence-preserving
path outside interpolation and regenerate their production casks from unchanged
verified manifests. The exact regression passes; the full suite passes 31 cases
with the existing opt-in native case skipped, and local Ruby checks pass.
Hosted Homebrew style and all three native desktop/CLI installation lanes remain
the merge gate; no assertion, threshold, manifest or archive checksum is changed.
