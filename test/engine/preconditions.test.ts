import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { EXIT } from "../../src/cli/exit-codes.js";

/**
 * Engine tier preconditions — same exit code the CLI uses when the engine is absent.
 * This tier is NOT part of `npm test`; run via `npm run test:engine`.
 */
describe("engine preconditions", () => {
  it("exits 4 with Toolchain phase when the engine is unavailable", async () => {
    const ws = createWorkspace();
    try {
      ws.ports.engine.availableFlag = false;
      const result = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(result.exitCode, EXIT.Toolchain);
      const payload = JSON.parse(result.stdout) as {
        ok: boolean;
        phase: string;
        exitCode: number;
        message: string;
      };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "Toolchain");
      assert.equal(payload.exitCode, 4);
      assert.match(payload.message, /engine|unavailable|toolchain/i);
    } finally {
      ws.cleanup();
    }
  });

  it("exits 4 when the toolchain image is missing", async () => {
    const ws = createWorkspace();
    try {
      ws.ports.engine.images.clear();
      const result = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(result.exitCode, EXIT.Toolchain);
      const payload = JSON.parse(result.stdout) as { phase: string; exitCode: number };
      assert.equal(payload.phase, "Toolchain");
      assert.equal(payload.exitCode, 4);
    } finally {
      ws.cleanup();
    }
  });
});
