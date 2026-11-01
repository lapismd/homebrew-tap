import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { previewIdentity, previewTargets } from "./preview.mjs";

export function nativePreviewTarget() {
  const platform = process.platform === "darwin" ? "macos" : process.platform;
  const item = previewTargets.find(
    (a) => a.platform === platform && a.architecture === process.arch,
  );
  if (
    !item ||
    process.env.GITHUB_ACTIONS !== "true" ||
    (platform === "macos"
      ? !homedir().startsWith("/Users/runner")
      : homedir() !== "/home/runner")
  )
    throw Error(
      "Preview installation acceptance requires an ephemeral supported native GitHub runner",
    );
  return item;
}
export function installationPaths(root, token, version, target) {
  const dataHome = join(root, "XDG data with spaces");
  const prefix = execFileSync("brew", ["--prefix"], {
    encoding: "utf8",
  }).trim();
  const caskroom = execFileSync("brew", ["--caskroom"], {
    encoding: "utf8",
  }).trim();
  return {
    dataHome,
    profile:
      target.platform === "macos"
        ? join(homedir(), "Library/Application Support", previewIdentity)
        : join(dataHome, previewIdentity),
    app:
      target.platform === "macos"
        ? join(root, "Applications with spaces/Lapis Notes Preview.app")
        : join(caskroom, token, version, "lapis-notes-preview"),
    launcher: join(prefix, "bin/lapis-notes-preview"),
    desktop: join(dataHome, "applications", `${previewIdentity}.desktop`),
    env: {
      ...process.env,
      HOMEBREW_NO_AUTO_UPDATE: "1",
      XDG_DATA_HOME: dataHome,
      HOMEBREW_XDG_DATA_HOME: dataHome,
    },
  };
}
export async function verifyLinuxInstallation(paths, run) {
  assert.equal(
    await realpath(paths.launcher),
    join(paths.app, "bin/lapis-notes-preview"),
  );
  const desktop = await readFile(paths.desktop, "utf8");
  assert.ok(desktop.includes(`Exec="${paths.launcher}" %U`));
  assert.ok(
    desktop.includes(`Icon=${paths.app}/share/lapis-notes-preview.png`),
  );
  assert.doesNotMatch(desktop, /^MimeType=/m);
  run("desktop-file-validate", [paths.desktop]);
}
