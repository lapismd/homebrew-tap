import assert from "node:assert/strict";
import { test } from "node:test";
import { openUpdatePR } from "../scripts/open-update-pr.mjs";
import { renderCask } from "../scripts/cask.mjs";
import { previewFixture } from "./preview-fixture.mjs";
const m = previewFixture();
const files = {
  "Casks/lapis-notes@preview.rb": renderCask(m),
  "desktop-preview-manifest.json": JSON.stringify(m, null, 2) + "\n",
};
function server({
  current,
  failOnce = false,
  unrelated = false,
  wrongContents = false,
  behind = false,
} = {}) {
  const state = { branch: false, pull: null, calls: [] };
  state.request = async (endpoint, options = {}) => {
    const method = options.method ?? "GET";
    state.calls.push([method, endpoint]);
    if (endpoint === "/git/ref/heads/main") return { object: { sha: "base" } };
    if (endpoint.startsWith("/contents/")) {
      const [file, ref] = endpoint.slice("/contents/".length).split("?ref=");
      const text =
        ref === "base"
          ? current &&
            (file.endsWith(".json")
              ? JSON.stringify(current)
              : renderCask(current))
          : files[file];
      return text
        ? {
            type: "file",
            encoding: "base64",
            content: Buffer.from(
              wrongContents && ref !== "base" ? "wrong" : text,
            ).toString("base64"),
          }
        : null;
    }
    if (endpoint.startsWith("/git/ref/heads/homebrew"))
      return state.branch ? { object: { sha: "head" } } : null;
    if (endpoint === "/git/commits/base") return { tree: { sha: "tree" } };
    if (endpoint === "/git/trees") return { sha: "tree2" };
    if (endpoint === "/git/commits") return { sha: "head" };
    if (endpoint === "/git/refs") {
      state.branch = true;
      return { object: { sha: "head" } };
    }
    if (endpoint.startsWith("/compare/"))
      return {
        files: [...Object.keys(files), ...(unrelated ? ["README.md"] : [])].map(
          (filename) => ({ filename, status: "added" }),
        ),
        behind_by: behind ? 1 : 0,
      };
    if (endpoint.startsWith("/pulls?")) return state.pull ? [state.pull] : [];
    if (endpoint === "/pulls") {
      if (failOnce) {
        failOnce = false;
        throw Error("Interrupted PR creation");
      }
      state.pull = {
        number: 7,
        node_id: "pull7",
        html_url: "https://github.com/lapismd/homebrew-tap/pull/7",
        base: { ref: "main" },
      };
      return state.pull;
    }
    if (endpoint === "/graphql" || endpoint.endsWith("/update-branch"))
      return {};
    throw Error(`Unexpected API request: ${endpoint}`);
  };
  return state;
}
test("update PR creation and retry do not duplicate branches or PRs", async () => {
  const s = server();
  assert.equal(
    (await openUpdatePR(m, { channel: "preview", request: s.request })).status,
    "created",
  );
  assert.equal(
    (await openUpdatePR(m, { channel: "preview", request: s.request })).status,
    "reused",
  );
  assert.equal(
    s.calls.filter(
      ([method, path]) => method === "POST" && path === "/git/refs",
    ).length,
    1,
  );
  assert.equal(
    s.calls.filter(([method, path]) => method === "POST" && path === "/pulls")
      .length,
    1,
  );
  assert.equal(s.calls.filter(([, path]) => path === "/graphql").length, 2);
});
test("retry recovers a branch left before interrupted PR creation", async () => {
  const s = server({ failOnce: true });
  await assert.rejects(
    openUpdatePR(m, { channel: "preview", request: s.request }),
    /Interrupted/,
  );
  assert.equal(
    (await openUpdatePR(m, { channel: "preview", request: s.request })).status,
    "created",
  );
  assert.equal(s.calls.filter(([, path]) => path === "/git/refs").length, 1);
});
test("already merged updates are no-ops and stale or unrelated updates fail", async () => {
  const s = server({ current: m });
  assert.equal(
    (await openUpdatePR(m, { channel: "preview", request: s.request })).status,
    "already-updated",
  );
  for (const options of [
    { current: previewFixture("2026.31.6-rc.2") },
    { unrelated: true },
    { wrongContents: true },
  ])
    await assert.rejects(
      openUpdatePR(m, { channel: "preview", request: server(options).request }),
    );
});
test("behind update branches request a checked head update before auto-merge", async () => {
  const s = server({ behind: true });
  await openUpdatePR(m, { channel: "preview", request: s.request });
  assert.ok(
    s.calls.some(
      ([method, path]) => method === "PUT" && path === "/pulls/7/update-branch",
    ),
  );
});
