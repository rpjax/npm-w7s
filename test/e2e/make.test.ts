import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { writeJson } from "../helpers/fakes.js";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
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
        result: { stepsRun: string[]; stepsSkipped: string[] };
        fingerprint: string;
      };
      assert.equal(payload1.ok, true);
      assert.ok(payload1.result.stepsRun.includes("gecko-source"));
      assert.ok(payload1.result.stepsRun.includes("gecko-binary"));
      assert.ok(payload1.result.stepsRun.includes("sidecar-package"));

      ws.ports.output.reset();
      process.exitCode = undefined;
      const second = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.equal(second.exitCode, 0, second.stdout);
      const payload2 = JSON.parse(second.stdout) as {
        result: { stepsRun: string[]; stepsSkipped: string[] };
      };
      assert.ok(payload2.result.stepsSkipped.length >= 2);

      const paths = resolveWorkspace(ws.dir);
      assert.equal(
        currencyOf("sidecar-package", ws.dir, paths.sidecarPackage, payload1.fingerprint).status,
        "current",
      );
    } finally {
      ws.cleanup();
    }
  });

  it("stops at the first failure and never reports incomplete release-gates as passing", async () => {
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
      ws.ports.engine.runImpl = async () => ({ exitCode: 1, stdout: "", stderr: "boom" });

      const result = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.notEqual(result.exitCode, 0);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string };
      assert.equal(payload.ok, false);
      assert.ok(payload.phase === "Test" || payload.phase === "Execution");
    } finally {
      ws.cleanup();
    }
  });

  it("--only fails when dependency is not current", async () => {
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
      void writeJson;
    } finally {
      ws.cleanup();
    }
  });
});
