import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, symlink, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireTap } from "../scripts/tap-ownership.mjs";

test("public acceptance preserves setup-homebrew's existing tap symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "tap-ownership-"));
  try {
    const target = join(root, "checkout");
    const repository = join(root, "homebrew-tap");
    await mkdir(target);
    await symlink(target, repository);
    let installs = 0;
    const ownsTap = await acquireTap(repository, () => { installs++; });
    if (ownsTap) await rm(repository);
    assert.equal(installs, 1);
    assert.equal(ownsTap, false);
    assert.equal((await lstat(repository)).isSymbolicLink(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("public acceptance owns a tap it creates", async () => {
  const root = await mkdtemp(join(tmpdir(), "tap-ownership-"));
  try {
    const repository = join(root, "homebrew-tap");
    assert.equal(await acquireTap(repository, () => mkdir(repository)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
