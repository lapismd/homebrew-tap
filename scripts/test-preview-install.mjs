#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { renderCask } from "./cask.mjs";
import { assertProgression, validateChannel } from "./channels.mjs";

if (
  process.platform !== "darwin" ||
  process.arch !== "arm64" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  !homedir().startsWith("/Users/runner")
)
  throw Error(
    "Preview installation acceptance requires an ephemeral macOS ARM64 GitHub runner",
  );
const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    archive: { type: "string" },
    source: { type: "string" },
    "previous-manifest": { type: "string" },
    output: { type: "string", default: "test-results/preview" },
  },
});
if (!values.manifest || !values.source)
  throw Error("Require --manifest and --source");
const manifest = validateChannel(
  JSON.parse(await readFile(values.manifest, "utf8")),
  "preview",
);
let previous;
if (values["previous-manifest"]) {
  try {
    previous = JSON.parse(await readFile(values["previous-manifest"], "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
assertProgression(previous, manifest, "preview");
const root = await mkdtemp(join(tmpdir(), "lapis-preview-homebrew-"));
const profile = join(
  homedir(),
  "Library/Application Support/com.lapismd.lapis-desktop.preview",
);
try {
  await access(profile);
  throw Error("Refusing to reuse an existing preview application profile");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const source = resolve(values.source),
  output = resolve(values.output);
const appdir = join(root, "Applications with spaces");
const app = join(appdir, "Lapis Notes Preview.app");
const vault = join(root, "vault-笔记 café");
const tap = `lapismd/preview-candidate-${process.pid}`;
const token = "lapis-notes-preview-candidate",
  name = `${tap}/${token}`;
const tapdir = join(
  execFileSync("brew", ["--repository"], { encoding: "utf8" }).trim(),
  "Library/Taps/lapismd",
  `homebrew-preview-candidate-${process.pid}`,
);
const cask = join(tapdir, "Casks", `${token}.rb`);
const env = { ...process.env, HOMEBREW_NO_AUTO_UPDATE: "1" };
function run(command, args) {
  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
    timeout: 300000,
  });
  process.stdout.write((result.stdout ?? "") + (result.stderr ?? ""));
  if (result.error || result.status !== 0)
    throw result.error ?? Error(`${command} failed (${result.status})`);
}
async function download(release, local) {
  const item = release.artifacts[0],
    destination = join(root, item.file);
  if (local) await copyFile(resolve(local), destination);
  else {
    const response = await fetch(item.url);
    if (!response.ok)
      throw Error(`Preview download failed: ${response.status}`);
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = await readFile(destination);
  assert.equal(bytes.length, item.size);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256);
  run("/usr/bin/xattr", [
    "-w",
    "com.apple.quarantine",
    "0081;00000000;LapisHomebrewTest;",
    destination,
  ]);
  return destination;
}
async function snapshot(directory) {
  const entries = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) entries.push(...(await snapshot(path)));
    else if (item.isFile()) entries.push([path, await readFile(path)]);
    else throw Error("Unexpected profile or vault symlink");
  }
  return entries;
}
async function retained(entries) {
  for (const [path, bytes] of entries)
    assert.deepEqual(
      await readFile(path),
      bytes,
      `Application data changed during Homebrew operation: ${path}`,
    );
}
let installed = false;
try {
  await Promise.all([
    mkdir(join(tapdir, "Casks"), { recursive: true }),
    mkdir(appdir),
    mkdir(profile, { recursive: true }),
    mkdir(vault),
    mkdir(output, { recursive: true }),
  ]);
  await writeFile(join(profile, ".homebrew-retained"), "profile retained");
  await writeFile(join(vault, "Welcome.md"), "# Retained vault\n");
  const archive = await download(manifest, values.archive);
  await writeFile(cask, renderCask(manifest, { candidateArchive: archive }));
  run("brew", ["trust", "--cask", name]);
  run("brew", ["style", name]);
  run("brew", ["audit", "--cask", "--strict", name]);
  const installArgs = ["--cask", `--appdir=${appdir}`, name];
  let before = [...(await snapshot(profile)), ...(await snapshot(vault))];
  if (previous && previous.version !== manifest.version) {
    const old = await download(previous);
    await writeFile(cask, renderCask(previous, { candidateArchive: old }));
    installed = true;
    run("brew", ["install", ...installArgs]);
    await retained(before);
    await writeFile(cask, renderCask(manifest, { candidateArchive: archive }));
    run("brew", ["upgrade", ...installArgs]);
  } else {
    installed = true;
    run("brew", ["install", ...installArgs]);
  }
  await retained(before);
  for (const phase of ["install", "reinstall"]) {
    if (phase === "reinstall") {
      run("brew", ["reinstall", ...installArgs]);
      await retained(before);
    }
    run(process.execPath, [
      join(source, "scripts/release/smoke-installed.mjs"),
      "--app",
      app,
      "--manifest",
      resolve(values.manifest),
      "--output",
      join(output, `${phase}.json`),
    ]);
    before = [...(await snapshot(profile)), ...(await snapshot(vault))];
  }
  run("brew", ["uninstall", "--cask", name]);
  installed = false;
  await retained(before);
  await assert.rejects(access(app));
  await writeFile(
    join(output, "homebrew.json"),
    JSON.stringify(
      {
        ok: true,
        version: manifest.version,
        sourceCommit: manifest.sourceCommit,
        install: "passed",
        reinstall: "passed",
        uninstall: "passed",
        retainedProfileAndVault: "passed",
        upgrade:
          previous && previous.version !== manifest.version
            ? "passed"
            : "not-run: no previous different preview",
        audit: "passed",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  if (installed)
    spawnSync("brew", ["uninstall", "--cask", name], { env, stdio: "inherit" });
  spawnSync("brew", ["untrust", "--cask", name], { env, stdio: "ignore" });
  await rm(tapdir, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
