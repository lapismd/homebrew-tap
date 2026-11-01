# Homebrew desktop distribution contract

The public `lapismd/homebrew-tap` repository serves the `lapismd/tap` Homebrew
tap. Lapis Notes is installed with `brew install --cask lapismd/tap/lapis-notes`.
The application and native runtime remain owned by `lapismd/lapis-notes`.

1. Production casks are generated from complete upstream schema-v1 desktop
   manifests. Each manifest binds `desktop-v<version>` to one source commit and
   three immutable GitHub Release archives: macOS ARM64 ZIP and Linux
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
   Preflight commands resolve the staged bundle absolutely, independently of
   Homebrew's process working directory.
4. Upgrade, reinstall and uninstall manage only installed application artifacts.
   Vaults, profiles and user data are preserved. The tap does not provide the
   separately installed AI controller.
5. A desktop release opens a tap update PR using a GitHub App restricted to
   this repository. All three native installation jobs, Ruby style/audit and
   Node checks must pass before merge. Releases or cask hashes are never
   replaced to conceal a failed candidate.
6. Candidate installation accepts an explicit local archive for CI only.
   Verified bytes are staged under their canonical versioned filename and
   candidate URLs retain version interpolation for strict Homebrew audit.
   Production output must use canonical upstream GitHub Release URLs. No
   installable cask is advertised before a complete verified upstream release
   supplies actual checksums.
7. Installation guidance includes Homebrew 7's explicit cask trust command.
   Trust is limited to `lapismd/tap/lapis-notes`; installation does not disable
   Homebrew's trust protections or require whole-tap trust.

## Tauri preview distribution

8. Schema v2 is explicitly `runtime: tauri`, `channel: preview`, owned by
   `lapismd/lapis-desktop`. It requires a macOS ARM64 ZIP containing
   `Lapis Notes Preview.app`, optionally accompanied by the complete Linux
   ARM64/x64 pair of tar.gz archives. Each Linux archive includes its launcher,
   Tauri resource directory, release-built AI helpers, icon and desktop entry.
   A partial Linux pair or duplicate target is invalid. The version is `<CalVer>-rc.<N>` with matching
   `desktop-v<version>` tag. The release must be a public prerelease. Source tag,
   artifact names, canonical URLs, sizes and downloaded hashes must agree.
9. Preview state is separate in `desktop-preview-manifest.json` and generates
   `lapis-notes@preview`. Stable schema-v1 state, cask output and Linux support
   remain unchanged. Production preview output is absent until an actual verified
   release supplies checksums. Local candidates use a separate temporary token.
10. Preview requires Apple Silicon macOS 15+, the separate
    `com.lapismd.lapis-desktop.preview` profile and bundle identity, and no stable
    URL registrations. Its app-scoped preparation cannot modify the stable app.
    Its AI helpers are bundled by Desktop; the legacy controller caveat does not
    apply. Installation never deletes profiles or vaults.
11. Versions progress numerically within each channel, including rc numbers.
    Changed hashes or source identity for an existing version fail closed.
    PR CI compares manifests with its current base, including manifest removal.
12. The updater independently verifies the published release before opening an
    App-authored PR containing only that channel's cask and manifest. Preview
    updates enable squash auto-merge behind all four existing required checks.
    Identical branches/PRs are reused after failure; unrelated branch changes are
    rejected. A behind branch is updated with its expected head before merging.
13. Each supported platform's native job also installs, reinstalls and uninstalls preview in an
    application directory with spaces, verifies real isolated profile/vault
    retention, launches the installed ordinary bundle through the source-owned
    smoke harness, and qualifies upgrades when a previous different preview
    exists. These tests run only on ephemeral GitHub runners. Linux qualifies
    both architectures on Ubuntu 24.04 with system WebKitGTK 4.1, GTK 3 and
    Ayatana AppIndicator, using an ordinary application and an external X11
    window/quit probe. It registers only the preview launcher and desktop entry;
    stable URL schemes remain untouched. The bootstrap upgrade gap is reported.
    Existing stable installation checks remain required on all three runners.

Stable Tauri cutover is separately approved. It must preserve `Lapis Notes.app`
and `notes.lapis.desktop`, qualify old-to-new upgrade/data compatibility, advance
CalVer above the actual installed stable release, qualify each retained Linux
platform, and retire Deno desktop CI while retaining historical archives.

14. A push to main with a verified preview also installs the public
    `lapismd/tap/lapis-notes@preview` cask from the actual official tap. Public
    verification rejects candidate/archive/previous-version overrides and requires
    the official cask bytes to match the verified manifest. It repeats ordinary
    launch, reinstall, uninstall and data-retention checks on the ephemeral
    runner, recording public-cask receipts separately from candidate receipts.
