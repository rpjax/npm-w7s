import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  rmSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { copyPristineTiny } from "../fixtures/pristine-tiny.js";
import { expandModifications, resolveInTree } from "../../src/modifications/expand.js";
import { applyModifications } from "../../src/modifications/apply.js";
import { W7sError } from "../../src/errors/index.js";
import { exitCodeForPhase } from "../../src/cli/exit-codes.js";
import type { Modification } from "../../src/manifest/types.js";
import { FakeClock } from "../helpers/fakes.js";

describe("apply (integration)", () => {
  function workspace(): {
    root: string;
    pristine: string;
    tree: string;
    files: ReturnType<typeof expandModifications>;
    cleanup(): void;
  } {
    const root = mkdtempSync(join(tmpdir(), "w7s-apply-"));
    const pristine = join(root, "pristine");
    const tree = join(root, "tree");
    copyPristineTiny(pristine);
    cpSync(pristine, tree, { recursive: true });

    mkdirSync(join(root, "mods", "dom", "base"), { recursive: true });
    mkdirSync(join(root, "mods", "runtime"), { recursive: true });
    writeFileSync(
      join(root, "mods", "dom", "base", "Document.cpp"),
      "// our Document.cpp\nint x = 2;\n",
    );
    writeFileSync(
      join(root, "mods", "runtime", "speculum-runtime.cpp"),
      "int speculum_runtime(){return 0;}\n",
    );

    const modifications: Modification[] = [
      {
        name: "install",
        description: "install",
        type: "files",
        files: [
          {
            localPath: "./mods/dom/base/Document.cpp",
            geckoPath: "dom/base/Document.cpp",
          },
        ],
        replacesGeckoSource: true,
      },
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
        replacesGeckoSource: false,
      },
    ];

    return {
      root,
      pristine,
      tree,
      files: expandModifications(modifications, root),
      cleanup() {
        rmSync(root, { recursive: true, force: true });
      },
    };
  }

  it("applies declared content onto the pristine-tiny fixture", () => {
    const ctx = workspace();
    try {
      const result = applyModifications({
        files: ctx.files,
        workingTreeRoot: ctx.tree,
        pristineRoot: ctx.pristine,
      });
      assert.ok(result.filesWritten >= 1);
      assert.equal(
        readFileSync(resolveInTree(ctx.tree, "dom/base/Document.cpp"), "utf8"),
        "// our Document.cpp\nint x = 2;\n",
      );
      assert.equal(
        readFileSync(resolveInTree(ctx.tree, "speculum-runtime.cpp"), "utf8"),
        "int speculum_runtime(){return 0;}\n",
      );
    } finally {
      ctx.cleanup();
    }
  });

  it("second run writes nothing and preserves modification times", () => {
    const ctx = workspace();
    const clock = new FakeClock();
    try {
      applyModifications({
        files: ctx.files,
        workingTreeRoot: ctx.tree,
        pristineRoot: ctx.pristine,
      });

      const paths = ["dom/base/Document.cpp", "speculum-runtime.cpp"];
      const before = new Map(
        paths.map((p) => [p, statSync(resolveInTree(ctx.tree, p)).mtimeMs] as const),
      );

      clock.advance(60_000);

      const second = applyModifications({
        files: ctx.files,
        workingTreeRoot: ctx.tree,
        pristineRoot: ctx.pristine,
      });

      assert.equal(second.filesWritten, 0);
      assert.equal(second.filesUnchanged, paths.length);
      for (const p of paths) {
        assert.equal(statSync(resolveInTree(ctx.tree, p)).mtimeMs, before.get(p));
      }
    } finally {
      ctx.cleanup();
    }
  });

  it("a hand edit is detected as WorkingTree (exit 3)", () => {
    const ctx = workspace();
    try {
      applyModifications({
        files: ctx.files,
        workingTreeRoot: ctx.tree,
        pristineRoot: ctx.pristine,
      });
      writeFileSync(resolveInTree(ctx.tree, "dom/base/Document.cpp"), "// hand edit\n");

      assert.throws(
        () =>
          applyModifications({
            files: ctx.files,
            workingTreeRoot: ctx.tree,
            pristineRoot: ctx.pristine,
          }),
        (err: unknown) => {
          if (!(err instanceof W7sError)) {
            return false;
          }
          assert.equal(err.phase, "WorkingTree");
          assert.equal(exitCodeForPhase(err.phase), 3);
          const detail = Array.isArray(err.detail) ? err.detail : [String(err.detail)];
          assert.ok(detail.includes("dom/base/Document.cpp"));
          return true;
        },
      );
    } finally {
      ctx.cleanup();
    }
  });
});
