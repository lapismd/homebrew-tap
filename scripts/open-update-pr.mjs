#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderCask } from "./cask.mjs";
import {
  assertProgression,
  channelPaths,
  validateChannel,
} from "./channels.mjs";
import { readPublishedManifest } from "./update-cask.mjs";

export function githubRequest(token, fetcher = fetch) {
  if (!token) throw Error("Tap update requires a GitHub App token in GH_TOKEN");
  return async (
    endpoint,
    { method = "GET", body, allowMissing = false } = {},
  ) => {
    const base =
      "https://api.github.com" +
      (endpoint === "/graphql" ? "" : "/repos/lapismd/homebrew-tap");
    const response = await fetcher(`${base}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok)
      throw Error(`Tap API ${endpoint} failed: HTTP ${response.status}`);
    const result = await response.json();
    if (result.errors) throw Error("Tap auto-merge request was rejected");
    return result;
  };
}
export async function openUpdatePR(manifest, { channel = "stable", request }) {
  validateChannel(manifest, channel);
  const paths = channelPaths(channel);
  const files = {
    [paths.cask]: renderCask(manifest),
    [paths.manifest]: `${JSON.stringify(manifest, null, 2)}\n`,
  };
  const base = (await request("/git/ref/heads/main")).object.sha;
  const content = async (file, ref, optional = false) => {
    const value = await request(
      `/contents/${file}?ref=${encodeURIComponent(ref)}`,
      { allowMissing: optional },
    );
    if (!value) return null;
    if (value.type !== "file" || value.encoding !== "base64")
      throw Error("Unexpected tap file response");
    return Buffer.from(value.content, "base64").toString("utf8");
  };
  const previousText = await content(paths.manifest, base, true);
  const previous = previousText ? JSON.parse(previousText) : undefined;
  assertProgression(previous, manifest, channel);
  if (previous && isDeepStrictEqual(previous, manifest)) {
    if ((await content(paths.cask, base)) !== files[paths.cask])
      throw Error("Published tap cask differs from its manifest");
    return { status: "already-updated" };
  }
  const branch = `homebrew/${paths.token.replace("@", "-")}-v${manifest.version}`;
  let head = await request(`/git/ref/heads/${branch}`, { allowMissing: true });
  if (!head) {
    const parent = await request(`/git/commits/${base}`);
    const tree = await request("/git/trees", {
      method: "POST",
      body: {
        base_tree: parent.tree.sha,
        tree: Object.entries(files).map(([path, content]) => ({
          path,
          mode: "100644",
          type: "blob",
          content,
        })),
      },
    });
    const commit = await request("/git/commits", {
      method: "POST",
      body: {
        message: `Update ${paths.token} to ${manifest.version}\n\nVerified upstream source: ${manifest.sourceCommit}`,
        tree: tree.sha,
        parents: [base],
      },
    });
    head = await request("/git/refs", {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
  }
  const comparison = await request(`/compare/${base}...${head.object.sha}`);
  if (
    !comparison.files?.length ||
    comparison.files.some(
      (file) =>
        !Object.hasOwn(files, file.filename) ||
        !["added", "modified"].includes(file.status),
    )
  )
    throw Error("Refusing to reuse a branch with unrelated changes");
  for (const [file, expected] of Object.entries(files))
    if ((await content(file, head.object.sha)) !== expected)
      throw Error("Existing update branch has different release contents");
  const pulls = await request(
    `/pulls?state=open&head=${encodeURIComponent(`lapismd:${branch}`)}`,
  );
  const pull =
    pulls[0] ??
    (await request("/pulls", {
      method: "POST",
      body: {
        title: `Update ${paths.token} to ${manifest.version}`,
        head: branch,
        base: "main",
        body: `Install the verified ${channel} release from https://github.com/${manifest.repository}/releases/tag/${manifest.tag}.\n\nSource: ${manifest.sourceCommit}\n\nAll four required tap checks gate this update. Preview limitations are recorded in the upstream release notes.`,
      },
    }));
  if (pull.base?.ref && pull.base.ref !== "main")
    throw Error("Update PR targets an unexpected base");
  if (comparison.behind_by > 0)
    await request(`/pulls/${pull.number}/update-branch`, {
      method: "PUT",
      body: { expected_head_sha: head.object.sha },
    });
  if (channel === "preview")
    await request("/graphql", {
      method: "POST",
      body: {
        query:
          "mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}",
        variables: { id: pull.node_id },
      },
    });
  return { status: pulls.length ? "reused" : "created", url: pull.html_url };
}
async function main() {
  const { values } = parseArgs({
    options: { channel: { type: "string", default: "stable" } },
  });
  const paths = channelPaths(values.channel);
  const manifest = validateChannel(
    JSON.parse(await readFile(paths.manifest, "utf8")),
    values.channel,
  );
  const verified = await readPublishedManifest(manifest.tag, fetch, {
    channel: values.channel,
  });
  if (
    !isDeepStrictEqual(verified, manifest) ||
    (await readFile(paths.cask, "utf8")) !== renderCask(manifest)
  )
    throw Error("Local update differs from the verified published release");
  console.log(
    await openUpdatePR(manifest, {
      channel: values.channel,
      request: githubRequest(process.env.GH_TOKEN),
    }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
