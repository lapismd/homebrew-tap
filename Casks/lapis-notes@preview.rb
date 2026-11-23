# frozen_string_literal: true

cask "lapis-notes@preview" do
  arch arm: "arm64", intel: "x64"

  version "2026.31.6-rc.2"
  sha256 arm:          "84a676abc0ef3793ec01ad92d255f0229cc944057a9e2577446ea0991f2fb352",
         arm64_linux:  "b26509ead8f0e4ee5121ad31b0f832ad51c6177bdd5f348404bab26a99fe2ec7",
         x86_64_linux: "df72557bb778ed00add8799bda22db07b3dbbf72a6ddad037b907d2beed1be4c"

  on_macos do
    url "https://github.com/lapismd/lapis-desktop/releases/download/desktop-v#{version}/Lapis-Notes-Preview-#{version}-macos-arm64.zip"

    depends_on arch: :arm64
    depends_on macos: :sequoia

    app "Lapis Notes Preview.app"
    generated_script ".homebrew-helpers/prepare-macos.sh", content: <<~SH
      #!/bin/sh
      set -eu
      bundle=$1
      [ -d "$bundle" ] && [ ! -L "$bundle" ] || { echo 'Lapis Notes Preview application bundle is missing or is a symlink' >&2; exit 1; }
      identifier=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$bundle/Contents/Info.plist")
      [ "$identifier" = com.lapismd.lapis-desktop.preview ] || { echo 'Refusing to prepare a different macOS application' >&2; exit 1; }
      /usr/bin/codesign --verify --deep --strict "$bundle"
      attributes=$(/usr/bin/xattr -r "$bundle")
      case "$attributes" in
        *com.apple.quarantine*) /usr/bin/xattr -dr com.apple.quarantine "$bundle" ;;
      esac
      attributes=$(/usr/bin/xattr -r "$bundle")
      case "$attributes" in
        *com.apple.quarantine*) echo 'Unable to remove quarantine from Lapis Notes Preview' >&2; exit 1 ;;
      esac
      /usr/bin/codesign --verify --deep --strict "$bundle"
    SH

    postflight_steps do
      run "/bin/sh",
          args: ["{{staged_path}}/.homebrew-helpers/prepare-macos.sh", "{{appdir}}/Lapis Notes Preview.app"]
    end
  end
  on_linux do
    url "https://github.com/lapismd/lapis-desktop/releases/download/desktop-v#{version}/Lapis-Notes-Preview-#{version}-linux-#{arch}.tar.gz"

    xdg_data_home = ENV.fetch("HOMEBREW_XDG_DATA_HOME") do
      ENV.fetch("XDG_DATA_HOME", File.join(Dir.home, ".local/share"))
    end

    binary "lapis-notes-preview/bin/lapis-notes-preview", target: "lapis-notes-preview"
    artifact ".homebrew-helpers/preview.desktop",
             target: "#{xdg_data_home}/applications/com.lapismd.lapis-desktop.preview.desktop"

    preflight_steps do
      run "/bin/mkdir", args: ["-p", "{{staged_path}}/.homebrew-helpers"]
      run "/bin/cp",
          args: ["{{staged_path}}/lapis-notes-preview/share/applications/com.lapismd.lapis-desktop.preview.desktop",
                 "{{staged_path}}/.homebrew-helpers/preview.desktop"]
      inreplace ".homebrew-helpers/preview.desktop",
                "Exec=lapis-notes-preview %U", 'Exec="{{HOMEBREW_PREFIX}}/bin/lapis-notes-preview" %U'
      inreplace ".homebrew-helpers/preview.desktop",
                "Icon=lapis-notes-preview", "Icon={{staged_path}}/lapis-notes-preview/share/lapis-notes-preview.png"
    end
  end

  name "Lapis Notes Preview"
  desc "Preview desktop workspace for Markdown notes"
  homepage "https://github.com/lapismd/lapis-desktop"

  livecheck do
    skip "Preview releases are verified by the upstream release workflow"
  end

  caveats <<~EOS
    This preview uses a separate application profile and does not register stable URL handlers.
    macOS builds are ad-hoc signed, without Apple Developer ID signing or notarization.
    Installation prepares only the installed Lapis Notes Preview application for launch.
    Linux is qualified on Ubuntu 24.04 with system WebKitGTK 4.1, GTK 3 and Ayatana AppIndicator.
    On Ubuntu 24.04: sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0t64 libayatana-appindicator3-1
    AI helpers are included in the application package.
  EOS
end
