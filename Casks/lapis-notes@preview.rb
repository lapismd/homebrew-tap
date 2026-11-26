# frozen_string_literal: true

cask "lapis-notes@preview" do
  arch arm: "arm64", intel: "x64"

  version "2026.31.6-rc.5"
  sha256 arm:          "63dd4e77025e38fd3d1a284625011c4d4bf1a33fc094202e7f39cc95ef804eb2",
         arm64_linux:  "e4451d9dedb62c6c2e09c97ce99c2ee20a96822c0143ac425c50e63d99244924",
         x86_64_linux: "18d48100b98f5c50791859ba5f1ff612614ebc85b90158c087520d1ab40b78d2"

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
