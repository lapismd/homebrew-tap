import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const helper = fileURLToPath(
  new URL("../scripts/prepare-macos.sh", import.meta.url),
);

test(
  "macOS preparation is idempotent, recursive and scoped to the signed Lapis bundle",
  { skip: process.platform !== "darwin" },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lapis-tap-macos-"));
    try {
      const bundle = path.join(
        root,
        "Applications with spaces/Lapis Notes.app",
      );
      await mkdir(path.join(bundle, "Contents/MacOS"), { recursive: true });
      await copyFile("/bin/echo", path.join(bundle, "Contents/MacOS/echo"));
      await writeFile(
        path.join(bundle, "Contents/Info.plist"),
        `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>echo</string><key>CFBundleIdentifier</key><string>notes.lapis.desktop</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1.0</string></dict></plist>`,
      );
      execFileSync("/usr/bin/codesign", [
        "--force",
        "--deep",
        "--sign",
        "-",
        bundle,
      ]);
      const neighbor = path.join(root, "other-application");
      await writeFile(neighbor, "other");
      for (const file of [
        bundle,
        path.join(bundle, "Contents/MacOS/echo"),
        neighbor,
      ])
        execFileSync("/usr/bin/xattr", [
          "-w",
          "com.apple.quarantine",
          "0081;00000000;LapisTest;",
          file,
        ]);
      execFileSync("/usr/bin/xattr", [
        "-w",
        "com.lapismd.retained",
        "retained",
        bundle,
      ]);
      execFileSync("/bin/sh", [helper, bundle]);
      execFileSync("/bin/sh", [helper, bundle]);
      assert.doesNotMatch(
        execFileSync("/usr/bin/xattr", ["-r", bundle], { encoding: "utf8" }),
        /com.apple.quarantine/,
      );
      assert.equal(
        execFileSync("/usr/bin/xattr", ["-p", "com.lapismd.retained", bundle], {
          encoding: "utf8",
        }).trim(),
        "retained",
      );
      assert.match(
        execFileSync(
          "/usr/bin/xattr",
          ["-p", "com.apple.quarantine", neighbor],
          { encoding: "utf8" },
        ),
        /LapisTest/,
      );
      execFileSync("/usr/bin/codesign", [
        "--verify",
        "--deep",
        "--strict",
        bundle,
      ]);
      execFileSync("/usr/bin/plutil", [
        "-replace",
        "CFBundleIdentifier",
        "-string",
        "other.app",
        path.join(bundle, "Contents/Info.plist"),
      ]);
      execFileSync("/usr/bin/xattr", [
        "-w",
        "com.apple.quarantine",
        "0081;00000000;LapisTest;",
        bundle,
      ]);
      const rejected = spawnSync("/bin/sh", [helper, bundle], {
        encoding: "utf8",
      });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /different macOS application/);
      assert.match(
        execFileSync("/usr/bin/xattr", ["-p", "com.apple.quarantine", bundle], {
          encoding: "utf8",
        }),
        /LapisTest/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
