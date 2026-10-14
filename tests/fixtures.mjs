export function fixture() {
  const version = "2026.31.5";
  const tag = `desktop-v${version}`;
  return {
    schemaVersion: 1,
    repository: "lapismd/lapis-notes",
    version,
    tag,
    sourceCommit: "a".repeat(40),
    artifacts: ["macos-arm64", "linux-arm64", "linux-x64"].map((key, index) => {
      const [platform, architecture] = key.split("-");
      const target = `${architecture === "arm64" ? "aarch64" : "x86_64"}-${platform === "macos" ? "apple-darwin" : "unknown-linux-gnu"}`;
      const file = `Lapis-Notes-${version}-${key}.${platform === "macos" ? "zip" : "tar.gz"}`;
      return {
        platform,
        architecture,
        target,
        file,
        url: `https://github.com/lapismd/lapis-notes/releases/download/${tag}/${file}`,
        size: 100 + index,
        sha256: String(index + 1).repeat(64),
      };
    }),
  };
}
