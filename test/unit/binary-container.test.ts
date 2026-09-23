import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forwardSpeculumEnv } from "../../src/toolchain/binary-container.js";

describe("forwardSpeculumEnv", () => {
  it("forwards only SPECULUM_* keys", () => {
    const args = forwardSpeculumEnv({
      SPECULUM_MONOREPO_ROOT: "/repo",
      SPECULUM_PHASE9_DIGEST_OUT: "/out",
      PATH: "/usr/bin",
      OTHER: "nope",
    });
    assert.deepEqual(args, [
      "-e",
      "SPECULUM_MONOREPO_ROOT=/repo",
      "-e",
      "SPECULUM_PHASE9_DIGEST_OUT=/out",
    ]);
  });

  it("skips undefined values", () => {
    const env: NodeJS.ProcessEnv = { SPECULUM_A: "1", SPECULUM_B: undefined };
    assert.deepEqual(forwardSpeculumEnv(env), ["-e", "SPECULUM_A=1"]);
  });
});
