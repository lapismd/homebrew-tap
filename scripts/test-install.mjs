#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  access,
} from "node:fs/promises";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { renderCask, validateManifest } from "./cask.mjs";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    archive: { type: "string" },
    "archive-directory": { type: "string" },
    "previous-manifest": { type: "string" },
    source: { type: "string" },
    output: { type: "string" },
    audit: { type: "boolean" },
  },
});
if (!values.manifest || !values.source)
  throw new Error("Installation acceptance requires --manifest and --source");
const source = path.resolve(values.source);
const manifest = JSON.parse(await readFile(values.manifest, "utf8"));
const platform =
  process.platform === "darwin"
    ? "macos"
    : process.platform === "linux"
      ? "linux"
      : undefined;
const architecture =
  process.arch === "arm64"
    ? "arm64"
    : process.arch === "x64"
      ? "x64"
      : undefined;
if (!platform || !architecture)
  throw new Error("Unsupported native installation host");
validateManifest(manifest, { candidate: manifest.artifacts.length === 1 });
const artifact = manifest.artifacts.find(
  (item) => item.platform === platform && item.architecture === architecture,
);
assert.ok(artifact, "Manifest must include the executing native architecture");
const root = await mkdtemp(path.join(os.tmpdir(), "lapis-homebrew-install-"));
const output = path.resolve(values.output || "test-results");
await mkdir(output, { recursive: true });
let installed = false;
const tap = `lapismd/desktop-candidate-${process.pid}`;
const name = `${tap}/lapis-notes-candidate`;
const brewRepository = execFileSync("brew", ["--repository"], {
  encoding: "utf8",
}).trim();
const tapDirectory = path.join(
  brewRepository,
  "Library/Taps/lapismd",
  `homebrew-desktop-candidate-${process.pid}`,
);
const applicationDirectory = path.join(root, "Applications with spaces");
const dataHome = path.join(root, "xdg-data");
const env = {
  ...process.env,
  HOMEBREW_NO_AUTO_UPDATE: "1",
  HOMEBREW_XDG_DATA_HOME: dataHome,
  XDG_DATA_HOME: dataHome,
};

