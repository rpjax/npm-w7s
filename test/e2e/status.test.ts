import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { stampArtifact } from "../../src/artifacts/currency.js";
import { resolveWorkspace } from "../../src/workspace/paths.js";

describe("status e2e", () => {
  it("reports missing artifacts before make, then current after", async () => {
    const ws = createWorkspace();
    try {
      const before = await runProgram(["gecko", "status", "--json"], ws.ports);
      assert.equal(before.exitCode, 0, before.stdout);
      const payloadBefore = JSON.parse(before.stdout) as {
        ok: boolean;
        fingerprint: string;
        result: { artifacts: Array<{ name: string; status: string }>; next: string };
      };
      assert.equal(payloadBefore.ok, true);
      assert.match(payloadBefore.fingerprint, /^[a-f0-9]{12}$/);

      const byName = Object.fromEntries(
        payloadBefore.result.artifacts.map((a) => [a.name, a.status]),
      );
      assert.equal(byName.toolchain, "ok");
      assert.equal(byName["gecko-source"], "missing");
      assert.equal(byName["gecko-binary"], "missing");
      assert.equal(byName["sidecar-package"], "missing");
      assert.equal(payloadBefore.result.next, "w7s gecko make gecko-source");

      ws.ports.output.reset();
      process.exitCode = undefined;
      const make = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout);

      ws.ports.output.reset();
      process.exitCode = undefined;
      const after = await runProgram(["gecko", "status", "--json"], ws.ports);
      const payloadAfter = JSON.parse(after.stdout) as {
        result: { artifacts: Array<{ name: string; status: string }>; next: string };
      };
      const afterByName = Object.fromEntries(
        payloadAfter.result.artifacts.map((a) => [a.name, a.status]),
      );
      assert.equal(afterByName["gecko-source"], "current");
      assert.equal(afterByName["gecko-binary"], "missing");
      assert.equal(afterByName["sidecar-package"], "missing");
      assert.equal(payloadAfter.result.next, "w7s gecko make gecko-binary");
    } finally {
      ws.cleanup();
    }
  });

  it("reports behind when the stamp fingerprint disagrees", async () => {
    const ws = createWorkspace();
    try {
      const make = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout);
      const paths = resolveWorkspace(ws.dir);
      stampArtifact(
        "gecko-source",
        ws.dir,
        paths.geckoSource,
        "000000000000",
        ws.ports.clock.now().toISOString(),
      );

      ws.ports.output.reset();
      process.exitCode = undefined;
      const status = await runProgram(["gecko", "status", "--json"], ws.ports);
      assert.equal(status.exitCode, 0, status.stdout);
      const payload = JSON.parse(status.stdout) as {
        result: { artifacts: Array<{ name: string; status: string }> };
      };
      const source = payload.result.artifacts.find((a) => a.name === "gecko-source");
      assert.equal(source?.status, "behind");
    } finally {
      ws.cleanup();
    }
  });

  it("human status table includes next command for every currency combination", async () => {
    const ws = createWorkspace();
    try {
      const missing = await runProgram(["gecko", "status"], ws.ports);
      assert.equal(missing.exitCode, 0, missing.stdout);
      assert.match(missing.stdout, /gecko-source/);
      assert.match(missing.stdout, /missing/);
      assert.match(missing.stdout, /next ->/);

      ws.ports.output.reset();
      process.exitCode = undefined;
      await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);

      ws.ports.output.reset();
      process.exitCode = undefined;
      const current = await runProgram(["gecko", "status"], ws.ports);
      assert.equal(current.exitCode, 0, current.stdout);
      assert.match(current.stdout, /current/);
      assert.match(current.stdout, /next ->/);

      // Toolchain missing combination
      ws.ports.engine.availableFlag = false;
      ws.ports.output.reset();
      process.exitCode = undefined;
      const noEngine = await runProgram(["gecko", "status", "--json"], ws.ports);
      const payload = JSON.parse(noEngine.stdout) as {
        result: { artifacts: Array<{ name: string; status: string }>; next: string };
      };
      const toolchain = payload.result.artifacts.find((a) => a.name === "toolchain");
      assert.equal(toolchain?.status, "missing");
      assert.equal(payload.result.next, "w7s gecko toolchain --pull");
    } finally {
      ws.cleanup();
    }
  });
});
