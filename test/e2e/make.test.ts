import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { resolveWorkspace } from "../../src/workspace/paths.js";
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

      const paths = resolveWorkspace(ws.dir);
      assert.equal(
        currencyOf("sidecar-package", ws.dir, paths.sidecarPackage, payload1.fingerprint).status,
        "current",
      );
    } finally {
      ws.cleanup();
    }
  });

  it("stops at the first failure and never reports incomplete as passing", async () => {
    const ws = createWorkspace({
      tests: [
        {
          name: "failing gate",
          description: "always fails",
          entryPoint: "./tests/fail.sh",
          runner: "bash",
          workingDirectory: "./tests",
          classification: "release-gate",
          dependsOn: [],
          verifies: "build-output",
        },
      ],
    });
    try {
      mkdirSync(join(ws.dir, "tests"), { recursive: true });
      writeFileSync(join(ws.dir, "tests", "fail.sh"), "exit 1\n");
      // Succeed for mach build; fail only when the release-gate test runs.
      ws.ports.engine.runImpl = async (argv) => {
        if (argv.includes("./tests/fail.sh") || argv.some((a) => a.includes("fail.sh"))) {
          return { exitCode: 1, stdout: "", stderr: "boom" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      };

      const result = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.notEqual(result.exitCode, 0);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string; exitCode: number };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "Test");
      assert.equal(payload.exitCode, 7);
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