function run(command, args, options = {}) {
  const { quiet = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    env,
    cwd: source,
    encoding: "utf8",
    timeout: 300_000,
    ...spawnOptions,
  });
  const text = `${result.stdout || ""}${result.stderr || ""}`;
  if (text && (!quiet || result.status !== 0)) process.stdout.write(text);
  if (result.error || result.status !== 0)
    throw result.error || new Error(`${command} failed (${result.status})`);
  return result.stdout || "";
}
const installArgs = [
  "--cask",
  ...(platform === "macos" ? [`--appdir=${applicationDirectory}`] : []),
  name,
];
try {
  let archive = values.archive
    ? path.resolve(values.archive)
    : values["archive-directory"]
      ? path.resolve(values["archive-directory"], artifact.file)
      : undefined;
  if (!archive) {
    archive = path.join(root, artifact.file);
    const response = await fetch(artifact.url);
    if (!response.ok)
      throw new Error(
        `Unable to download desktop artifact: HTTP ${response.status}`,
      );
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = await readFile(archive);
  assert.equal(
    bytes.length,
    artifact.size,
    "Installed candidate size must match upstream manifest",
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    artifact.sha256,
    "Installed candidate checksum must match upstream manifest",
  );
  if (platform === "macos")
    run("/usr/bin/xattr", [
      "-w",
      "com.apple.quarantine",
      "0081;00000000;LapisHomebrewTest;",
      archive,
    ]);
  await mkdir(path.join(tapDirectory, "Casks"), { recursive: true });
  await mkdir(applicationDirectory, { recursive: true });
  await mkdir(path.join(dataHome, "applications"), { recursive: true });
  const candidate = { ...manifest, artifacts: [artifact] };
  await writeFile(
    path.join(tapDirectory, "Casks/lapis-notes-candidate.rb"),
    renderCask(candidate, { candidateArchive: archive }),
  );
  run("brew", ["trust", "--cask", name]);
  run("brew", ["style", name]);
  if (values.audit) run("brew", ["audit", "--cask", "--strict", name]);
  let previous;
  if (values["previous-manifest"]) {
    try {
      previous = validateManifest(
        JSON.parse(await readFile(values["previous-manifest"], "utf8")),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const prior = previous?.artifacts.find(
    (item) => item.platform === platform && item.architecture === architecture,
  );
  if (prior && previous.version !== manifest.version) {
    const comparison = manifest.version
      .split(".")
      .map(
        (part, index) =>
          Number(part) - Number(previous.version.split(".")[index]),
      )
      .find((part) => part !== 0);
    if (comparison < 0)
      throw new Error("Cannot qualify an upgrade to an older desktop version");
    const response = await fetch(prior.url);
    if (!response.ok)
      throw new Error("Unable to download the previous desktop release");
    const oldBytes = Buffer.from(await response.arrayBuffer());
    assert.equal(oldBytes.length, prior.size);
    assert.equal(
      createHash("sha256").update(oldBytes).digest("hex"),
      prior.sha256,
    );
    const oldArchive = path.join(root, prior.file);
    await writeFile(oldArchive, oldBytes);
    await writeFile(
      path.join(tapDirectory, "Casks/lapis-notes-candidate.rb"),
      renderCask(
        { ...previous, artifacts: [prior] },
        { candidateArchive: oldArchive },
      ),
    );
    run("brew", ["install", ...installArgs]);
    installed = true;
    await writeFile(
      path.join(tapDirectory, "Casks/lapis-notes-candidate.rb"),
      renderCask(candidate, { candidateArchive: archive }),
    );
    run("brew", ["upgrade", ...installArgs]);
  } else {
    run("brew", ["install", ...installArgs]);
    installed = true;
  }
  const info = JSON.parse(
    run("brew", ["info", "--json=v2", "--cask", name], { quiet: true }),
  );
  assert.equal(info.casks[0].version, manifest.version);
  const caskroom = execFileSync("brew", ["--caskroom"], {
    encoding: "utf8",
    env,
  }).trim();
  const stage = path.join(caskroom, "lapis-notes-candidate", manifest.version);
  const executable =
    platform === "macos"
      ? path.join(
          applicationDirectory,
          "Lapis Notes.app/Contents/MacOS/laufey_webview",
        )
      : path.join(
          execFileSync("brew", ["--prefix"], { encoding: "utf8", env }).trim(),
          "bin/lapis-notes",
        );
  const evidence = [];
  for (const phase of [
    prior && previous.version !== manifest.version ? "upgrade" : "install",
    "reinstall",
  ]) {
    if (phase === "reinstall") run("brew", ["reinstall", ...installArgs]);
    if (platform === "macos") {
      const bundle = path.join(applicationDirectory, "Lapis Notes.app");
      assert.equal(
        run("/usr/bin/plutil", [
          "-extract",
          "CFBundleShortVersionString",
          "raw",
          "-o",
          "-",
          path.join(bundle, "Contents/Info.plist"),
        ]).trim(),
        manifest.version,
      );
      assert.equal(
        run("/usr/bin/plutil", [
          "-extract",
          "CFBundleVersion",
          "raw",
          "-o",
          "-",
          path.join(bundle, "Contents/Info.plist"),
        ]).trim(),
        manifest.version,
      );
      assert.doesNotMatch(
        run("/usr/bin/xattr", ["-r", bundle], { quiet: true }),
        /com.apple.quarantine/,
      );
      run("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle]);
    } else {
      run(executable, ["--check-runtime"]);
      const desktop = await readFile(
        path.join(dataHome, "applications/lapis-notes.desktop"),
        "utf8",
      );
      assert.ok(
        desktop.includes(`Exec="${path.dirname(executable)}/lapis-notes" %u`),
      );
      assert.ok(
        desktop.includes(
          `Icon=${stage}/Lapis-Notes-${manifest.version}-linux-${architecture}/lapis-notes.png`,
        ),
      );
      assert.match(desktop, /x-scheme-handler\/lapis-notes/);
      run("desktop-file-validate", [
        path.join(dataHome, "applications/lapis-notes.desktop"),
      ]);
    }
    const report = path.join(
      output,
      `${platform}-${architecture}-${phase}.json`,
    );
    run(
      process.execPath,
      [
        path.join(source, "packages/desktop-deno/scripts/smoke-packaged.mjs"),
        "--core",
        ...(platform === "macos"
          ? [
              "--launch-services",
              path.join(applicationDirectory, "Lapis Notes.app"),
            ]
          : []),
      ],
      {
        env: {
          ...env,
          LAPIS_DENO_PACKAGED_EXECUTABLE: executable,
          LAPIS_DENO_SMOKE_REPORT: report,
        },
      },
    );
    evidence.push(JSON.parse(await readFile(report, "utf8")));
  }
  const retainedData = path.join(root, "retained-user-data");
  await writeFile(retainedData, "retained");
  run("brew", ["uninstall", "--cask", name]);
  installed = false;
  assert.equal(await readFile(retainedData, "utf8"), "retained");
  if (platform === "macos")
    await assert.rejects(
      access(path.join(applicationDirectory, "Lapis Notes.app")),
    );
  else {
    await assert.rejects(access(executable));
    await assert.rejects(
      access(path.join(dataHome, "applications/lapis-notes.desktop")),
    );
  }
  await writeFile(
    path.join(output, `${platform}-${architecture}-homebrew.json`),
    `${JSON.stringify({ ok: true, platform, architecture, version: manifest.version, sourceCommit: manifest.sourceCommit, upgradedFrom: prior && previous.version !== manifest.version ? previous.version : null, audit: values.audit ? "passed" : "not-run", install: "passed", reinstall: "passed", uninstall: "passed", coreRuns: evidence.length }, null, 2)}\n`,
  );
} finally {
  if (installed)
    spawnSync("brew", ["uninstall", "--cask", name], { env, stdio: "inherit" });
  spawnSync("brew", ["untrust", "--cask", name], { env, stdio: "ignore" });
  await rm(tapDirectory, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
}
