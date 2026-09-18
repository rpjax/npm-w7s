import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { resolveInTree } from "../../src/modifications/expand.js";
import { EXIT } from "../../src/cli/exit-codes.js";

describe("guards (integration)", () => {
  it("reset refuses a dirty tree and prints the exact dirty list", async () => {
    const ws = createWorkspace();
    try {
      const make = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout);

      const tree = join(ws.dir, ".w7s", "volumes", "gecko-source");
      writeFileSync(resolveInTree(tree, "dom/base/Document.cpp"), "// dirty hand edit\n");

      const reset = await runProgram(["gecko", "reset", "gecko-source", "--json"], ws.ports);
      assert.equal(reset.exitCode, EXIT.WorkingTree);
      const payload = JSON.parse(reset.stdout) as {
        ok: boolean;
        phase: string;
        detail: string[] | string;
        exitCode: number;
      };
      assert.equal(payload.ok, false);
      assert.equal(payload.phase, "WorkingTree");
      assert.equal(payload.exitCode, EXIT.WorkingTree);

      const detail = Array.isArray(payload.detail) ? payload.detail : [payload.detail];
      assert.deepEqual(detail, ["dom/base/Document.cpp"]);
    } finally {
      ws.cleanup();
    }
  });

  it("reset --force -y discards dirty files", async () => {
    const ws = createWorkspace();
    try {
      const make = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout);

      const tree = join(ws.dir, ".w7s", "volumes", "gecko-source");
      writeFileSync(resolveInTree(tree, "dom/base/Document.cpp"), "// dirty\n");

      const reset = await runProgram(
        ["gecko", "reset", "gecko-source", "--force", "-y", "--json"],
        ws.ports,
      );
      assert.equal(reset.exitCode, 0, reset.stdout + reset.stderr);
      const payload = JSON.parse(reset.stdout) as { ok: boolean; result: { discarded: string[] } };
      assert.equal(payload.ok, true);
      assert.deepEqual(payload.result.discarded, ["dom/base/Document.cpp"]);
    } finally {
      ws.cleanup();
    }
  });
});
