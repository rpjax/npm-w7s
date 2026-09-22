import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertContainerFriendlyPath,
  dockerHostPath,
  dockerVolumeSpec,
} from "../../src/engine/mount.js";
import { W7sError } from "../../src/errors/index.js";

describe("docker mounts", () => {
  it("normalizes backslashes for -v specs", () => {
    assert.equal(dockerHostPath("C:\\a\\b"), "C:/a/b");
    assert.equal(dockerVolumeSpec("C:\\a\\b", "/gecko-source"), "C:/a/b:/gecko-source");
    assert.equal(
      dockerVolumeSpec("\\\\wsl$\\Ubuntu\\root\\x", "/gecko-source"),
      "//wsl$/Ubuntu/root/x:/gecko-source",
    );
    assert.equal(
      dockerVolumeSpec("C:\\a\\mozconfig", "/w7s.mozconfig", "ro"),
      "C:/a/mozconfig:/w7s.mozconfig:ro",
    );
  });

  it("rejects Windows drive-letter Gecko mounts on win32", () => {
    if (process.platform !== "win32") {
      return;
    }
    assert.throws(
      () => assertContainerFriendlyPath("C:\\RPJ\\tree", "gecko-source"),
      (err: unknown) => err instanceof W7sError && err.phase === "Toolchain",
    );
    assert.doesNotThrow(() =>
      assertContainerFriendlyPath("\\\\wsl$\\Ubuntu\\root\\w7s-smoke\\.w7s\\gecko\\153.2.0", "gecko-source"),
    );
  });
});
