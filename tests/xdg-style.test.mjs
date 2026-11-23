import test from "node:test";
import assert from "node:assert/strict";
import { renderCask } from "../scripts/cask.mjs";
import { fixture } from "./fixtures.mjs";
import { linuxPreviewFixture } from "./preview-fixture.mjs";
test("Linux desktop entry paths retain XDG precedence without multiline Ruby interpolation", () => {
  for (const m of [fixture(), linuxPreviewFixture()]) {
    const ruby = renderCask(m);
    assert.doesNotMatch(ruby, /#\{ENV\.fetch/);
    assert.match(ruby, /xdg_data_home = ENV.fetch\("HOMEBREW_XDG_DATA_HOME"\)/);
    assert.match(ruby, /ENV.fetch\("XDG_DATA_HOME", File.join\(Dir.home/);
    assert.match(ruby, /#\{xdg_data_home\}\/applications\//);
    assert.match(ruby, /\n\n    xdg_data_home =/);
    assert.match(ruby, /xdg_data_home = [\s\S]*?    end\n\n    binary/);
  }
});
