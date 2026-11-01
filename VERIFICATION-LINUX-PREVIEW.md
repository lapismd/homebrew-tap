# Linux Tauri preview compatibility

Source baseline: tap `4efedaead3b651d511ed8e20239e8ddaeac87617`, Desktop
`b5a255bbb381d6fc2d936b38925f5b2ae7a6c755`. Requested 2026-11-01: include
Linux where Desktop already builds the application. Those CI uploads are only
unbundled executables, so Desktop must first package all runtime resources.

The v2 parser retains existing macOS-only previews and accepts the complete
macOS ARM64 plus Linux ARM64/x64 set. It rejects partial Linux pairs and verifies
every published archive. The generated cask retains immutable runtime resources,
installs a distinct launcher and copies the desktop entry before Homebrew path
substitution. Stable v1 state and all four required check names are retained.

Local qualification:

- Before implementation, the focused Linux parser/render regressions failed
  three cases (retained in the task workspace).
- After implementation, `npm test`: 20 passed, zero failed or skipped.
- `LAPIS_TAP_BREW_CHECK=1 npm run check`: JavaScript/shell syntax, exact stable
  generation, Ruby syntax and Homebrew style pass for stable, macOS-only preview
  and the complete three-platform preview fixture.
- `actionlint .github/workflows/ci.yml`: pass.
- Strict Homebrew audit passes for the installed stable cask and an isolated
  temporary tap containing the generated three-platform preview fixture.
  Initial `brew audit --cask --strict ./Casks/lapis-notes.rb` was rejected by
  Homebrew 7 because path arguments are disabled; retry used the cask name.
  No application was installed by these local audits.

Native installation qualifies actual Homebrew install/reinstall/uninstall,
profile/vault retention, the XDG destination with spaces, desktop identity,
ordinary installed-app architecture/resources, visible native window and normal
quit. A previous preview that lacks the executing platform reports the upgrade
bootstrap gap. Public installation repeats these checks after a preview update
merges. No fixture cask/checksums or preview release is published by compatibility
work. Initial compatibility CI can exercise only the existing stable release;
new preview native behavior remains pending Desktop's first complete candidate.
Linux startup smoke does not establish full Linux native feature parity.
