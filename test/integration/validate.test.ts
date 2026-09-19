import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { writeJson } from "../helpers/fakes.js";
import { EXIT } from "../../src/cli/exit-codes.js";

describe("validate (integration)", () => {
  it("accepts the default workspace manifest", async () => {
    const ws = createWorkspace();
    try {
      const result = await runProgram(["gecko", "validate", "--json"], ws.ports);
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      const payload = JSON.parse(result.stdout) as {
        ok: boolean;
        result: { modifications: number };
      };
      assert.equal(payload.ok, true);
      assert.ok(payload.result.modifications >= 1);
    } finally {
      ws.cleanup();
    }
  });

  it("fails on schema failures", async () => {
    const ws = createWorkspace();
    try {
      writeJson(join(ws.dir, "w7s.json"), { modifications: [], extra: true });
      const result = await runProgram(["gecko", "validate", "--json"], ws.ports);
      assert.equal(result.exitCode, EXIT.Cli);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "Manifest");
    } finally {
      ws.cleanup();
    }
  });

  it("fails on path conflicts between modifications", async () => {
    const ws = createWorkspace({
      modifications: [
        {
          name: "a",
          description: "a",
          type: "files",
          files: [
            {
              localPath: "./mods/install/dom/base/Document.cpp",
              geckoPath: "dom/base/Document.cpp",
            },
          ],
          replacesGeckoSource: true,
        },
        {
          name: "b",
          description: "b",
          type: "directory",
          localPath: "./mods/install",
          geckoPath: ".",
          replacesGeckoSource: true,
        },
      ],
    });
    try {
      const result = await runProgram(["gecko", "validate", "--json"], ws.ports);
      assert.equal(result.exitCode, EXIT.Declaration);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string; message: string };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "Declaration");
      assert.match(payload.message, /claim/);
    } finally {
      ws.cleanup();
    }
  });

  it("fails on contradicted replacesGeckoSource declarations", async () => {
    const ws = createWorkspace({
      modifications: [
        {
          name: "runtime",
          description: "runtime",
          type: "files",
          files: [
            {
              localPath: "./mods/runtime/speculum-runtime.cpp",
              geckoPath: "speculum-runtime.cpp",
            },
          ],
          replacesGeckoSource: true,
        },
      ],
    });
    try {
      // Materialize the tree so validate can ask git about pristine paths.
      await ws.ports.git.text(
        ["clone", "--no-checkout", ws.manifest.gecko.repository, ws.paths.geckoSource],
        ".",
      );
      await ws.ports.git.text(
        ["checkout", "--detach", ws.manifest.gecko.commit],
        ws.paths.geckoSource,
      );

      const result = await runProgram(["gecko", "validate", "--json"], ws.ports);
      assert.equal(result.exitCode, EXIT.Declaration);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "Declaration");
    } finally {
      ws.cleanup();
    }
  });

  it("fails when .gitignore omits out/ or .w7s/", async () => {
    const ws = createWorkspace({ gitignore: false });
    try {
      writeFileSync(join(ws.dir, ".gitignore"), "node_modules/\n");
      const result = await runProgram(["gecko", "validate", "--json"], ws.ports);
      assert.equal(result.exitCode, EXIT.Cli);
      const payload = JSON.parse(result.stdout) as { ok: boolean; phase: string; message: string };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "Manifest");
      assert.match(payload.message, /gitignore|ignored|out\//i);
    } finally {
      ws.cleanup();
    }
  });
});
