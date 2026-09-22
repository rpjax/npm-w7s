import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { W7sError } from "../../src/errors/index.js";
import { isWindowsDockerBinary, resolveDockerBinary } from "../../src/engine/docker-cli.js";
import {
  scriptWithGeckoGitSafeDirectory,
  withGeckoGitSafeDirectory,
} from "../../src/toolchain/gecko-git-safe.js";

describe("gecko git safe.directory", () => {
  it("prefixes a mach command with both safe.directory markers", () => {
    const cmd = withGeckoGitSafeDirectory("./mach build");
    assert.match(cmd, /git config --global --add safe\.directory \/gecko-source/);
    assert.match(cmd, /git config --global --add safe\.directory '\*'/);
    assert.match(cmd, /&& \.\/mach build$/);
  });

  it("keeps set -euo pipefail before the markers in a multi-line script", () => {
    const cmd = scriptWithGeckoGitSafeDirectory([
      "set -euo pipefail",
      "cd /gecko-source && git rev-parse HEAD",
    ]);
    assert.ok(cmd.startsWith("set -euo pipefail && git config"));
    assert.match(cmd, /safe\.directory \/gecko-source/);
    assert.match(cmd, /cd \/gecko-source && git rev-parse HEAD$/);
  });
});

describe("resolveDockerBinary", () => {
  it("returns docker on win32 without inspecting PATH", () => {
    assert.equal(
      resolveDockerBinary({
        platform: "win32",
        pathEnv: "C:\\Windows\\System32",
        isExecutable: () => true,
        resolveRealPath: (p) => p,
      }),
      "docker",
    );
  });

  it("prefers a Linux docker over docker.exe on the same PATH", () => {
    const chosen = resolveDockerBinary({
      platform: "linux",
      pathEnv: "/mnt/c/Program Files/Docker/Docker/resources/bin:/usr/bin",
      isExecutable: (p) =>
        p === "/usr/bin/docker" ||
        p === "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe",
      resolveRealPath: (p) => p,
    });
    assert.equal(chosen, "/usr/bin/docker");
  });

  it("rejects PATH that only has docker.exe under WSL", () => {
    assert.throws(
      () =>
        resolveDockerBinary({
          platform: "linux",
          pathEnv: "/mnt/c/Program Files/Docker/Docker/resources/bin",
          isExecutable: (p) => p.endsWith("docker.exe"),
          resolveRealPath: (p) => p,
        }),
      (err: unknown) => {
        assert.ok(err instanceof W7sError);
        assert.equal(err.phase, "Toolchain");
        assert.match(err.message, /Windows client \(docker\.exe\)/);
        return true;
      },
    );
  });

  it("rejects a docker symlink that resolves to an .exe", () => {
    assert.throws(
      () =>
        resolveDockerBinary({
          platform: "linux",
          pathEnv: "/usr/bin",
          isExecutable: (p) => p === "/usr/bin/docker",
          resolveRealPath: () => "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe",
        }),
      (err: unknown) => err instanceof W7sError && err.phase === "Toolchain",
    );
  });

  it("classifies Windows Docker paths", () => {
    assert.equal(isWindowsDockerBinary("docker.exe"), true);
    assert.equal(
      isWindowsDockerBinary("/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"),
      true,
    );
    assert.equal(isWindowsDockerBinary("/usr/bin/docker"), false);
  });

  it("falls back to bare docker when PATH has nothing", () => {
    assert.equal(
      resolveDockerBinary({
        platform: "linux",
        pathEnv: "/empty",
        isExecutable: () => false,
        resolveRealPath: (p) => p,
      }),
      "docker",
    );
  });
});
