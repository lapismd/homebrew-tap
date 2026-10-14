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
  const generated = path.join(root, "Casks/lapis-notes.rb");
  await writeFile(generated, renderCask(fixture()));
  run("ruby", ["-c", generated]);
  if (process.env.LAPIS_TAP_BREW_CHECK === "1")
    run("brew", ["style", generated]);
} finally {
  await rm(root, { recursive: true, force: true });
}
const casks = (await readdir("Casks")).filter((file) => file.endsWith(".rb"));
if (casks.length) {
  const manifest = JSON.parse(await readFile("desktop-manifest.json", "utf8"));
  if (
    casks.length !== 1 ||
    casks[0] !== "lapis-notes.rb" ||
    (await readFile("Casks/lapis-notes.rb", "utf8")) !== renderCask(manifest)
  )
    throw new Error(
      "Production cask must match its upstream release manifest exactly",
    );
  run("ruby", ["-c", "Casks/lapis-notes.rb"]);
} else {
  console.log(
    "Tap bootstrap: first verified desktop release has not populated the production cask yet.",
  );
}
