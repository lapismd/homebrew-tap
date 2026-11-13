import { lstat } from "node:fs/promises";

// setup-homebrew may own a symlink at this path. Leave its cleanup to the action.
export async function acquireTap(repository, install) {
  let existed = false;
  try {
    await lstat(repository);
    existed = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await install();
  return !existed;
}
