import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exitCodeForPhase, EXIT } from "../../src/cli/exit-codes.js";
import type { ErrorPhase } from "../../src/errors/index.js";

describe("error phases", () => {
  const expected: Record<ErrorPhase, number> = {
    Cli: EXIT.Cli,
    Manifest: EXIT.Cli,
    WorkingTree: EXIT.WorkingTree,
    Declaration: EXIT.Declaration,
    Toolchain: EXIT.Toolchain,
    NotCurrent: EXIT.NotCurrent,
    Test: EXIT.Test,
    Execution: EXIT.Execution,
  };

  for (const [phase, code] of Object.entries(expected) as [ErrorPhase, number][]) {
    it(`maps ${phase} to ${code}`, () => {
      assert.equal(exitCodeForPhase(phase), code);
    });
  }

  it("documents the stable exit code table", () => {
    assert.equal(EXIT.Ok, 0);
    assert.equal(EXIT.Execution, 1);
    assert.equal(EXIT.Cli, 2);
    assert.equal(EXIT.WorkingTree, 3);
    assert.equal(EXIT.Toolchain, 4);
    assert.equal(EXIT.NotCurrent, 5);
    assert.equal(EXIT.Declaration, 6);
    assert.equal(EXIT.Test, 7);
  });
});
