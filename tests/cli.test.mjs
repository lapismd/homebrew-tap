import test from "node:test";
import assert from "node:assert/strict";
import { validateCliManifest, renderFormula } from "../scripts/cli.mjs";
import { cliFixture } from "./cli-fixture.mjs";
test("formula derives all three qualified targets from immutable upstream coordinates", () => {
  const m = validateCliManifest(cliFixture());
  const ruby = renderFormula(m);
  assert.match(ruby, /class Lapis < Formula/);
  assert.match(ruby, /version "2.9.2"/);
  assert.match(ruby, /bin.install "lapis"/);
  assert.match(ruby, /linux-x64/);
  assert.doesNotMatch(ruby, /:no_check/);
});
test("CLI manifests reject foreign sources, redirects, missing targets and altered coordinates", () => {
  for (const mutate of [
    (m) => m.archives.pop(),
    (m) => (m.archives[0].target = "__proto__"),
    (m) => m.archives.push(m.archives[0]),
    (m) => (m.archives[0].url = "https://evil.example/cli"),
    (m) => (m.archives[0].sourceCommit = "c".repeat(40)),
    (m) => (m.archives[0].file = "../lapis"),
    (m) => (m.archives[0].size = -1),
    (m) => (m.archives[0].sha256 = "0".repeat(64)),
    (m) => (m.version = "2.9.2-rc.1"),
  ]) {
    const m = cliFixture();
    mutate(m);
    assert.throws(() => validateCliManifest(m));
  }
});
