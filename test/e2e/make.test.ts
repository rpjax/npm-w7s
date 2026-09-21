import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { currencyOf } from "../../src/artifacts/currency.js";

describe("make e2e", () => {
  it("runs steps in order and skips current ones on second make", async () => {
    const ws = createWorkspace();
    try {
      const first = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.equal(first.exitCode, 0, first.stdout + first.stderr);
      const payload1 = JSON.parse(first.stdout) as {
        ok: boolean;
        result: { stepsRun: string[]; stepsSkipped: string[]; artifact: string };
        fingerprint: string;
      };
      assert.equal(payload1.ok, true);
      assert.deepEqual(payload1.result.stepsRun, [
        "gecko-source",
        "gecko-binary",
        "sidecar-package",
      ]);
      assert.deepEqual(payload1.result.stepsSkipped, []);

      ws.ports.output.reset();
      process.exitCode = undefined;
      const second = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.equal(second.exitCode, 0, second.stdout);
      const payload2 = JSON.parse(second.stdout) as {
        result: { stepsRun: string[]; stepsSkipped: string[] };
      };
      assert.ok(payload2.result.stepsSkipped.includes("gecko-source"));
      assert.ok(payload2.result.stepsSkipped.includes("gecko-binary"));
      assert.ok(payload2.result.stepsSkipped.includes("sidecar-package"));
      assert.equal(payload2.result.stepsRun.length, 0);

      assert.equal(
        currencyOf(
          "sidecar-package",
          ws.dir,
          ws.paths.sidecarPackage,
          payload1.fingerprint,
        ).status,
        "current",
      );
    } finally {
      ws.cleanup();
    }
  });

  it("stops at the first failure and never reports incomplete as passing", async () => {
    const ws = createWorkspace();
    try {
      ws.ports.engine.runImpl = async (argv) => {
        const script = argv[argv.length - 1] ?? "";
        if (script.includes("mach build")) {
          return { exitCode: 1, stdout: "", stderr: "mach build failed" };
        }
        // Bootstrap (and anything else) must succeed so the failure is the compile step.
        return { exitCode: 0, stdout: "", stderr: "" };
      };

      const result = await runProgram(["gecko", "make", "gecko-binary", "--json"], ws.ports);
      assert.notEqual(result.exitCode, 0);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string; exitCode: number };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "Execution");
      assert.equal(payload.exitCode, 1);
    } finally {
      ws.cleanup();
    }
  });

  it("--only fails when a dependency is not current", async () => {
    const ws = createWorkspace();
    try {
      const result = await runProgram(
        ["gecko", "make", "gecko-binary", "--only", "--json"],
        ws.ports,
      );
      assert.notEqual(result.exitCode, 0);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string; exitCode: number };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "NotCurrent");
      assert.equal(payload.exitCode, 5);
    } finally {
      ws.cleanup();
    }
  });
});
