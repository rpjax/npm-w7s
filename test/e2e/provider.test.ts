import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspace, runProgram, packageVersion } from "../helpers/cli.js";

describe("provider e2e", () => {
  it("exposes the four commands dockup calls, with exit codes and JSON fields", async () => {
    const ws = createWorkspace();
    try {
      // 1. make sidecar-package
      const make = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout + make.stderr);
      const makePayload = JSON.parse(make.stdout) as {
        ok: boolean;
        fingerprint: string;
        result: { artifact: string };
      };
      assert.equal(makePayload.ok, true);
      assert.equal(makePayload.result.artifact, "sidecar-package");
      assert.match(makePayload.fingerprint, /^[a-f0-9]{12}$/);

      // 2. paths --artifact sidecar-package (human)
      ws.ports.output.reset();
      process.exitCode = undefined;
      const pathsHuman = await runProgram(
        ["gecko", "paths", "--artifact", "sidecar-package"],
        ws.ports,
      );
      assert.equal(pathsHuman.exitCode, 0, pathsHuman.stdout);
      assert.match(pathsHuman.stdout, /sidecar-package/);
      assert.match(pathsHuman.stdout, /linux-x64|host|container/i);

      // 3. paths --artifact sidecar-package --json
      ws.ports.output.reset();
      process.exitCode = undefined;
      const pathsJson = await runProgram(
        ["gecko", "paths", "--artifact", "sidecar-package", "--json"],
        ws.ports,
      );
      assert.equal(pathsJson.exitCode, 0, pathsJson.stdout);
      const pathsPayload = JSON.parse(pathsJson.stdout) as {
        ok: boolean;
        path: string;
        sizeBytes: number;
        sha256: string;
        fingerprint: string;
        w7sVersion: string;
        target: string;
      };
      assert.equal(pathsPayload.ok, true);
      assert.ok(pathsPayload.path.includes("linux-x64") || pathsPayload.path.includes("dist"));
      assert.equal(typeof pathsPayload.sizeBytes, "number");
      assert.ok(pathsPayload.sizeBytes > 0);
      assert.match(pathsPayload.sha256, /^[a-f0-9]{64}$/);
      assert.equal(pathsPayload.fingerprint, makePayload.fingerprint);
      assert.equal(pathsPayload.w7sVersion, packageVersion);
      assert.equal(pathsPayload.target, "linux-x64");

      // 4. fingerprint
      ws.ports.output.reset();
      process.exitCode = undefined;
      const fp = await runProgram(["gecko", "fingerprint"], ws.ports);
      assert.equal(fp.exitCode, 0, fp.stdout);
      assert.equal(fp.stdout.trim(), makePayload.fingerprint);

      // L5: never assert by calling engine.run(['build',...]) — that assert.fails the suite.
      // Assert instead that recorded invocations never included build.
      assert.ok(
        !ws.ports.engine.invocations.some((argv) => argv[0] === "build" || argv.includes("build")),
        "FakeEngine must never receive a build invocation",
      );
    } finally {
      ws.cleanup();
    }
  });
});
