import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCask, validateManifest } from "../scripts/cask.mjs";
import { linuxPreviewFixture, previewFixture } from "./preview-fixture.mjs";
import { readPublishedManifest } from "../scripts/update-cask.mjs";

test("preview accepts a complete Linux pair while retaining older macOS manifests", () => {
  assert.equal(validateManifest(linuxPreviewFixture()).artifacts.length, 3);
  assert.equal(validateManifest(previewFixture()).artifacts.length, 1);
});

test("preview rejects incomplete, duplicate and incorrectly named Linux targets", () => {
  for (const change of [
    (m) => m.artifacts.pop(),
    (m) => m.artifacts.shift(),
    (m) => m.artifacts.push(m.artifacts[1]),
    (m) => {
      m.artifacts[1].architecture = "x64";
    },
    (m) => {
      m.artifacts[1].target = "aarch64-unknown-linux-musl";
    },
    (m) => {
      m.artifacts[1].file = "unqualified.AppImage";
    },
    (m) => {
      m.artifacts[1].url += "?token=secret";
    },
    (m) => {
      m.artifacts[2].sha256 = "0".repeat(64);
    },
  ]) {
    const manifest = linuxPreviewFixture();
    change(manifest);
    assert.throws(() => validateManifest(manifest));
  }
});

test("preview Linux cask keeps the complete archive and installs a distinct launcher", () => {
  const manifest = linuxPreviewFixture();
  const cask = renderCask(manifest);
  assert.match(cask, /on_macos do/);
  assert.match(cask, /on_linux do/);
  assert.match(cask, /arm64_linux:/);
  assert.match(cask, /x86_64_linux:/);
  assert.match(cask, /target: "lapis-notes-preview"/);
  assert.match(cask, /com\.lapismd\.lapis-desktop\.preview\.desktop/);
  assert.match(cask, /Ubuntu 24\.04/);
  assert.doesNotMatch(cask, /--check-runtime|lapis-ai-controller|no_check|zap/);
  for (const artifact of manifest.artifacts)
    assert.ok(cask.includes(artifact.sha256));
});

test("Linux candidate archive override is confined to its canonical architecture", () => {
  const manifest = linuxPreviewFixture();
  const artifact = manifest.artifacts[2];
  const cask = renderCask(manifest, {
    candidateArchive: `/tmp/packages with spaces/${artifact.file}`,
  });
  assert.match(cask, /file:\/\/\/tmp\/packages%20with%20spaces/);
  assert.match(cask, /macos-arm64\.zip/);
  assert.throws(() =>
    renderCask(manifest, { candidateArchive: "/tmp/other.tar.gz" }),
  );
});

function published({ missing, corrupt } = {}) {
  const manifest = linuxPreviewFixture();
  const release = {
    tag_name: manifest.tag,
    prerelease: true,
    draft: false,
    assets: [
      { name: "desktop-manifest.json" },
      ...manifest.artifacts.map((artifact) => ({
        name: artifact.file,
        size: artifact.size,
        browser_download_url: artifact.url,
      })),
    ].filter((asset) => asset.name !== missing),
  };
  return async (url) => {
    if (url.includes("/releases/tags/")) return Response.json(release);
    if (url.endsWith("desktop-manifest.json")) return Response.json(manifest);
    if (url.includes("/git/ref/tags/"))
      return Response.json({
        object: { type: "commit", sha: manifest.sourceCommit },
      });
    return new Response(
      url.endsWith(corrupt ?? "never")
        ? "corrupt Linux package"
        : "preview fixture",
    );
  };
}

test("published previews verify both Linux downloads and fail on a missing or corrupted Linux package", async () => {
  const manifest = linuxPreviewFixture();
  assert.deepEqual(
    await readPublishedManifest(manifest.tag, published(), {
      channel: "preview",
    }),
    manifest,
  );
  for (const artifact of manifest.artifacts.filter(
    (item) => item.platform === "linux",
  )) {
    for (const failure of [
      { missing: artifact.file },
      { corrupt: artifact.file },
    ])
      await assert.rejects(
        readPublishedManifest(manifest.tag, published(failure), {
          channel: "preview",
        }),
      );
  }
});
