import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

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
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1)
    throw Error("A preview requires exactly one macOS ARM64 artifact");
  const item = manifest.artifacts[0];
  const file = `Lapis-Notes-Preview-${manifest.version}-macos-arm64.zip`;
  if (
    item.target !== "aarch64-apple-darwin" ||
    item.platform !== "macos" ||
    item.architecture !== "arm64" ||
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
  return manifest;
}

export function renderPreview(manifest, { candidateArchive } = {}) {
  validatePreview(manifest);
  const artifact = manifest.artifacts[0];
  if (candidateArchive && basename(candidateArchive) !== artifact.file)
    throw Error("Candidate archive must use its canonical versioned filename");
  const url = candidateArchive
    ? pathToFileURL(candidateArchive).href.replace(
        manifest.version,
        "#{version}",
      )
    : "https://github.com/lapismd/lapis-desktop/releases/download/desktop-v#{version}/Lapis-Notes-Preview-#{version}-macos-arm64.zip";
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
