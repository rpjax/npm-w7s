import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";

describe("provider e2e", () => {
  it("exposes the four commands dockup calls, with JSON fields", async () => {
    const ws = createWorkspace();
    try {
      const make = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout + make.stderr);
      const makePayload = JSON.parse(make.stdout) as { ok: boolean; fingerprint: string };
      assert.equal(makePayload.ok, true);
      assert.ok(makePayload.fingerprint);

      ws.ports.output.reset();
      process.exitCode = undefined;
      const paths = await runProgram(
        ["gecko", "paths", "--artifact", "sidecar-package", "--json"],
        ws.ports,
      );
      assert.equal(paths.exitCode, 0, paths.stdout);
      const pathsPayload = JSON.parse(paths.stdout) as {
        path: string;
        sizeBytes: number;
        sha256: string;
        fingerprint: string;
        w7sVersion: string;
        target: string;
      };
      assert.ok(pathsPayload.path);
      assert.equal(typeof pathsPayload.sizeBytes, "number");
      assert.ok(pathsPayload.sha256);
      assert.ok(pathsPayload.fingerprint);
      assert.ok(pathsPayload.w7sVersion);
      assert.equal(pathsPayload.target, "linux-x64");

      ws.ports.output.reset();
      process.exitCode = undefined;
      const fp = await runProgram(["gecko", "fingerprint"], ws.ports);
      assert.equal(fp.exitCode, 0);
      assert.match(fp.stdout.trim(), /^[a-f0-9]{12}$/);

      // L5: the tool builds no image — FakeEngine fails the test if build is received.
      assert.ok(
        !ws.ports.engine.invocations.some((argv) => argv[0] === "build" || argv.includes("build")),
        "engine must never receive build",
      );
    } finally {
      ws.cleanup();
    }
  });

  it("FakeEngine fails the test if it receives build (L5)", async () => {
    const ws = createWorkspace();
    try {
      await assert.rejects(
        async () => ws.ports.engine.run(["build", "-t", "evil", "."]),
        /build invocation|L5|never build/i,
      );
    } finally {
      ws.cleanup();
    }
  });
});
