import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export const previewTargets = [
  {
    target: "aarch64-apple-darwin",
    platform: "macos",
    architecture: "arm64",
    extension: "zip",
  },
  {
    target: "aarch64-unknown-linux-gnu",
    platform: "linux",
    architecture: "arm64",
    extension: "tar.gz",
  },
  {
    target: "x86_64-unknown-linux-gnu",
    platform: "linux",
    architecture: "x64",
    extension: "tar.gz",
  },
];
export const previewIdentity = "com.lapismd.lapis-desktop.preview";
export const previewVersion =
  /^(20\d{2})\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.([1-9]\d*)$/;
export function validatePreview(manifest) {
  if (
    manifest?.schemaVersion !== 2 ||
    manifest.repository !== "lapismd/lapis-desktop" ||
    manifest.runtime !== "tauri" ||
    manifest.channel !== "preview"
  )
    throw Error("Unsupported Tauri preview manifest");
  if (
    !previewVersion.test(manifest.version) ||
    manifest.tag !== `desktop-v${manifest.version}`
  )
    throw Error("Invalid preview version or tag");
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit))
    throw Error("Exact preview source commit is required");
  if (
    !Array.isArray(manifest.artifacts) ||
    ![1, 3].includes(manifest.artifacts.length)
  )
    throw Error(
      "Preview requires macOS ARM64 and either no Linux archives or both Linux architectures",
    );
  const expected =
    manifest.artifacts.length === 1
      ? previewTargets.slice(0, 1)
      : previewTargets;
  const seen = new Set();
  for (const item of manifest.artifacts) {
    const target = expected.find((entry) => entry.target === item.target);
    if (!target || seen.has(item.target))
      throw Error("Invalid or duplicate preview target");
    seen.add(item.target);
    const file = `Lapis-Notes-Preview-${manifest.version}-${target.platform}-${target.architecture}.${target.extension}`;
    if (
      item.platform !== target.platform ||
      item.architecture !== target.architecture ||
      item.file !== file ||
      item.url !==
        `https://github.com/lapismd/lapis-desktop/releases/download/${manifest.tag}/${file}`
    )
      throw Error("Invalid preview target, filename or upstream URL");
    if (
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      /^0+$/.test(item.sha256) ||
      !Number.isSafeInteger(item.size) ||
      item.size <= 0
    )
      throw Error("Invalid preview checksum or size");
  }
  return manifest;
}

export function renderPreview(manifest, { candidateArchive } = {}) {
  validatePreview(manifest);
  const artifact = manifest.artifacts.find((item) => item.platform === "macos");
  const local =
    candidateArchive &&
    manifest.artifacts.find((item) => item.file === basename(candidateArchive));
  if (candidateArchive && !local)
    throw Error("Candidate archive must use its canonical versioned filename");
  const urlFor = (item) =>
    (local === item
      ? pathToFileURL(candidateArchive).href
      : item.url
    ).replaceAll(manifest.version, "#{version}");
  const url = urlFor(artifact);
  const preparation = readFileSync(
    new URL("./prepare-macos.sh", import.meta.url),
    "utf8",
  )
    .trimEnd()
    .replaceAll("notes.lapis.desktop", previewIdentity)
    .replaceAll("Lapis Notes", "Lapis Notes Preview");
  const token = candidateArchive
    ? "lapis-notes-preview-candidate"
    : "lapis-notes@preview";
  if (manifest.artifacts.length === 3)
    return renderPlatforms(manifest, { token, preparation, urlFor });
  return [
    "# frozen_string_literal: true",
    "",
    `cask "${token}" do`,
    `  version "${manifest.version}"`,
    `  sha256 "${artifact.sha256}"`,
    "",
    `  url "${url}"`,
    '  name "Lapis Notes Preview"',
    '  desc "Preview desktop workspace for Markdown notes"',
    '  homepage "https://github.com/lapismd/lapis-desktop"',
    "",
    "  livecheck do",
    '    skip "Preview releases are verified by the upstream release workflow"',
    "  end",
    "",
    "  depends_on arch: :arm64",
    "  depends_on macos: :sequoia",
    "",
    '  app "Lapis Notes Preview.app"',
    '  generated_script ".homebrew-helpers/prepare-macos.sh", content: <<~SH',
    ...preparation.split("\n").map((line) => `    ${line}`),
    "  SH",
    "",
    "  postflight_steps do",
    '    run "/bin/sh",',
    '        args: ["{{staged_path}}/.homebrew-helpers/prepare-macos.sh", "{{appdir}}/Lapis Notes Preview.app"]',
    "  end",
    "",
    "  caveats <<~EOS",
    "    This preview uses a separate application profile and does not register stable URL handlers.",
    "    macOS builds are ad-hoc signed, without Apple Developer ID signing or notarization.",
    "    Installation prepares only the installed Lapis Notes Preview application for launch.",
    "  EOS",
    "end",
    "",
  ].join("\n");
}

