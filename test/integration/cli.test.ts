import assert from "node:assert/strict";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram, runW7s, packageVersion } from "../helpers/cli.js";
import { resolveWorkspace } from "../../src/workspace/paths.js";
import { getVersion, TOOLCHAIN_IMAGE_TAG } from "../../src/version.js";

describe("cli (integration)", () => {
  it("parses global --json before the subcommand", async () => {
    const ws = createWorkspace();
    try {
      const result = await runProgram(["--json", "gecko", "validate"], ws.ports);
      assert.equal(result.exitCode, 0, result.stdout);
      const payload = JSON.parse(result.stdout) as { ok: boolean };
      assert.equal(payload.ok, true);
    } finally {
      ws.cleanup();
    }
  });

  it("honours --manifest precedence over discovery", async () => {
    const ws = createWorkspace();
    try {
      const sub = join(ws.dir, "manifests");
      mkdirSync(sub, { recursive: true });
      const altPath = join(sub, "alt.w7s.json");
      writeFileSync(
        altPath,
        JSON.stringify({
          modifications: [
            {
              name: "only",
              description: "only",
              type: "files",
              files: [{ localPath: "./mods/runtime/speculum-runtime.cpp", geckoPath: "only.cpp" }],
              replacesGeckoSource: false,
            },
          ],
          tests: [],
        }),
      );

      const result = await runProgram(
        ["gecko", "validate", "--manifest", altPath, "--json"],
        ws.ports,
      );
      assert.equal(result.exitCode, 0, result.stdout);
      const payload = JSON.parse(result.stdout) as { result: { modifications: number } };
      assert.equal(payload.result.modifications, 1);

      // Default discovery still sees the original two-modification w7s.json
      const discovered = await runProgram(["gecko", "validate", "--json"], ws.ports);
      assert.equal(discovered.exitCode, 0, discovered.stdout);
      assert.equal(
        (JSON.parse(discovered.stdout) as { result: { modifications: number } }).result
          .modifications,
        2,
      );
    } finally {
      ws.cleanup();
    }
  });

  it("--dry-run writes nothing for make gecko-source", async () => {
    const ws = createWorkspace();
    try {
      const result = await runProgram(
        ["gecko", "make", "gecko-source", "--dry-run", "--json"],
        ws.ports,
      );
      assert.equal(result.exitCode, 0, result.stdout);
      const paths = resolveWorkspace(ws.dir);
      assert.ok(!existsSync(join(paths.stateDir, "state.json")));
      // dry-run may mkdir gecko-source but must not apply modifications
      assert.ok(!existsSync(join(paths.geckoSource, "speculum-runtime.cpp")));
      assert.ok(!existsSync(join(paths.geckoSource, "dom", "base", "Document.cpp")));
    } finally {
      ws.cleanup();
    }
  });

  it("packageVersion matches getVersion and --version names the toolchain", () => {
    assert.equal(packageVersion, getVersion());
    // Commander writes --version to process.stdout, not FakeOutput — spawn the built CLI.
    const result = runW7s(["--version"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(packageVersion.replace(/\./g, "\\.")));
    assert.match(result.stdout, /w7s-toolchain/);
    assert.match(
      result.stdout,
      new RegExp(TOOLCHAIN_IMAGE_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
});
