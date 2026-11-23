import { createHash } from "node:crypto";
import { validateCliManifest } from "./cli.mjs";

async function boundedJson(response) {
  if (!response.ok)
    throw Error(`CLI release request failed: ${response.status}`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 65536) throw Error("CLI release metadata exceeds its bound");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function readPublishedCliManifest(
  tag,
  fetcher = fetch,
  { token } = {},
) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? ""))
    throw Error("An exact CLI version tag is required");
  const api = async (path) =>
    boundedJson(
      await fetcher(
        `https://api.github.com/repos/lapismd/lapis-server${path}`,
        {
          redirect: "error",
          headers: {
            Accept: "application/vnd.github+json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      ),
    );
  const release = await api(`/releases/tags/${tag}`);
  if (
    release.draft ||
    release.prerelease ||
    release.tag_name !== tag ||
    !Array.isArray(release.assets)
  )
    throw Error("A published stable CLI release is required");
  const assets = (name) => release.assets.filter((a) => a.name === name);
  if (assets("cli-manifest.json").length !== 1)
    throw Error("CLI manifest asset missing or ambiguous");
  const m = validateCliManifest(
    await boundedJson(
      await fetcher(
        `https://github.com/lapismd/lapis-server/releases/download/${tag}/cli-manifest.json`,
      ),
    ),
  );
  if (`v${m.version}` !== tag) throw Error("CLI release version mismatch");
  let { object } = await api(`/git/ref/tags/${tag}`);
  for (let depth = 0; object.type === "tag" && depth < 5; depth++)
    object = (await api(`/git/tags/${object.sha}`)).object;
  if (object.type !== "commit" || object.sha !== m.sourceCommit)
    throw Error("CLI source does not match its release tag");
  for (const a of m.archives) {
    const matches = assets(a.file);
    if (
      matches.length !== 1 ||
      matches[0].size !== a.size ||
      matches[0].browser_download_url !== a.url
    )
      throw Error("CLI archive asset mismatch");
    const response = await fetcher(a.url);
    if (!response.ok) throw Error("CLI archive download failed");
    let size = 0;
    const hash = createHash("sha256");
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > a.size) throw Error("CLI archive exceeds declared size");
      hash.update(chunk);
    }
    if (size !== a.size || hash.digest("hex") !== a.sha256)
      throw Error("CLI archive checksum mismatch");
  }
  return m;
}
