import {
  readdir,
  readFile,
  mkdir,
  mkdtemp,
  writeFile,
  rm,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { renderCask } from "./cask.mjs";
import { cliFixture } from "../tests/cli-fixture.mjs";
import { renderFormula } from "./cli.mjs";
import { channelPaths } from "./channels.mjs";
import {
  previewFixture,
  linuxPreviewFixture,
} from "../tests/preview-fixture.mjs";
import { fixture } from "../tests/fixtures.mjs";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw result.error || new Error(`${command} failed (${result.status})`);
}
for (const directory of ["scripts", "tests"]) {
  for (const file of await readdir(directory))
    if (file.endsWith(".mjs"))
      run(process.execPath, ["--check", path.join(directory, file)]);
}
run("/bin/sh", ["-n", "scripts/prepare-macos.sh"]);
const root = await mkdtemp(path.join(os.tmpdir(), "lapis-cask-check-"));
try {
  await mkdir(path.join(root, "Casks"));
  await mkdir(path.join(root, "Formula"));
  const formula = path.join(root, "Formula/lapis.rb");
  await writeFile(formula, renderFormula(cliFixture()));
  run("ruby", ["-c", formula]);
  if (process.env.LAPIS_TAP_BREW_CHECK === "1") run("brew", ["style", formula]);
  for (const manifest of [fixture(), previewFixture(), linuxPreviewFixture()]) {
    const file =
      manifest.schemaVersion === 2
        ? "lapis-notes@preview.rb"
        : "lapis-notes.rb";
    const generated = path.join(root, "Casks", file);
    await writeFile(generated, renderCask(manifest));
    run("ruby", ["-c", generated]);
    if (process.env.LAPIS_TAP_BREW_CHECK === "1")
      run("brew", ["style", generated]);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
const casks = (await readdir("Casks")).filter((file) => file.endsWith(".rb"));
const expected = [];
for (const channel of ["stable", "preview"]) {
  const paths = channelPaths(channel);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(paths.manifest, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!manifest) continue;
  expected.push(path.basename(paths.cask));
  if ((await readFile(paths.cask, "utf8")) !== renderCask(manifest))
    throw Error(
      "Production cask must match its upstream release manifest exactly",
    );
  run("ruby", ["-c", paths.cask]);
}
if (JSON.stringify(casks.sort()) !== JSON.stringify(expected.sort()))
  throw Error("Unexpected cask or missing release manifest");

const formulaFiles = await readdir("Formula").catch((e) => {
  if (e.code === "ENOENT") return [];
  throw e;
});
let cli;
try {
  cli = JSON.parse(await readFile("cli-manifest.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (
  JSON.stringify(formulaFiles.sort()) !==
  JSON.stringify(cli ? ["lapis.rb"] : [])
)
  throw Error("Unexpected formula or missing CLI manifest");
if (cli) {
  if ((await readFile("Formula/lapis.rb", "utf8")) !== renderFormula(cli))
    throw Error("CLI formula differs from verified manifest");
  run("ruby", ["-c", "Formula/lapis.rb"]);
  if (process.env.LAPIS_TAP_BREW_CHECK === "1")
    run("brew", ["style", "Formula/lapis.rb"]);
}
