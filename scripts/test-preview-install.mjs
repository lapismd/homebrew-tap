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
import {
  nativePreviewTarget,
  installationPaths,
  verifyLinuxInstallation,
} from "./preview-host.mjs";

const target = nativePreviewTarget();
const { values } = parseArgs({
  options: {
    public: { type: "boolean" },
    manifest: { type: "string" },
    archive: { type: "string" },
    source: { type: "string" },
    "previous-manifest": { type: "string" },
    output: { type: "string", default: "test-results/preview" },
  },
});
if (!values.manifest || !values.source)
  throw Error("Require --manifest and --source");
if (values.public && (values.archive || values["previous-manifest"]))
  throw Error(
    "Public verification uses the published cask and accepts no candidate overrides",
  );
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
const source = resolve(values.source),
  output = resolve(values.output);
const appdir = join(root, "Applications with spaces");
const vault = join(root, "vault-笔记 café");
const tap = values.public
  ? "lapismd/tap"
  : `lapismd/preview-candidate-${process.pid}`;
const token = values.public
    ? "lapis-notes@preview"
    : "lapis-notes-preview-candidate",
  name = `${tap}/${token}`;
const tapdir = join(
  execFileSync("brew", ["--repository"], { encoding: "utf8" }).trim(),
  "Library/Taps/lapismd",
  `homebrew-preview-candidate-${process.pid}`,
);
const cask = join(tapdir, "Casks", `${token}.rb`);
const paths = installationPaths(root, token, manifest.version, target);
const { app, profile, env } = paths;
const artifact = manifest.artifacts.find((a) => a.target === target.target);
assert.ok(artifact, "Preview manifest must support this native platform");
try {
  await access(profile);
  throw Error("Refusing to reuse an existing preview application profile");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

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
  const item = release.artifacts.find((a) => a.target === target.target);
  assert.ok(item, "Previous preview must support this native platform");
  const destination = join(root, item.file);
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
  if (target.platform === "macos")
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
let installed = false,
  ownsPublicTap = false;
try {
  await Promise.all([
    mkdir(join(tapdir, "Casks"), { recursive: true }),
    mkdir(appdir),
    mkdir(profile, { recursive: true }),
    mkdir(vault),
    mkdir(output, { recursive: true }),
    mkdir(join(paths.dataHome, "applications"), { recursive: true }),
  ]);
  await writeFile(join(profile, ".homebrew-retained"), "profile retained");
  await writeFile(join(vault, "Welcome.md"), "# Retained vault\n");
  const archive = await download(manifest, values.archive);
  if (values.public) {
    run("brew", ["tap", "lapismd/tap"]);
    ownsPublicTap = true;
    const official = execFileSync("brew", ["--repository", "lapismd/tap"], {
      encoding: "utf8",
    }).trim();
    assert.equal(
      await readFile(join(official, "Casks/lapis-notes@preview.rb"), "utf8"),
      renderCask(manifest),
      "Public tap must contain the exact verified cask",
    );
  } else
    await writeFile(cask, renderCask(manifest, { candidateArchive: archive }));
  run("brew", ["trust", "--cask", name]);
  run("brew", ["style", name]);
  run("brew", ["audit", "--cask", "--strict", name]);
  const installArgs = [
    "--cask",
    ...(target.platform === "macos" ? [`--appdir=${appdir}`] : []),
    name,
  ];
  const prior = previous?.artifacts.find((a) => a.target === target.target);
  let before = [...(await snapshot(profile)), ...(await snapshot(vault))];
  if (prior && previous.version !== manifest.version) {
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
    if (target.platform === "linux") await verifyLinuxInstallation(paths, run);
    run(process.execPath, [
      join(
        source,
        target.platform === "macos"
          ? "scripts/release/smoke-installed.mjs"
          : "scripts/release/smoke-linux.mjs",
      ),
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
  if (target.platform === "linux") {
    await assert.rejects(access(paths.launcher));
    await assert.rejects(access(paths.desktop));
  }
  await writeFile(
    join(output, "homebrew.json"),
    JSON.stringify(
      {
        ok: true,
        cask: name,
        distribution: values.public ? "public" : "candidate",
        version: manifest.version,
        sourceCommit: manifest.sourceCommit,
        target: artifact.target,
        artifactSha256: artifact.sha256,
        install: "passed",
        reinstall: "passed",
        uninstall: "passed",
        retainedProfileAndVault: "passed",
        upgrade: values.public
          ? "not-run: fresh public installation; see candidate upgrade receipts"
          : prior && previous.version !== manifest.version
            ? "passed"
            : previous && !prior
              ? "not-run: no previous preview for this platform"
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
  if (ownsPublicTap)
    spawnSync("brew", ["untap", "lapismd/tap"], { env, stdio: "inherit" });
  await rm(tapdir, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
