import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCask, validateManifest } from "../scripts/cask.mjs";

import { fixture } from "./fixtures.mjs";

test("generates one cross-platform cask with exact upstream checksums", () => {
  const manifest = fixture();
  const cask = renderCask(manifest);
  assert.match(cask, /cask "lapis-notes" do/);
  for (const artifact of manifest.artifacts)
    assert.ok(cask.includes(artifact.sha256));
  assert.match(cask, /on_macos do/);
  assert.match(cask, /on_macos do[\s\S]*depends_on arch: :arm64/);
  assert.match(cask, /on_linux do/);
  assert.match(cask, /target: "Lapis Notes.app"/);
  assert.match(cask, /postflight_steps do/);
  assert.match(cask, /com.apple.quarantine/);
  assert.match(cask, /Exec=.*HOMEBREW_PREFIX.*lapis-notes/);
  assert.match(
    cask,
    /run "\{\{staged_path\}\}\/Lapis-Notes-\{\{version\}\}-linux-\{\{arch\}\}\/lapis-notes"/,
  );
  assert.doesNotMatch(
    cask,
    /no_check|no-quarantine|master-disable|chmod.*777|zap/,
  );
});

test("rejects incomplete or duplicate architecture manifests", () => {
  const manifest = fixture();
  manifest.artifacts.pop();
  assert.throws(() => validateManifest(manifest), /three/);
  manifest.artifacts.push(manifest.artifacts[0]);
  assert.throws(() => validateManifest(manifest), /duplicate/);
});

test("rejects untrusted downloads, traversal, mismatched tags and fake checksums", () => {
  for (const mutate of [
    (m) => {
      m.artifacts[0].url = "https://example.com/app.zip";
    },
    (m) => {
      m.artifacts[0].file = "../app.zip";
    },
    (m) => {
      m.tag = "api@0.1.3";
    },
    (m) => {
      m.artifacts[0].sha256 = "0".repeat(64);
    },
    (m) => {
      m.sourceCommit = "main";
    },
    (m) => {
      m.artifacts[0].size = -1;
    },
  ]) {
    const manifest = fixture();
    mutate(manifest);
    assert.throws(() => validateManifest(manifest));
  }
});

test("local archive installation is explicit and limited to one candidate target", () => {
  const manifest = fixture();
  manifest.artifacts = [manifest.artifacts[0]];
  assert.throws(() => renderCask(manifest), /three/);
  const cask = renderCask(manifest, {
    candidateArchive: `/tmp/with spaces/${manifest.artifacts[0].file}`,
  });
  assert.match(cask, /cask "lapis-notes-candidate"/);
  assert.match(
    cask,
    /file:\/\/\/tmp\/with%20spaces\/Lapis-Notes-#\{version\}-macos-arm64.zip/,
  );
  assert.ok(cask.includes(manifest.artifacts[0].sha256));
  assert.doesNotMatch(cask, /on_linux/);
});

test("rejects deferred Intel macOS in complete and candidate manifests", () => {
  const manifest = fixture();
  manifest.artifacts[0].target = "x86_64-apple-darwin";
  assert.throws(() => validateManifest(manifest), /Unsupported/);
  manifest.artifacts = [manifest.artifacts[0]];
  assert.throws(
    () => validateManifest(manifest, { candidate: true }),
    /Unsupported/,
  );
});
