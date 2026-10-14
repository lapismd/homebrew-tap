import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { basename } from "node:path";

const platforms = new Map([
  ["aarch64-apple-darwin", ["macos", "arm64"]],
  ["aarch64-unknown-linux-gnu", ["linux", "arm64"]],
  ["x86_64-unknown-linux-gnu", ["linux", "x64"]],
]);
const macPreparation = readFileSync(
  new URL("./prepare-macos.sh", import.meta.url),
  "utf8",
).trimEnd();

export function validateManifest(manifest, { candidate = false } = {}) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.repository !== "lapismd/lapis-notes"
  )
    throw new Error("Unsupported upstream desktop manifest");
  if (
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    manifest.tag !== `desktop-v${manifest.version}`
  )
    throw new Error("Invalid desktop version or tag");
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit))
    throw new Error("Exact desktop source commit is required");
  if (
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== (candidate ? 1 : platforms.size)
  )
    throw new Error(
      "A production manifest requires all three targets; a candidate requires one",
    );
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    const supported = platforms.get(artifact.target);
    if (!supported || seen.has(artifact.target))
      throw new Error("Unsupported or duplicate desktop target");
    seen.add(artifact.target);
    const [platform, architecture] = supported;
    const file = `Lapis-Notes-${manifest.version}-${platform}-${architecture}.${platform === "macos" ? "zip" : "tar.gz"}`;
    if (
      artifact.platform !== platform ||
      artifact.architecture !== architecture ||
      artifact.file !== file ||
      artifact.url !==
        `https://github.com/lapismd/lapis-notes/releases/download/${manifest.tag}/${file}`
    )
      throw new Error("Invalid desktop artifact name, target or upstream URL");
    if (
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      /^0+$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size <= 0
    )
      throw new Error("Invalid desktop artifact checksum or size");
  }
  return manifest;
}

export function renderCask(manifest, { candidateArchive } = {}) {
  validateManifest(manifest, { candidate: Boolean(candidateArchive) });
  let candidateUrl;
  if (candidateArchive) {
    const artifact = manifest.artifacts[0];
    if (basename(candidateArchive) !== artifact.file)
      throw new Error(
        "Candidate archive must use its canonical versioned filename",
      );
    const localUrl = pathToFileURL(candidateArchive).href;
    candidateUrl =
      localUrl.slice(0, localUrl.lastIndexOf("/") + 1) +
      artifact.file.replace(manifest.version, "#{version}");
  }
  const token = candidateArchive ? "lapis-notes-candidate" : "lapis-notes";
  const lines = [
    "# frozen_string_literal: true",
    "",
    `cask "${token}" do`,
    '  arch arm: "arm64", intel: "x64"',
    "",
    `  version "${manifest.version}"`,
  ];
  const keys = {
    "aarch64-apple-darwin": "arm",
    "aarch64-unknown-linux-gnu": "arm64_linux",
    "x86_64-unknown-linux-gnu": "x86_64_linux",
  };
  const hashes = manifest.artifacts.map(
    (item) => `${keys[item.target].padEnd(12)} \"${item.sha256}\"`,
  );
  if (candidateArchive)
    lines.push(`  sha256 \"${manifest.artifacts[0].sha256}\"`);
  else
    lines.push(
      `  sha256 ${hashes.map((hash, i) => hash.replace(/^([a-z0-9_]+) +/, "$1:" + " ".repeat(13 - keys[manifest.artifacts[i].target].length))).join(",\n         ")}`,
    );
  lines.push("");
  const platformHeaders = new Map();
  for (const platform of ["macos", "linux"]) {
    if (!manifest.artifacts.some((item) => item.platform === platform))
      continue;
    const url = candidateArchive
      ? candidateUrl
      : `https://github.com/lapismd/lapis-notes/releases/download/desktop-v#{version}/Lapis-Notes-#{version}-${platform}-#{arch}.${platform === "macos" ? "zip" : "tar.gz"}`;
    platformHeaders.set(platform, [
      `  on_${platform} do`,
      `    url \"${url}\"`,
      "",
    ]);
  }
  if (manifest.artifacts.some((item) => item.platform === "macos")) {
    lines.push(
      ...platformHeaders.get("macos"),
      "    depends_on arch: :arm64",
      "    depends_on macos: :sequoia",
      "",
      '    app "Lapis-Notes-#{version}-macos-#{arch}.app", target: "Lapis Notes.app"',
      '    generated_script ".homebrew-helpers/prepare-macos.sh", content: <<~SH',
      ...macPreparation.split("\n").map((line) => `      ${line}`),
      "    SH",
      "",
      "    postflight_steps do",
      '      run "/bin/sh",',
      '          args: ["{{staged_path}}/.homebrew-helpers/prepare-macos.sh", "{{appdir}}/Lapis Notes.app"]',
      "    end",
      "  end",
    );
  }
  if (manifest.artifacts.some((item) => item.platform === "linux")) {
    lines.push(
      ...platformHeaders.get("linux"),
      '    binary "Lapis-Notes-#{version}-linux-#{arch}/lapis-notes", target: "lapis-notes"',
      '    artifact "Lapis-Notes-#{version}-linux-#{arch}/lapis-notes.desktop",',
      '             target: "#{ENV.fetch("HOMEBREW_XDG_DATA_HOME",',
      '                                  ENV.fetch("XDG_DATA_HOME",',
      '                                            "#{Dir.home}/.local/share"))}/applications/lapis-notes.desktop"',
      "",
      "    preflight_steps do",
      '      inreplace "Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes.desktop",',
      '                "Exec=lapis-notes %u", \'Exec="{{HOMEBREW_PREFIX}}/bin/lapis-notes" %u\'',
      '      inreplace "Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes.desktop",',
      '                "Icon=lapis-notes", "Icon={{staged_path}}/Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes.png"',
      '      run "{{staged_path}}/Lapis-Notes-{{version}}-linux-{{arch}}/lapis-notes", args: ["--check-runtime"]',
      "    end",
      "  end",
    );
  }
  lines.push(
    "",
    '  name "Lapis Notes"',
    '  desc "Desktop workspace for Markdown notes"',
    '  homepage "https://github.com/lapismd/lapis-notes"',
    "",
  );
  if (!candidateArchive)
    lines.push(
      "  livecheck do",
      "    url :url",
      "    regex(/^desktop-v(\\d+\\.\\d+\\.\\d+)$/i)",
      "    strategy :github_releases",
      "  end",
      "",
    );
  if (candidateArchive) {
    const artifact = manifest.artifacts[0];
    lines.push(
      `  depends_on arch: :${artifact.architecture === "arm64" ? "arm64" : "x86_64"}`,
      `  depends_on :${artifact.platform === "macos" ? "macos" : "linux"}`,
      "",
    );
  }
  lines.push(
    "  caveats <<~EOS",
    "    macOS builds are ad-hoc signed, without Apple Developer ID signing or notarization.",
    "    Installation prepares only the installed Lapis Notes application for launch.",
    "    Linux requires system WebKitGTK 4.1, GTK 3 and Ayatana AppIndicator libraries.",
    "    On Ubuntu 24.04: sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0t64 libayatana-appindicator3-1",
    "    AI features require the separately installed lapis-ai-controller executable.",
    "  EOS",
    "end",
    "",
  );
  return lines.join("\n");
}
