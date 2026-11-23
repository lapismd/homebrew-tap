import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readPublishedCliManifest } from "../scripts/cli-release.mjs";
import { cliFixture } from "./cli-fixture.mjs";
function fixture(mutate = () => {}) {
  const m = cliFixture(),
    bytes = Buffer.from("archive fixture");
  for (const a of m.archives) {
    a.size = bytes.length;
    a.sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  const release = {
    tag_name: "v2.9.2",
    draft: false,
    prerelease: false,
    assets: [
      { name: "cli-manifest.json" },
      ...m.archives.map((a) => ({
        name: a.file,
        size: a.size,
        browser_download_url: a.url,
      })),
    ],
  };
  const ref = { object: { type: "commit", sha: m.sourceCommit } };
  mutate({ m, release, ref });
  const fetcher = async (url, options) => {
    if (url.includes("api.github.com")) {
      assert.equal(options.redirect, "error");
      return Response.json(url.includes("/releases/") ? release : ref);
    }
    assert.equal(
      options,
      undefined,
      "credentials never reach public asset downloads",
    );
    return url.endsWith("cli-manifest.json")
      ? Response.json(m)
      : new Response(bytes);
  };
  return { m, fetcher };
}
test("published CLI verification binds tag, all assets and downloaded checksums", async () => {
  const f = fixture();
  assert.deepEqual(
    await readPublishedCliManifest("v2.9.2", f.fetcher, { token: "private" }),
    f.m,
  );
});
test("published CLI verification refuses changed tag authority, missing assets and altered hashes", async () => {
  for (const mutate of [
    ({ ref }) => (ref.object.sha = "c".repeat(40)),
    ({ release }) => (release.draft = true),
    ({ release }) => release.assets.pop(),
    ({ m }) => (m.archives[0].sha256 = "c".repeat(64)),
    ({ release }) => release.assets[1].size++,
  ]) {
    const f = fixture(mutate);
    await assert.rejects(readPublishedCliManifest("v2.9.2", f.fetcher));
  }
});
