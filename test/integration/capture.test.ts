import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createWorkspace, runProgram } from "../helpers/cli.js";
import { expandModifications, resolveInTree } from "../../src/modifications/expand.js";
import { applyModifications } from "../../src/modifications/apply.js";
import { loadManifest } from "../../src/manifest/load.js";
import { validateManifest } from "../../src/manifest/schema.js";
import { buffersEqual, normalizeToLf } from "../../src/modifications/compare.js";

describe("capture (integration)", () => {
  it("edit, capture, assert byte equality of declared and current", async () => {
    const ws = createWorkspace();
    try {
      const make = await runProgram(["gecko", "make", "gecko-source", "--json"], ws.ports);
      assert.equal(make.exitCode, 0, make.stdout + make.stderr);

      const tree = ws.paths.geckoSource;
      const edited = "// captured Document.cpp\nint x = 42;\n";
      writeFileSync(resolveInTree(tree, "dom/base/Document.cpp"), edited);

      const capture = await runProgram(
        ["gecko", "capture", "--file", "dom/base/Document.cpp", "--into", "install", "--json"],
        ws.ports,
      );
      assert.equal(capture.exitCode, 0, capture.stdout + capture.stderr);

      const declaredPath = join(ws.dir, "mods", "install", "dom", "base", "Document.cpp");
      const declared = normalizeToLf(readFileSync(declaredPath));
      const current = normalizeToLf(readFileSync(resolveInTree(tree, "dom/base/Document.cpp")));
      assert.ok(buffersEqual(declared, current));
      assert.equal(declared.toString("utf8"), edited);

      const raw = loadManifest(join(ws.dir, "w7s.json"));
      validateManifest(raw);
      const files = expandModifications(raw.modifications, ws.dir);
      const apply = applyModifications({
        files,
        workingTreeRoot: tree,
        pristineRoot: ws.pristine,
        readPristine: (geckoPath) => {
          const path = join(ws.pristine, ...geckoPath.split("/"));
          return existsSync(path) ? readFileSync(path) : null;
        },
        existsInPristine: (geckoPath) => existsSync(join(ws.pristine, ...geckoPath.split("/"))),
      });
      assert.equal(apply.filesWritten, 0);
    } finally {
      ws.cleanup();
    }
  });
});
