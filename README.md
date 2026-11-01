# LapisMD Homebrew tap

This public tap installs Lapis Notes on Apple Silicon macOS 15+, and
ARM64 and x86-64 Linux. Intel macOS is deferred because the pinned Turso
database package has no published Darwin x64 native addon.

[Lapis Notes 2026.31.5](https://github.com/lapismd/lapis-notes/releases/tag/desktop-v2026.31.5)
is available from this tap. Install it with:

```sh
brew tap lapismd/tap
brew trust --cask lapismd/tap/lapis-notes
brew install --cask lapismd/tap/lapis-notes
brew upgrade --cask lapismd/tap/lapis-notes
brew uninstall --cask lapismd/tap/lapis-notes
```

Use current Homebrew 7. The trust command grants Homebrew access to this cask.
On macOS the app appears as **Lapis Notes** in Homebrew's application directory.
A custom destination can be selected with `--appdir="$HOME/Applications"`.

macOS builds are ad-hoc signed and are not Apple Developer ID signed or
notarized. Installation verifies the bundle and automatically removes only
its quarantine attribute. Normal macOS privacy prompts still apply.

Linux v1 is qualified on Ubuntu 24.04 with a graphical desktop and D-Bus session.
Install its system libraries first:

```sh
sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0t64 libayatana-appindicator3-1
brew install --cask lapismd/tap/lapis-notes
lapis-notes
```

The tar distribution needs no FUSE. Its desktop entry and icon are installed
for the current user. `HOMEBREW_XDG_DATA_HOME` takes precedence over
`XDG_DATA_HOME`, with `~/.local/share` as the default desktop-entry destination.
`lapis-notes --check-runtime` checks libraries without opening a window.

Upgrades and uninstall preserve vaults and application data. AI features need
the separately installed `lapis-ai-controller`. macOS OS-level custom-scheme
URL delivery remains a Deno limitation ([denoland/deno#35465](https://github.com/denoland/deno/issues/35465)); source-owned executable argument handoff is tested.

## Maintenance

A `desktop-v<version>` source tag builds and tests all three native candidates.
The source release workflow publishes immutable archives, `SHA256SUMS` and
`desktop-manifest.json`, then opens a tap update PR. A GitHub App restricted to
this repository needs Contents and Pull requests write permissions. Configure
`HOMEBREW_TAP_APP_ID` as a repository variable and
`HOMEBREW_TAP_APP_PRIVATE_KEY` as a secret in `lapismd/lapis-notes`.

All four checks gate update PRs: **Tap checks**, plus **Native installation**
for macOS ARM64 and Linux ARM64/x64. Neither upstream publication nor tap
updates install or bundle the AI controller.

To recover a failed tap-update job after an already successful release, use
an appropriately scoped GitHub App token and run:

```sh
node scripts/update-cask.mjs --release desktop-v2026.31.5
npm test
LAPIS_TAP_BREW_CHECK=1 npm run check
node scripts/open-update-pr.mjs
```

The updater verifies release-tag provenance and every downloaded archive before
writing the cask. It refuses older releases or changed hashes for the same version.
The first release has no previous desktop version; reinstall qualification runs
from that first release, with upgrades between actual versions qualified as
subsequent releases become available.

Run `npm test` and `npm run check` for development. Native CI invokes
`scripts/test-install.mjs --audit` to qualify real Homebrew installation,
reinstall, cold core startup, argument handoff and clean uninstall. macOS
launches the installed app through LaunchServices with no development runtime
on its PATH. Evidence is retained as workflow artifacts.

## Tauri preview channel

The tap also supports the separate Tauri Desktop release pipeline. Preview is
Apple Silicon macOS 15+ only; stable Notes and its Linux packages remain
available above. A preview cask is generated only after the first verified public
Desktop prerelease. Until then these commands are not yet installable:

```sh
brew trust --cask lapismd/tap/lapis-notes@preview
brew install --cask lapismd/tap/lapis-notes@preview
brew upgrade --cask lapismd/tap/lapis-notes@preview
```

Preview installs **Lapis Notes Preview.app**, uses its separate profile, and does
not register the stable app's URL handlers. It is ad-hoc signed and unnotarized;
installation prepares only that bundle. Desktop bundles its native AI helpers.
Uninstall preserves profiles and vaults.

Desktop prepares a tested candidate before its protected publication approval.
Publication creates a GitHub prerelease, then the restricted Homebrew GitHub App
opens a two-file update PR and enables auto-merge. The existing Tap checks and
three Native installation checks remain required. The macOS job also qualifies
preview install/reinstall/uninstall and real data retention. First-release
upgrade coverage is explicitly not run until a prior preview exists.

If publication succeeded but tap updating failed, recover without rebuilding:

```sh
node scripts/update-cask.mjs --channel preview --release desktop-v2026.31.6-rc.1
npm test
LAPIS_TAP_BREW_CHECK=1 npm run check
node scripts/open-update-pr.mjs --channel preview
```

Set `GH_TOKEN` to the restricted Homebrew App installation token for PR creation.
The scripts verify release provenance and bytes, reject changed release identity
or a downgrade, and safely reuse a matching branch/PR. A strict-check failure
leaves the PR unmerged and its receipts available in Actions.

Stable Tauri cutover is a later approved operation: preserve the canonical app
identity, qualify the Deno-to-Tauri upgrade and data compatibility, make stable
macOS-only, and retire the old desktop CI without deleting old downloads.

After a preview update merges, main CI also installs the actual public
`lapismd/tap/lapis-notes@preview` cask. Its `preview-public` receipts verify the
user-facing install/reinstall/uninstall and ordinary-app launch independently
from the PR's temporary candidate cask.
