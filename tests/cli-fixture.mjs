const targets = {
  "aarch64-apple-darwin": "macos-arm64",
  "aarch64-unknown-linux-gnu": "linux-arm64",
  "x86_64-unknown-linux-gnu": "linux-x64",
};
export const cliFixture = () => ({
  schemaVersion: 1,
  version: "2.9.2",
  sourceCommit: "a".repeat(40),
  archives: Object.entries(targets).map(([target, label]) => ({
    version: "2.9.2",
    sourceCommit: "a".repeat(40),
    target,
    file: `lapis-v2.9.2-${label}.tar.gz`,
    url: `https://github.com/lapismd/lapis-server/releases/download/v2.9.2/lapis-v2.9.2-${label}.tar.gz`,
    sha256: "b".repeat(64),
    size: 123,
    label: `Lapis CLI 2.9.2 · ${label}`,
  })),
});
