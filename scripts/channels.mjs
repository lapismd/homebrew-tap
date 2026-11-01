import { isDeepStrictEqual } from "node:util";
import { validateManifest } from "./cask.mjs";

export function channelPaths(channel = "stable") {
  if (channel === "stable")
    return {
      manifest: "desktop-manifest.json",
      cask: "Casks/lapis-notes.rb",
      repository: "lapismd/lapis-notes",
      token: "lapis-notes",
    };
  if (channel === "preview")
    return {
      manifest: "desktop-preview-manifest.json",
      cask: "Casks/lapis-notes@preview.rb",
      repository: "lapismd/lapis-desktop",
      token: "lapis-notes@preview",
    };
  throw Error("Choose stable or preview channel");
}
export function validateChannel(manifest, channel) {
  validateManifest(manifest);
  if (
    manifest.repository !== channelPaths(channel).repository ||
    (channel === "preview"
      ? manifest.schemaVersion !== 2
      : manifest.schemaVersion !== 1)
  )
    throw Error("Desktop manifest belongs to a different channel");
  return manifest;
}
export function compareVersions(a, b) {
  const parse = (value) => {
    const match =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.([1-9]\d*))?$/.exec(
        value,
      );
    if (!match) throw Error("Invalid release version");
    return match
      .slice(1)
      .map((item, i) =>
        item === undefined && i === 3 ? Infinity : Number(item),
      );
  };
  const left = parse(a),
    right = parse(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}
export function assertProgression(previous, next, channel) {
  validateChannel(next, channel);
  if (!previous) return;
  validateChannel(previous, channel);
  const comparison = compareVersions(next.version, previous.version);
  if (comparison < 0)
    throw Error("Refusing to move the Homebrew cask to an older version");
  if (!comparison && !isDeepStrictEqual(previous, next))
    throw Error(
      "Published version identity changed; refusing to replace cask hashes",
    );
}
