#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateManifest } from "./cask.mjs";

const manifest = validateManifest(
  JSON.parse(await readFile("desktop-manifest.json", "utf8")),
);
const token = process.env.GH_TOKEN;
if (!token)
  throw new Error("Tap update PR requires a GitHub App token in GH_TOKEN");
const repository = "lapismd/homebrew-tap";
const api = `https://api.github.com/repos/${repository}`;
async function request(endpoint, { method = "GET", body } = {}) {
  const response = await fetch(`${api}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error(`Tap API ${endpoint} failed: HTTP ${response.status}`);
  return response.json();
}
const branch = `homebrew/lapis-notes-v${manifest.version}`;
const existingPRs = await request(
  `/pulls?state=open&head=${encodeURIComponent(`lapismd:${branch}`)}`,
);
if (existingPRs.length) {
  console.log(`Tap update PR already exists: ${existingPRs[0].html_url}`);
} else {
  const base = await request("/git/ref/heads/main");
  const commit = await request(`/git/commits/${base.object.sha}`);
  const tree = await request("/git/trees", {
    method: "POST",
    body: {
      base_tree: commit.tree.sha,
      tree: await Promise.all(
        ["Casks/lapis-notes.rb", "desktop-manifest.json"].map(async (file) => ({
          path: file,
          mode: "100644",
          type: "blob",
          content: await readFile(file, "utf8"),
        })),
      ),
    },
  });
  const created = await request("/git/commits", {
    method: "POST",
    body: {
      message: `Update Lapis Notes to ${manifest.version}\n\nConsume verified immutable desktop archives from ${manifest.sourceCommit}. Native Homebrew installation checks gate this update.`,
      tree: tree.sha,
      parents: [base.object.sha],
    },
  });
  await request("/git/refs", {
    method: "POST",
    body: { ref: `refs/heads/${branch}`, sha: created.sha },
  });
  const pull = await request("/pulls", {
    method: "POST",
    body: {
      title: `Update Lapis Notes to ${manifest.version}`,
      head: branch,
      base: "main",
      body: `Install Lapis Notes ${manifest.version} from the four verified upstream desktop archives. macOS bundles remain ad-hoc signed and are prepared through the app-scoped quarantine hook.\n\nSource: https://github.com/lapismd/lapis-notes/tree/${manifest.sourceCommit}\nRelease: https://github.com/lapismd/lapis-notes/releases/tag/${manifest.tag}\n\nAll four native installation checks must pass before merge.`,
    },
  });
  console.log(`Created ${pull.html_url}`);
}
