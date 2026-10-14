# Homebrew desktop distribution contract

The public `lapismd/homebrew-tap` repository serves the `lapismd/tap` Homebrew
tap. Lapis Notes is installed with `brew install --cask lapismd/tap/lapis-notes`.
The application and native runtime remain owned by `lapismd/lapis-notes`.

1. Production casks are generated from complete upstream schema-v1 desktop
   manifests. Each manifest binds `desktop-v<version>` to one source commit and
   four immutable GitHub Release archives: macOS ARM64/x64 ZIP and Linux
   ARM64/x64 tar.gz. Exact names, sizes, SHA-256 checksums, source and target
   agreement are mandatory; malformed or incomplete input fails closed.
2. macOS installs `Lapis Notes.app` into Homebrew's configured app directory.
   The build is ad-hoc signed, without Developer ID or notarization. A scoped,
   idempotent hook verifies the expected bundle identity and signature and
   removes only that bundle's `com.apple.quarantine` attribute. Installation
   failure is visible. System privacy permissions remain user controlled.
3. Linux retains the complete bundle in Homebrew's Caskroom and links its
   source-owned launcher. The cask installs a desktop entry and icon under
   the configured XDG data directory, with absolute executable and icon paths.
   It advertises existing Lapis URL schemes without replacing user defaults.
   Ubuntu 24.04 is the initial qualified distribution on both architectures;
   system WebKitGTK 4.1, GTK 3 and Ayatana AppIndicator are prerequisites.
4. Upgrade, reinstall and uninstall manage only installed application artifacts.
   Vaults, profiles and user data are preserved. The tap does not provide the
   separately installed AI controller.
5. A desktop release opens a tap update PR using a GitHub App restricted to
   this repository. All four native installation jobs, Ruby style/audit and
   Node checks must pass before merge. Releases or cask hashes are never
   replaced to conceal a failed candidate.
6. Candidate installation accepts an explicit local archive for CI only.
   Production output must use canonical upstream GitHub Release URLs. No
   installable cask is advertised before a complete verified upstream release
   supplies actual checksums.
