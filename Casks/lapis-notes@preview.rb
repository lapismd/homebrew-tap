# frozen_string_literal: true

cask "lapis-notes@preview" do
  arch arm: "arm64", intel: "x64"

  version "2026.31.6-rc.1"
  sha256 arm:          "094156f0478986ce2f882340d75369dab8c9e276f348521a86b10ebfb01595ac",
         arm64_linux:  "6c5927fc751ca4fccdedaade59919904125b3cb29ed85c95231c1158155d5d1d",
         x86_64_linux: "d98209f80823b2ee070955fff7a23666f0a66188cb7c0eabf30a750bde54fd0e"

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

    binary "lapis-notes-preview/bin/lapis-notes-preview", target: "lapis-notes-preview"
    artifact ".homebrew-helpers/preview.desktop",
             target: "#{ENV.fetch("HOMEBREW_XDG_DATA_HOME",
                                  ENV.fetch("XDG_DATA_HOME",
                                            "#{Dir.home}/.local/share"))}" \
                     "/applications/com.lapismd.lapis-desktop.preview.desktop"

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
