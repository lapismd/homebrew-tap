#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { renderCask, validateManifest } from "./cask.mjs";

export async function readPublishedManifest(tag, fetcher = fetch) {
  if (!/^desktop-v\d+\.\d+\.\d+$/.test(tag))
    throw new Error("An exact desktop-v<version> release is required");
  const releaseResponse = await fetcher(
    `https://api.github.com/repos/lapismd/lapis-notes/releases/tags/${tag}`,
  );
  if (!releaseResponse.ok)
    throw new Error(
      `Unable to read desktop release: HTTP ${releaseResponse.status}`,
    );
  const release = await releaseResponse.json();
  if (release.draft || release.prerelease || release.tag_name !== tag)
    throw new Error("A published stable desktop release is required");
  const response = await fetcher(
    `https://github.com/lapismd/lapis-notes/releases/download/${tag}/desktop-manifest.json`,
  );
  if (!response.ok)
    throw new Error(
      `Unable to download desktop manifest: HTTP ${response.status}`,
    );
  const manifest = validateManifest(await response.json());
  if (manifest.tag !== tag)
    throw new Error("Desktop manifest tag disagrees with requested release");
  let ref = await fetcher(
    `https://api.github.com/repos/lapismd/lapis-notes/git/ref/tags/${tag}`,
  );
  if (!ref.ok) throw new Error("Unable to resolve desktop release tag");
  let object = (await ref.json()).object;
  for (let depth = 0; object.type === "tag" && depth < 5; depth++) {
    ref = await fetcher(
      `https://api.github.com/repos/lapismd/lapis-notes/git/tags/${object.sha}`,
    );
    if (!ref.ok) throw new Error("Unable to resolve annotated desktop tag");
    object = (await ref.json()).object;
  }
  if (object.type !== "commit" || object.sha !== manifest.sourceCommit)
    throw new Error("Desktop manifest source disagrees with its release tag");
  for (const artifact of manifest.artifacts) {
    if (
      !release.assets.some(
        (asset) => asset.name === artifact.file && asset.size === artifact.size,
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
  const { values } = parseArgs({ options: { release: { type: "string" } } });
  const manifest = await readPublishedManifest(values.release);
  let previous;
  try {
    previous = JSON.parse(await readFile("desktop-manifest.json", "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (previous) {
    validateManifest(previous);
    const current = previous.version.split(".").map(Number);
    const next = manifest.version.split(".").map(Number);
    const difference =
      next
        .map((part, index) => part - current[index])
        .find((part) => part !== 0) || 0;
    if (difference < 0)
      throw new Error("Refusing to move the Homebrew cask to an older version");
    if (!difference && JSON.stringify(previous) !== JSON.stringify(manifest))
      throw new Error(
        "Published version identity changed; refusing to replace cask hashes",
      );
  }
  await mkdir("Casks", { recursive: true });
  await writeFile("Casks/lapis-notes.rb", renderCask(manifest));
  await writeFile(
    "desktop-manifest.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
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
