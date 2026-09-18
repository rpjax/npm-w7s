import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace } from "../helpers/cli.js";
import { resolveWorkspace } from "../../src/workspace/paths.js";
import { writeSidecarPackage, assertPackageLayout } from "../../src/package/sidecar.js";
import { W7sError } from "../../src/errors/index.js";
import { FakeClock } from "../helpers/fakes.js";
import { getVersion } from "../../src/version.js";

describe("package (integration)", () => {
  it("writes only firefox.tar.gz and build.json under dist/<target>/", async () => {
    const ws = createWorkspace();
    const clock = new FakeClock();
    try {
      const paths = resolveWorkspace(ws.dir);
      mkdirSync(paths.geckoBinary, { recursive: true });
      writeFileSync(join(paths.geckoBinary, "firefox.tar.gz"), "binary-bytes\n");

      const result = await writeSidecarPackage({
        paths,
        fingerprint: "abcdef123456",
        firefoxVersion: "153.2.0",
        timestamp: clock.now().toISOString(),
      });

      assert.ok(existsSync(join(paths.sidecarPackage, "firefox.tar.gz")));
      assert.ok(existsSync(join(paths.sidecarPackage, "build.json")));

      const entries = assertPackageLayout(paths.sidecarPackage);
      assert.deepEqual(entries.sort(), ["build.json", "firefox.tar.gz"]);

      // Every written path is under dist/<target>/
      for (const name of entries) {
        const full = join(paths.sidecarPackage, name);
        assert.ok(full.startsWith(paths.distDir));
      }
      assert.equal(readdirSync(paths.distDir).length, 1);

      const build = JSON.parse(readFileSync(join(paths.sidecarPackage, "build.json"), "utf8")) as {
        fingerprint: string;
        w7sVersion: string;
        target: string;
        hashes: { "firefox.tar.gz": string };
      };
      assert.equal(build.fingerprint, "abcdef123456");
      assert.equal(build.w7sVersion, getVersion());
      assert.equal(build.target, paths.target);
      assert.equal(build.hashes["firefox.tar.gz"], result.sha256);
      assert.ok(build.hashes["firefox.tar.gz"].length === 64);
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
            fingerprint: "abcdef123456",
            firefoxVersion: "153.2.0",
            timestamp: "2026-09-18T12:00:00.000Z",
            firefoxArchiveSource: join(ws.dir, "missing-firefox.tar.gz"),
          }),
        (err: unknown) =>
          err instanceof W7sError &&
          err.phase === "Execution" &&
          /missing/i.test(err.message),
      );
    } finally {
      ws.cleanup();
    }
  });
});
