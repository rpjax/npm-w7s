import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";

describe("status e2e", () => {
  it("renders currency for every artifact and exposes --json equivalent", async () => {
    const ws = createWorkspace();
    try {
      const before = await runProgram(["gecko", "status", "--json"], ws.ports);
      assert.equal(before.exitCode, 0, before.stdout);
      const payloadBefore = JSON.parse(before.stdout) as {
        ok: boolean;
        result: { artifacts: Array<{ name: string; status: string }>; next: string };
      };
      assert.equal(payloadBefore.ok, true);
      const names = payloadBefore.result.artifacts.map((a) => a.name);
      assert.ok(names.includes("toolchain"));
      assert.ok(names.includes("gecko-source"));
      assert.ok(names.includes("gecko-binary"));
      assert.ok(names.includes("sidecar-package"));

      ws.ports.output.reset();
      process.exitCode = undefined;
      await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);

      ws.ports.output.reset();
      process.exitCode = undefined;
      const after = await runProgram(["gecko", "status", "--json"], ws.ports);
      const payloadAfter = JSON.parse(after.stdout) as {
        result: { artifacts: Array<{ name: string; status: string }> };
      };
      const source = payloadAfter.result.artifacts.find((a) => a.name === "gecko-source");
      assert.equal(source?.status, "current");
    } finally {
      ws.cleanup();
    }
  });

  it("human status includes a next command", async () => {
    const ws = createWorkspace();
    try {
      const result = await runProgram(["gecko", "status"], ws.ports);
      assert.equal(result.exitCode, 0, result.stdout);
      assert.match(result.stdout, /next ->/);
    } finally {
      ws.cleanup();
    }
  });
});
