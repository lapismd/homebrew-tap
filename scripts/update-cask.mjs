#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  channelPaths,
  validateChannel,
  assertProgression,
} from "./channels.mjs";
import { renderCask, validateManifest } from "./cask.mjs";

export async function readPublishedManifest(
  tag,
  fetcher = fetch,
  { channel = "stable" } = {},
) {
  const { repository } = channelPaths(channel);
  const pattern =
    channel === "preview"
      ? /^desktop-v20\d{2}\.\d+\.\d+-rc\.[1-9]\d*$/
      : /^desktop-v\d+\.\d+\.\d+$/;
  if (!pattern.test(tag))
    throw new Error("An exact desktop-v<version> release is required");
  const releaseResponse = await fetcher(
    `https://api.github.com/repos/${repository}/releases/tags/${tag}`,
  );
  if (!releaseResponse.ok)
    throw new Error(
      `Unable to read desktop release: HTTP ${releaseResponse.status}`,
    );
  const release = await releaseResponse.json();
  if (
    release.draft ||
    release.prerelease !== (channel === "preview") ||
    release.tag_name !== tag
  )
    throw new Error(
      "A published release matching the requested channel is required",
    );
  if (
    !Array.isArray(release.assets) ||
    release.assets.filter((asset) => asset.name === "desktop-manifest.json")
      .length !== 1
  )
    throw Error("Desktop release is missing its manifest asset");
  const response = await fetcher(
    `https://github.com/${repository}/releases/download/${tag}/desktop-manifest.json`,
  );
  if (!response.ok)
    throw new Error(
      `Unable to download desktop manifest: HTTP ${response.status}`,
    );
  const manifest = validateChannel(await response.json(), channel);
  if (manifest.tag !== tag)
    throw new Error("Desktop manifest tag disagrees with requested release");
  let ref = await fetcher(
    `https://api.github.com/repos/${repository}/git/ref/tags/${tag}`,
  );
  if (!ref.ok) throw new Error("Unable to resolve desktop release tag");
  let object = (await ref.json()).object;
  for (let depth = 0; object.type === "tag" && depth < 5; depth++) {
    ref = await fetcher(
      `https://api.github.com/repos/${repository}/git/tags/${object.sha}`,
    );
    if (!ref.ok) throw new Error("Unable to resolve annotated desktop tag");
    object = (await ref.json()).object;
  }
  if (object.type !== "commit" || object.sha !== manifest.sourceCommit)
    throw new Error("Desktop manifest source disagrees with its release tag");
  for (const artifact of manifest.artifacts) {
    if (
      release.assets.filter((asset) => asset.name === artifact.file).length !==
        1 ||
      !release.assets.some(
        (asset) =>
          asset.name === artifact.file &&
          asset.size === artifact.size &&
          (!asset.browser_download_url ||
            asset.browser_download_url === artifact.url),
      )
    )
      throw new Error(`Desktop release is missing ${artifact.file}`);
    const download = await fetcher(artifact.url);
    if (!download.ok)
      throw new Error(
        `Unable to verify ${artifact.file}: HTTP ${download.status}`,
      );
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of download.body) {
      size += chunk.length;
      hash.update(chunk);
    }
    if (size !== artifact.size || hash.digest("hex") !== artifact.sha256)
      throw new Error(`Desktop artifact verification failed: ${artifact.file}`);
  }
  return manifest;
}

async function main() {
  const { values } = parseArgs({
    options: {
      release: { type: "string" },
      channel: { type: "string", default: "stable" },
    },
  });
  const paths = channelPaths(values.channel);
  const manifest = await readPublishedManifest(values.release, fetch, {
    channel: values.channel,
  });
  let previous;
  try {
    previous = JSON.parse(await readFile(paths.manifest, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assertProgression(previous, manifest, values.channel);
  await mkdir("Casks", { recursive: true });
  await writeFile(paths.cask, renderCask(manifest));
  await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Generated Lapis Notes ${manifest.version} from ${manifest.sourceCommit}`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
