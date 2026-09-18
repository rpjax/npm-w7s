import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { copyPristineTiny } from "../fixtures/pristine-tiny.js";
import { expandModifications, resolveInTree } from "../../src/modifications/expand.js";
import { compareFile } from "../../src/modifications/compare.js";
import type { Modification } from "../../src/manifest/types.js";

describe("comparison outcomes", () => {
  function setup(): {
    root: string;
    pristine: string;
    tree: string;
    file: ReturnType<typeof expandModifications>[0];
    cleanup(): void;
  } {
    const root = mkdtempSync(join(tmpdir(), "w7s-compare-"));
    const pristine = join(root, "pristine");
    const tree = join(root, "tree");
    copyPristineTiny(pristine);
    copyPristineTiny(tree);
    mkdirSync(join(root, "mods", "dom", "base"), { recursive: true });
    writeFileSync(join(root, "mods", "dom", "base", "Document.cpp"), "// declared Document.cpp\nint x = 2;\n");

    const modifications: Modification[] = [
      {
        name: "doc",
        description: "doc",
        type: "files",
        files: [
          {
            localPath: "./mods/dom/base/Document.cpp",
            geckoPath: "dom/base/Document.cpp",
          },
        ],
        replacesGeckoSource: true,
      },
    ];
    const [file] = expandModifications(modifications, root);
    assert.ok(file);
    return {
      root,
      pristine,
      tree,
      file,
      cleanup() {
        rmSync(root, { recursive: true, force: true });
      },
    };
  }

  it("current == declared -> unchanged (nothing is written)", () => {
    const ctx = setup();
    try {
      writeFileSync(
        resolveInTree(ctx.tree, "dom/base/Document.cpp"),
        "// declared Document.cpp\nint x = 2;\n",
      );
      const result = compareFile(ctx.file, ctx.tree, ctx.pristine, undefined);
      assert.equal(result.outcome, "unchanged");
    } finally {
      ctx.cleanup();
    }
  });

  it("current == pristine -> write", () => {
    const ctx = setup();
    try {
      const result = compareFile(ctx.file, ctx.tree, ctx.pristine, undefined);
      assert.equal(result.outcome, "write");
      assert.equal(
        readFileSync(resolveInTree(ctx.tree, "dom/base/Document.cpp"), "utf8"),
        "// pristine Document.cpp\nint x = 1;\n",
      );
    } finally {
      ctx.cleanup();
    }
  });

  it("otherwise -> dirty", () => {
    const ctx = setup();
    try {
      writeFileSync(
        resolveInTree(ctx.tree, "dom/base/Document.cpp"),
        "// hand edit\nint x = 99;\n",
      );
      const result = compareFile(ctx.file, ctx.tree, ctx.pristine, undefined);
      assert.equal(result.outcome, "dirty");
    } finally {
      ctx.cleanup();
    }
  });
});
