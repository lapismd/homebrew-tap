const repository = "lapismd/lapis-server";
export const cliTargets = {
  "aarch64-apple-darwin": "macos-arm64",
  "aarch64-unknown-linux-gnu": "linux-arm64",
  "x86_64-unknown-linux-gnu": "linux-x64",
};
export function validateCliManifest(m) {
  if (
    m?.schemaVersion !== 1 ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(m.version ?? "") ||
    !/^[a-f0-9]{40}$/.test(m.sourceCommit ?? "") ||
    /^0+$/.test(m.sourceCommit) ||
    !Array.isArray(m.archives) ||
    m.archives.length !== 3
  )
    throw Error("Invalid CLI manifest");
  const seen = new Set();
  for (const a of m.archives) {
    const label = cliTargets[a.target];
    if (
      !Object.hasOwn(cliTargets, a.target) ||
      !label ||
      seen.has(a.target) ||
      a.version !== m.version ||
      a.sourceCommit !== m.sourceCommit ||
      a.file !== `lapis-v${m.version}-${label}.tar.gz` ||
      a.url !==
        `https://github.com/${repository}/releases/download/v${m.version}/${a.file}` ||
      !/^[a-f0-9]{64}$/.test(a.sha256 ?? "") ||
      /^0+$/.test(a.sha256) ||
      !Number.isSafeInteger(a.size) ||
      a.size <= 0 ||
      a.size > 256 * 1024 * 1024
    )
      throw Error("Invalid CLI archive identity");
    seen.add(a.target);
  }
  return m;
}
export function renderFormula(input) {
  const m = validateCliManifest(input);
  const archive = (target) => {
    const a = m.archives.find((a) => a.target === target);
    return `      url "${a.url}"\n      sha256 "${a.sha256}"`;
  };
  return `# frozen_string_literal: true

class Lapis < Formula
  desc "Command-line and MCP access to Lapis notes"
  homepage "https://github.com/lapismd/lapis-server"
  version "${m.version}"
  license "Apache-2.0"

  on_macos do
    depends_on arch: :arm64

    on_arm do
${archive("aarch64-apple-darwin")}
    end
  end

  on_linux do
    on_arm do
${archive("aarch64-unknown-linux-gnu")}
    end
    on_intel do
${archive("x86_64-unknown-linux-gnu")}
    end
  end

  def install
    bin.install "lapis"
    prefix.install "README.md"
  end

  test do
    assert_match "lapis #{version}", shell_output("#{bin}/lapis --version")
    assert_match "MCP", shell_output("#{bin}/lapis --help")
  end
end
`;
}
