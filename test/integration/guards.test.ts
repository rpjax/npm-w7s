import assert from "node:assert/strict";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { resolveWorkspace } from "../../src/workspace/paths.js";

describe("guards integration", () => {
  it("reset refuses a dirty tree and lists the files", async () => {
    const ws = createWorkspace();
    try {
      const make = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout);

      const paths = resolveWorkspace(ws.dir);
      writeFileSync(join(paths.geckoSource, "dom", "base", "Document.cpp"), "// dirty hand edit\n");

      ws.ports.output.reset();
      process.exitCode = undefined;
      const result = await runProgram(["gecko", "reset", "gecko-source", "--json"], ws.ports);
      assert.notEqual(result.exitCode, 0);
      const payload = JSON.parse(result.stdout) as {
        ok: boolean;
        phase: string;
        detail: string | string[];
        exitCode: number;
      };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "WorkingTree");
      assert.equal(payload.exitCode, 3);
      const detail = Array.isArray(payload.detail) ? payload.detail.join("\n") : String(payload.detail);
      assert.match(detail, /Document\.cpp/);
    } finally {
      ws.cleanup();
    }
  });

  it("reset --force -y discards the dirty tree", async () => {
    const ws = createWorkspace();
    try {
      await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      const paths = resolveWorkspace(ws.dir);
      writeFileSync(join(paths.geckoSource, "dom", "base", "Document.cpp"), "// dirty\n");
      ws.ports.output.reset();
      process.exitCode = undefined;
      const result = await runProgram(
        ["gecko", "reset", "gecko-source", "--force", "-y", "--json"],
        ws.ports,
      );
      assert.equal(result.exitCode, 0, result.stdout);
      const payload = JSON.parse(result.stdout) as { ok: boolean };
      assert.equal(payload.ok, true);
      void cpSync;
      void mkdirSync;
    } finally {
      ws.cleanup();
    }
  });
});
