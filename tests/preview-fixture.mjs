import { createHash } from "node:crypto";
export function previewFixture(
  version = "2026.31.6-rc.1",
  bytes = Buffer.from("preview fixture"),
) {
  const tag = `desktop-v${version}`;
  const file = `Lapis-Notes-Preview-${version}-macos-arm64.zip`;
  return {
    schemaVersion: 2,
    runtime: "tauri",
    channel: "preview",
    repository: "lapismd/lapis-desktop",
    version,
    tag,
    sourceCommit: "b".repeat(40),
    artifacts: [
      {
        target: "aarch64-apple-darwin",
        platform: "macos",
        architecture: "arm64",
        file,
        url: `https://github.com/lapismd/lapis-desktop/releases/download/${tag}/${file}`,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ],
  };
}
