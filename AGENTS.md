# LapisMD Homebrew tap

This repository owns Homebrew definitions and installation integration for
released LapisMD applications. Application packaging and runtime defects belong
in the source repository; Lapis Notes is owned by `lapismd/lapis-notes`.

- Use Jujutsu for local version control. Preserve unrelated work.
- Read `spec.md` before changing distribution contracts.
- Generate casks from verified upstream desktop manifests. Never invent a
  checksum, use `sha256 :no_check`, or publish checkout-specific download URLs.
- Keep unsigned macOS preparation scoped to the installed Lapis Notes bundle.
- Preserve vaults and application data during install, upgrade and uninstall.
- Run `npm test` and `npm run check`; cask updates additionally require the four
  native Homebrew installation jobs. Record qualification honestly.
- Commit each verified slice with a descriptive message and validation evidence.
