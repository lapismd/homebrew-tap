import { appendFile, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { readPublishedManifest } from "./update-cask.mjs";
let manifest;
try {
  manifest = JSON.parse(
    await readFile("desktop-preview-manifest.json", "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const platform = process.platform === "darwin" ? "macos" : process.platform;
if (manifest) {
  const verified = await readPublishedManifest(manifest.tag, fetch, {
    channel: "preview",
  });
  if (!isDeepStrictEqual(verified, manifest))
    throw Error("Preview state differs from the published release");
}
await appendFile(
  process.env.GITHUB_OUTPUT,
  manifest?.artifacts.some(
    (a) => a.platform === platform && a.architecture === process.arch,
  )
    ? `available=true\ncommit=${manifest.sourceCommit}\n`
    : "available=false\n",
);
