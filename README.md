# LapisMD Homebrew tap

This public tap installs Lapis Notes on Apple Silicon and Intel macOS, and
ARM64 and x86-64 Linux.

The repository is bootstrapped. The first complete, verified desktop release
will populate `Casks/lapis-notes.rb` through a reviewed update PR. The installation
command becomes available when that PR passes native checks and is merged:

```sh
brew install --cask lapismd/tap/lapis-notes
brew upgrade --cask lapismd/tap/lapis-notes
brew uninstall --cask lapismd/tap/lapis-notes
```

Use current Homebrew 7. A fully qualified installation trusts only this cask.
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

A `desktop-v<version>` source tag builds and tests all four native candidates.
The source release workflow publishes immutable archives, `SHA256SUMS` and
`desktop-manifest.json`, then opens a tap update PR. A GitHub App restricted to
this repository needs Contents and Pull requests write permissions. Configure
`HOMEBREW_TAP_APP_ID` as a repository variable and
`HOMEBREW_TAP_APP_PRIVATE_KEY` as a secret in `lapismd/lapis-notes`.

All five checks gate update PRs: **Tap checks**, plus **Native installation**
for macOS ARM64/x64 and Linux ARM64/x64. Neither upstream publication nor tap
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
