# frozen_string_literal: true

cask "lapis-notes" do
  arch arm: "arm64", intel: "x64"

  version "2026.31.5"
  sha256 arm:          "b1510bdfe5550ba70f3e939e5c8940b1cfd6459f3dbe76ed8cfa26c98ccca571",
         arm64_linux:  "7ffc34c9feff1bfccb0795f9c16b5fea3d77c92edbe831be8e11b59967d1f166",
         x86_64_linux: "fd8bcf1cb88e2c98a5437c0d471545c18a1a6048eb3e1d6313a48ce405092c43"

  on_macos do
    url "https://github.com/lapismd/lapis-notes/releases/download/desktop-v#{version}/Lapis-Notes-#{version}-macos-#{arch}.zip"

    depends_on arch: :arm64
    depends_on macos: :sequoia

    app "Lapis-Notes-#{version}-macos-#{arch}.app", target: "Lapis Notes.app"
    generated_script ".homebrew-helpers/prepare-macos.sh", content: <<~SH
      #!/bin/sh
      set -eu
      bundle=$1
      [ -d "$bundle" ] && [ ! -L "$bundle" ] || { echo 'Lapis Notes application bundle is missing or is a symlink' >&2; exit 1; }
      identifier=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$bundle/Contents/Info.plist")
      [ "$identifier" = notes.lapis.desktop ] || { echo 'Refusing to prepare a different macOS application' >&2; exit 1; }
      /usr/bin/codesign --verify --deep --strict "$bundle"
      attributes=$(/usr/bin/xattr -r "$bundle")
      case "$attributes" in
        *com.apple.quarantine*) /usr/bin/xattr -dr com.apple.quarantine "$bundle" ;;
      esac
      attributes=$(/usr/bin/xattr -r "$bundle")
      case "$attributes" in
        *com.apple.quarantine*) echo 'Unable to remove quarantine from Lapis Notes' >&2; exit 1 ;;
      esac
      /usr/bin/codesign --verify --deep --strict "$bundle"
    SH

    postflight_steps do
      run "/bin/sh",
          args: ["{{staged_path}}/.homebrew-helpers/prepare-macos.sh", "{{appdir}}/Lapis Notes.app"]
    end
  end
  on_linux do
    url "https://github.com/lapismd/lapis-notes/releases/download/desktop-v#{version}/Lapis-Notes-#{version}-linux-#{arch}.tar.gz"

    binary "Lapis-Notes-#{version}-linux-#{arch}/lapis-notes", target: "lapis-notes"
    artifact "Lapis-Notes-#{version}-linux-#{arch}/lapis-notes.desktop",
             target: "#{ENV.fetch("HOMEBREW_XDG_DATA_HOME",
                                  ENV.fetch("XDG_DATA_HOME",
                                            "#{Dir.home}/.local/share"))}/applications/lapis-notes.desktop"

    preflight_steps do
      inreplace "Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes.desktop",
                "Exec=lapis-notes %u", 'Exec="{{HOMEBREW_PREFIX}}/bin/lapis-notes" %u'
      inreplace "Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes.desktop",
                "Icon=lapis-notes", "Icon={{staged_path}}/Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes.png"
      run "{{staged_path}}/Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes", args: ["--check-runtime"]
    end
  end

  name "Lapis Notes"
  desc "Desktop workspace for Markdown notes"
  homepage "https://github.com/lapismd/lapis-notes"

  livecheck do
    url :url
    regex(/^desktop-v(\d+\.\d+\.\d+)$/i)
    strategy :github_releases
  end

  caveats <<~EOS
    macOS builds are ad-hoc signed, without Apple Developer ID signing or notarization.
    Installation prepares only the installed Lapis Notes application for launch.
    Linux requires system WebKitGTK 4.1, GTK 3 and Ayatana AppIndicator libraries.
    On Ubuntu 24.04: sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0t64 libayatana-appindicator3-1
    AI features require the separately installed lapis-ai-controller executable.
  EOS
end
