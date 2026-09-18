import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram, packageVersion } from "../helpers/cli.js";
import { resolveWorkspace } from "../../src/workspace/paths.js";

describe("cli integration", () => {
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

  it("honours --manifest precedence", async () => {
    const ws = createWorkspace();
    try {
      const alt = join(ws.dir, "alt.w7s.json");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        alt,
        JSON.stringify({
          modifications: [
            {
              name: "only",
              description: "only",
              type: "files",
              files: [
                { localPath: "./mods/runtime/speculum-runtime.cpp", geckoPath: "only.cpp" },
              ],
              replacesGeckoSource: false,
            },
          ],
          tests: [],
        }),
      );
      const result = await runProgram(
        ["gecko", "validate", "--manifest", alt, "--json"],
        ws.ports,
      );
      assert.equal(result.exitCode, 0, result.stdout);
      const payload = JSON.parse(result.stdout) as { result: { modifications: number } };
      assert.equal(payload.result.modifications, 1);
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
      // dry-run may create empty dir placeholder but must not stamp currency / write mods
      assert.ok(!existsSync(join(paths.stateDir, "state.json")));
    } finally {
      ws.cleanup();
    }
  });

  it("prints version including toolchain tag", async () => {
    const ws = createWorkspace();
    try {
      const result = await runProgram(["--version"], ws.ports);
      assert.match(result.stdout, new RegExp(packageVersion.replace(/\./g, "\\.")));
      assert.match(result.stdout, /w7s-toolchain/);
    } finally {
      ws.cleanup();
    }
  });
});
