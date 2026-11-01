import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCask, validateManifest } from "../scripts/cask.mjs";
import { assertProgression, compareVersions } from "../scripts/channels.mjs";
import { readPublishedManifest } from "../scripts/update-cask.mjs";
import { previewFixture } from "./preview-fixture.mjs";
import { fixture } from "./fixtures.mjs";

test("preview cask is macOS-only and preserves the distinct bundle and profile", () => {
  const m = previewFixture(),
    cask = renderCask(m);
  assert.match(cask, /cask "lapis-notes@preview"/);
  assert.match(cask, /app "Lapis Notes Preview.app"/);
  assert.match(cask, /com.lapismd.lapis-desktop.preview/);
  assert.match(cask, /depends_on macos: :sequoia/);
  assert.ok(cask.includes(m.artifacts[0].sha256));
  assert.doesNotMatch(
    cask,
    /on_linux|lapis-ai-controller|no_check|zap|notes\.lapis\.desktop/,
  );
  assert.match(
    renderCask(m, {
      candidateArchive: `/tmp/with spaces/${m.artifacts[0].file}`,
    }),
    /file:\/\/\/tmp\/with%20spaces/,
  );
});
test("preview manifest rejects wrong channel, target, repository, identity and hashes", () => {
  for (const mutate of [
    (m) => {
      m.channel = "stable";
    },
    (m) => {
      m.runtime = "deno";
    },
    (m) => {
      m.repository = "lapismd/lapis-notes";
    },
    (m) => {
      m.version = "2026.31.6";
    },
    (m) => {
      m.tag = "desktop-v2026.31.6-rc.2";
    },
    (m) => {
      m.sourceCommit = "main";
    },
    (m) => {
      m.artifacts.push(m.artifacts[0]);
    },
    (m) => {
      m.artifacts[0].target = "x86_64-apple-darwin";
    },
    (m) => {
      m.artifacts[0].file = "../preview.zip";
    },
    (m) => {
      m.artifacts[0].url += "?token=secret";
    },
    (m) => {
      m.artifacts[0].size = 0;
    },
    (m) => {
      m.artifacts[0].sha256 = "0".repeat(64);
    },
  ]) {
    const m = previewFixture();
    mutate(m);
    assert.throws(() => validateManifest(m));
  }
});
test("channel progression orders rc numbers numerically and rejects changed identities", () => {
  assert.equal(compareVersions("2026.31.6-rc.10", "2026.31.6-rc.2"), 1);
  assert.equal(compareVersions("2026.31.6", "2026.31.6-rc.10"), 1);
  assert.doesNotThrow(() =>
    assertProgression(
      previewFixture(),
      previewFixture("2026.31.6-rc.2"),
      "preview",
    ),
  );
  assert.throws(
    () =>
      assertProgression(
        previewFixture("2026.31.6-rc.2"),
        previewFixture(),
        "preview",
      ),
    /older/,
  );
  assert.throws(
    () =>
      assertProgression(
        previewFixture(),
        previewFixture(undefined, Buffer.from("changed")),
        "preview",
      ),
    /identity changed/,
  );
  assert.throws(
    () => assertProgression(fixture(), previewFixture(), "preview"),
    /different channel/,
  );
  assert.throws(
    () => assertProgression(undefined, previewFixture(), "stable"),
    /different channel/,
  );
});
function upstream({
  releaseChange = () => {},
  manifestChange = () => {},
  tag = "b".repeat(40),
  corrupt = false,
  annotated = false,
} = {}) {
  const m = previewFixture();
  const release = {
    draft: false,
    prerelease: true,
    tag_name: m.tag,
    assets: [
      { name: "desktop-manifest.json" },
      {
        name: m.artifacts[0].file,
        size: m.artifacts[0].size,
        browser_download_url: m.artifacts[0].url,
      },
    ],
  };
  releaseChange(release);
  manifestChange(m);
  return async (url) => {
    if (url.includes("/releases/tags/")) return Response.json(release);
    if (url.endsWith("desktop-manifest.json")) return Response.json(m);
    if (url.includes("/git/ref/tags/"))
      return Response.json({
        object: annotated
          ? { type: "tag", sha: "c".repeat(40) }
          : { type: "commit", sha: tag },
      });
    if (url.includes("/git/tags/"))
      return Response.json({ object: { type: "commit", sha: tag } });
    return new Response(corrupt ? "corrupted bytes" : "preview fixture");
  };
}
test("published preview verifies lightweight and annotated source tags and downloaded bytes", async () => {
  for (const annotated of [false, true])
    assert.deepEqual(
      await readPublishedManifest(
        previewFixture().tag,
        upstream({ annotated }),
        { channel: "preview" },
      ),
      previewFixture(),
    );
});
test("published preview fails closed on release, asset, source and archive disagreement", async () => {
  for (const options of [
    {
      releaseChange: (r) => {
        r.draft = true;
      },
    },
    {
      releaseChange: (r) => {
        r.prerelease = false;
      },
    },
    {
      releaseChange: (r) => {
        r.assets.pop();
      },
    },
    {
      releaseChange: (r) => {
        r.assets.shift();
      },
    },
    {
      releaseChange: (r) => {
        r.assets.push(r.assets[1]);
      },
    },
    {
      releaseChange: (r) => {
        r.assets[1].size++;
      },
    },
    { tag: "c".repeat(40) },
    { corrupt: true },
    {
      manifestChange: (m) => {
        m.repository = "untrusted/desktop";
      },
    },
  ])
    await assert.rejects(
      readPublishedManifest(previewFixture().tag, upstream(options), {
        channel: "preview",
      }),
    );
  await assert.rejects(
    readPublishedManifest(previewFixture().tag, upstream()),
    /exact/,
  );
});
