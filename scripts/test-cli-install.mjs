import { readFile, mkdir, writeFile, rm, lstat } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { renderFormula } from "./cli.mjs";
import { readPublishedCliManifest } from "./cli-release.mjs";
if (process.env.GITHUB_ACTIONS !== "true")
  throw Error("Native formula acceptance requires an ephemeral GitHub runner");
const manifest = JSON.parse(await readFile("cli-manifest.json", "utf8"));
await readPublishedCliManifest(`v${manifest.version}`, fetch, {
  token: process.env.GITHUB_TOKEN,
});
const repository = execFileSync("brew", ["--repository"], {
  encoding: "utf8",
}).trim();
const tap = `lapismd/cli-candidate-${process.pid}`,
  name = `${tap}/lapis`;
const directory = join(
  repository,
  "Library/Taps/lapismd",
  `homebrew-cli-candidate-${process.pid}`,
);
if (
  await lstat(directory).then(
    () => true,
    (e) => {
      if (e.code === "ENOENT") return false;
      throw e;
    },
  )
)
  throw Error("CLI candidate tap already exists");
let installed = false;
const env = { ...process.env, HOMEBREW_NO_AUTO_UPDATE: "1" };
const run = (args) =>
  execFileSync("brew", args, { env, stdio: "inherit", timeout: 300000 });
try {
  await mkdir(join(directory, "Formula"), { recursive: true });
  await writeFile(join(directory, "Formula/lapis.rb"), renderFormula(manifest));
  run(["style", join(directory, "Formula/lapis.rb")]);
  run(["install", "--formula", name]);
  installed = true;
  run(["test", name]);
  run(["reinstall", name]);
  run(["test", name]);
  run(["uninstall", name]);
  installed = false;
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/cli-install.json",
    JSON.stringify({
      version: manifest.version,
      sourceCommit: manifest.sourceCommit,
      platform: process.platform,
      architecture: process.arch,
      install: true,
      reinstall: true,
      uninstall: true,
    }) + "\n",
  );
} finally {
  if (installed)
    spawnSync("brew", ["uninstall", name], { env, stdio: "inherit" });
  await rm(directory, { recursive: true, force: true });
}