function renderPlatforms(manifest, { token, preparation, urlFor }) {
  const mac = manifest.artifacts.find((item) => item.platform === "macos");
  const arm = manifest.artifacts.find(
    (item) => item.target === "aarch64-unknown-linux-gnu",
  );
  const x64 = manifest.artifacts.find(
    (item) => item.target === "x86_64-unknown-linux-gnu",
  );
  const folder = "lapis-notes-preview";
  const linuxUrl = urlFor(arm).replace(
    "linux-arm64.tar.gz",
    "linux-#{arch}.tar.gz",
  );
  const x64Url = urlFor(x64);
  const linuxUrls = x64Url.startsWith("file:")
    ? [
        "    on_arm do",
        `      url "${urlFor(arm)}"`,
        "    end",
        "    on_intel do",
        `      url "${x64Url}"`,
        "    end",
      ]
    : linuxUrl.startsWith("file:")
      ? [
          "    on_arm do",
          `      url "${urlFor(arm)}"`,
          "    end",
          "    on_intel do",
          `      url "${x64Url}"`,
          "    end",
        ]
      : [`    url "${linuxUrl}"`];
  return [
    "# frozen_string_literal: true",
    "",
    `cask "${token}" do`,
    '  arch arm: "arm64", intel: "x64"',
    "",
    `  version "${manifest.version}"`,
    `  sha256 arm:          "${mac.sha256}",`,
    `         arm64_linux:  "${arm.sha256}",`,
    `         x86_64_linux: "${x64.sha256}"`,
    "",
    "  on_macos do",
    `    url "${urlFor(mac)}"`,
    "",
    "    depends_on arch: :arm64",
    "    depends_on macos: :sequoia",
    "",
    '    app "Lapis Notes Preview.app"',
    '    generated_script ".homebrew-helpers/prepare-macos.sh", content: <<~SH',
    ...preparation.split("\n").map((line) => `      ${line}`),
    "    SH",
    "",
    "    postflight_steps do",
    '      run "/bin/sh",',
    '          args: ["{{staged_path}}/.homebrew-helpers/prepare-macos.sh", "{{appdir}}/Lapis Notes Preview.app"]',
    "    end",
    "  end",
    "  on_linux do",
    ...linuxUrls,
    "",
    `    binary "${folder}/bin/lapis-notes-preview", target: "lapis-notes-preview"`,
    '    artifact ".homebrew-helpers/preview.desktop",',
    '             target: "#{ENV.fetch("HOMEBREW_XDG_DATA_HOME",',
    '                                  ENV.fetch("XDG_DATA_HOME",',
    '                                            "#{Dir.home}/.local/share"))}" \\',
    '                     "/applications/com.lapismd.lapis-desktop.preview.desktop"',
    "",
    "    preflight_steps do",
    '      run "/bin/mkdir", args: ["-p", "{{staged_path}}/.homebrew-helpers"]',
    '      run "/bin/cp",',
    '          args: ["{{staged_path}}/lapis-notes-preview/share/applications/com.lapismd.lapis-desktop.preview.desktop",',
    '                 "{{staged_path}}/.homebrew-helpers/preview.desktop"]',
    '      inreplace ".homebrew-helpers/preview.desktop",',
    `                "Exec=lapis-notes-preview %U", 'Exec="{{HOMEBREW_PREFIX}}/bin/lapis-notes-preview" %U'`,
    '      inreplace ".homebrew-helpers/preview.desktop",',
    '                "Icon=lapis-notes-preview", "Icon={{staged_path}}/lapis-notes-preview/share/lapis-notes-preview.png"',
    "    end",
    "  end",
    "",
    '  name "Lapis Notes Preview"',
    '  desc "Preview desktop workspace for Markdown notes"',
    '  homepage "https://github.com/lapismd/lapis-desktop"',
    "",
    "  livecheck do",
    '    skip "Preview releases are verified by the upstream release workflow"',
    "  end",
    "",
    "  caveats <<~EOS",
    "    This preview uses a separate application profile and does not register stable URL handlers.",
    "    macOS builds are ad-hoc signed, without Apple Developer ID signing or notarization.",
    "    Installation prepares only the installed Lapis Notes Preview application for launch.",
    "    Linux is qualified on Ubuntu 24.04 with system WebKitGTK 4.1, GTK 3 and Ayatana AppIndicator.",
    "    On Ubuntu 24.04: sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0t64 libayatana-appindicator3-1",
    "    AI helpers are included in the application package.",
    "  EOS",
    "end",
    "",
  ].join("\n");
}
