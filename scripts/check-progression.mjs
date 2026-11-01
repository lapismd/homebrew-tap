import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { assertProgression, channelPaths } from "./channels.mjs";
const { values } = parseArgs({ options: { base: { type: "string" } } });
if (!values.base) throw Error("An explicit PR base checkout is required");
async function optional(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
for (const channel of ["stable", "preview"]) {
  const { manifest } = channelPaths(channel);
  const previous = await optional(join(values.base, manifest));
  const next = await optional(manifest);
  if (previous && !next)
    throw Error(`Refusing to remove the ${channel} release manifest`);
  if (next) assertProgression(previous, next, channel);
}
