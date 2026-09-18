import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { copyPristineTiny } from "../fixtures/pristine-tiny.js";
import { expandModifications } from "../../src/modifications/expand.js";
import { verifyReplacesDeclarations } from "../../src/modifications/compare.js";
import { W7sError } from "../../src/errors/index.js";
import type { Modification } from "../../src/manifest/types.js";
import { existsSync } from "node:fs";
import { resolveInTree } from "../../src/modifications/expand.js";

describe("replacesGeckoSource declaration", () => {
  it("rejects replacesGeckoSource:true when the path is absent from pristine", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-replaces-"));
    try {
      const pristine = join(root, "pristine");
      copyPristineTiny(pristine);
      mkdirSync(join(root, "mods"), { recursive: true });
      writeFileSync(join(root, "mods", "only-ours.cpp"), "int ours;\n");

      const modifications: Modification[] = [
        {
          name: "ours",
          description: "ours alone",
          type: "files",
          files: [{ localPath: "./mods/only-ours.cpp", geckoPath: "only-ours.cpp" }],
          replacesGeckoSource: true,
        },
      ];
      const files = expandModifications(modifications, root);
      assert.throws(
        () =>
          verifyReplacesDeclarations(files, (geckoPath) =>
            existsSync(resolveInTree(pristine, geckoPath)),
          ),
        (err: unknown) =>
          err instanceof W7sError &&
          err.phase === "Declaration" &&
          /replacesGeckoSource: true/.test(err.message),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects replacesGeckoSource:false when the path exists in pristine", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-replaces2-"));
    try {
      const pristine = join(root, "pristine");
      copyPristineTiny(pristine);
      mkdirSync(join(root, "mods", "dom", "base"), { recursive: true });
      writeFileSync(join(root, "mods", "dom", "base", "Document.cpp"), "// ours\n");

      const modifications: Modification[] = [
        {
          name: "doc",
          description: "document",
          type: "files",
          files: [
            {
              localPath: "./mods/dom/base/Document.cpp",
              geckoPath: "dom/base/Document.cpp",
            },
          ],
          replacesGeckoSource: false,
        },
      ];
      const files = expandModifications(modifications, root);
      assert.throws(
        () =>
          verifyReplacesDeclarations(files, (geckoPath) =>
            existsSync(resolveInTree(pristine, geckoPath)),
          ),
        (err: unknown) =>
          err instanceof W7sError &&
          err.phase === "Declaration" &&
          /replacesGeckoSource: false/.test(err.message),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts both directions when they agree with pristine", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-replaces3-"));
    try {
      const pristine = join(root, "pristine");
      copyPristineTiny(pristine);
      mkdirSync(join(root, "mods", "dom", "base"), { recursive: true });
      writeFileSync(join(root, "mods", "dom", "base", "Document.cpp"), "// ours\n");
      writeFileSync(join(root, "mods", "only-ours.cpp"), "int ours;\n");

      const modifications: Modification[] = [
        {
          name: "replace",
          description: "replace",
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
          name: "add",
          description: "add",
          type: "files",
          files: [{ localPath: "./mods/only-ours.cpp", geckoPath: "only-ours.cpp" }],
          replacesGeckoSource: false,
        },
      ];
      const files = expandModifications(modifications, root);
      assert.doesNotThrow(() =>
        verifyReplacesDeclarations(files, (geckoPath) =>
          existsSync(resolveInTree(pristine, geckoPath)),
        ),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
