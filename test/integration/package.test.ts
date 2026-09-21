import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram, packageVersion } from "../helpers/cli.js";
import { writeSidecarPackage, assertPackageLayout } from "../../src/package/sidecar.js";
import { W7sError } from "../../src/errors/index.js";
import { copyPristineTiny } from "../fixtures/pristine-tiny.js";

describe("package (integration)", () => {
  it("writes only firefox.tar.gz and build.json from the mach archive", async () => {
    const ws = createWorkspace();
    try {
      const paths = ws.paths;
      mkdirSync(paths.geckoSource, { recursive: true });
      copyPristineTiny(paths.geckoSource);
      mkdirSync(join(paths.geckoBinary, "dist"), { recursive: true });
      writeFileSync(
        join(paths.geckoBinary, "dist", "firefox-153.2.0.en-US.linux-x86_64.tar.gz"),
        "packaged-bytes\n",
        "utf8",
      );

      const result = await writeSidecarPackage({
        paths,
        fingerprint: "abc123def456",
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

  it("refuses when mach package left no archive", async () => {
    const ws = createWorkspace();
    try {
      const paths = ws.paths;
      mkdirSync(paths.geckoSource, { recursive: true });
      copyPristineTiny(paths.geckoSource);
      mkdirSync(paths.geckoBinary, { recursive: true });
      await assert.rejects(
        () =>
          writeSidecarPackage({
            paths,
            fingerprint: "x",
            timestamp: "t",
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
      assertPackageLayout(ws.paths.sidecarPackage);
      const build = JSON.parse(
        readFileSync(join(ws.paths.sidecarPackage, "build.json"), "utf8"),
      ) as {
        fingerprint: string;
        hashes: { "firefox.tar.gz": string };
        firefoxVersion: string;
      };
      assert.ok(build.fingerprint);
      assert.ok(build.hashes["firefox.tar.gz"]);
      assert.equal(build.firefoxVersion, "153.2.0");
      // docker CLI build must not go through run(); toolchain uses engine.build().
      assert.ok(!ws.ports.engine.invocations.some((a) => a[0] === "build"));
      assert.ok(ws.ports.engine.builds.length >= 1);
    } finally {
      ws.cleanup();
    }
  });
});
