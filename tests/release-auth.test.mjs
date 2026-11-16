import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { readPublishedManifest } from "../scripts/update-cask.mjs";
import { fixture } from "./fixtures.mjs";
import { linuxPreviewFixture } from "./preview-fixture.mjs";

for (const channel of ["stable", "preview"]) {
  test(`${channel} release metadata uses scoped API authentication`, async () => {
    const manifest = channel === "preview" ? linuxPreviewFixture() : fixture();
    const bytes = Buffer.from("verified release archive");
    for (const artifact of manifest.artifacts) {
      artifact.size = bytes.length;
      artifact.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    const release = {
      draft: false,
      prerelease: channel === "preview",
      tag_name: manifest.tag,
      assets: [
        { name: "desktop-manifest.json" },
        ...manifest.artifacts.map((a) => ({
          name: a.file,
          size: a.size,
          browser_download_url: a.url,
        })),
      ],
    };
    const api = [],
      downloads = [];
    const fetcher = async (url, options) => {
      const headers = new Headers(options?.headers);
      if (
        url.startsWith(`https://api.github.com/repos/${manifest.repository}/`)
      ) {
        if (headers.get("authorization") !== "Bearer fixture-read-token")
          return new Response("Anonymous API access refused", { status: 403 });
        assert.equal(options.redirect, "error");
        api.push(url);
        if (url.includes("/releases/tags/")) return Response.json(release);
        return Response.json({
          object: url.includes("/git/ref/tags/")
            ? { type: "tag", sha: "c".repeat(40) }
            : { type: "commit", sha: manifest.sourceCommit },
        });
      }
      assert.equal(headers.get("authorization"), null);
      downloads.push(url);
      if (url.endsWith("desktop-manifest.json")) return Response.json(manifest);
      assert.ok(manifest.artifacts.some((artifact) => artifact.url === url));
      return new Response(bytes);
    };
    assert.deepEqual(
      await readPublishedManifest(manifest.tag, fetcher, {
        channel,
        token: "fixture-read-token",
      }),
      manifest,
    );
    assert.equal(api.length, 3);
    assert.equal(downloads.length, manifest.artifacts.length + 1);
  });
}

test("authenticated release metadata failures remain fatal without retries", async () => {
  let calls = 0;
  await assert.rejects(
    readPublishedManifest(
      linuxPreviewFixture().tag,
      async () => {
        calls++;
        return new Response("Forbidden", { status: 403 });
      },
      { channel: "preview", token: "fixture-read-token" },
    ),
    /HTTP 403/,
  );
  assert.equal(calls, 1);
});
