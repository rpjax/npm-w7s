import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram, packageVersion } from "../helpers/cli.js";
import { writeSidecarPackage, assertPackageLayout } from "../../src/package/sidecar.js";
import { resolveWorkspace } from "../../src/workspace/paths.js";
import { W7sError } from "../../src/errors/index.js";

describe("package (integration)", () => {
  it("writes only firefox.tar.gz and build.json", async () => {
    const ws = createWorkspace();
    try {
      const paths = resolveWorkspace(ws.dir);
      const result = await writeSidecarPackage({
        paths,
        fingerprint: "abc123def456",
        firefoxVersion: "153.2.0",
        timestamp: "2026-09-18T00:00:00.000Z",
      });
      assert.deepEqual(readdirSync(paths.sidecarPackage).sort(), ["build.json", "firefox.tar.gz"]);
      assertPackageLayout(paths.sidecarPackage);
      const build = JSON.parse(readFileSync(join(paths.sidecarPackage, "build.json"), "utf8")) as {
        fingerprint: string;
        w7sVersion: string;
        firefoxVersion: string;
        target: string;
        hashes: { "firefox.tar.gz": string };
      };
      assert.equal(build.fingerprint, "abc123def456");
      assert.equal(build.w7sVersion, packageVersion);
      assert.equal(build.firefoxVersion, "153.2.0");
      assert.equal(build.target, "linux-x64");
      assert.equal(build.hashes["firefox.tar.gz"], result.sha256);
      assert.ok(existsSync(join(paths.sidecarPackage, "firefox.tar.gz")));
      assert.ok(result.sizeBytes > 0);
    } finally {
      ws.cleanup();
    }
  });

  it("refuses when a required archive source is missing", async () => {
    const ws = createWorkspace();
    try {
      const paths = resolveWorkspace(ws.dir);
      await assert.rejects(
        () =>
          writeSidecarPackage({
            paths,
            fingerprint: "x",
            firefoxVersion: "153",
            timestamp: "t",
            firefoxArchiveSource: join(ws.dir, "missing.tar.gz"),
          }),
        (err: unknown) => err instanceof W7sError && err.phase === "Execution",
      );
      assert.ok(!existsSync(join(paths.sidecarPackage, "build.json")));
    } finally {
      ws.cleanup();
    }
  });

  it("make sidecar-package produces the package layout via CLI", async () => {
    const ws = createWorkspace();
    try {
      const result = await runProgram(["gecko", "make", "sidecar-package", "--json"], ws.ports);
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      const paths = resolveWorkspace(ws.dir);
      assertPackageLayout(paths.sidecarPackage);
      const build = JSON.parse(readFileSync(join(paths.sidecarPackage, "build.json"), "utf8")) as {
        fingerprint: string;
        hashes: { "firefox.tar.gz": string };
      };
      assert.ok(build.fingerprint);
      assert.ok(build.hashes["firefox.tar.gz"]);
      assert.ok(!ws.ports.engine.invocations.some((a) => a[0] === "build" || a.includes("build")));
    } finally {
      ws.cleanup();
    }
  });
});
