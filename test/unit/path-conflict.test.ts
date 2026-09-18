import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { expandModifications } from "../../src/modifications/expand.js";
import { W7sError } from "../../src/errors/index.js";
import type { Modification } from "../../src/manifest/types.js";

describe("path conflict", () => {
  it("rejects two modifications claiming one destination", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-conflict-"));
    try {
      mkdirSync(join(root, "a"), { recursive: true });
      mkdirSync(join(root, "b"), { recursive: true });
      writeFileSync(join(root, "a", "Document.cpp"), "a\n");
      writeFileSync(join(root, "b", "Document.cpp"), "b\n");

      const modifications: Modification[] = [
        {
          name: "first",
          description: "first",
          type: "files",
          files: [{ localPath: "./a/Document.cpp", geckoPath: "dom/base/Document.cpp" }],
          replacesGeckoSource: true,
        },
        {
          name: "second",
          description: "second",
          type: "directory",
          localPath: "./b",
          geckoPath: "dom/base",
          replacesGeckoSource: true,
        },
      ];

      assert.throws(
        () => expandModifications(modifications, root),
        (err: unknown) => {
          if (!(err instanceof W7sError) || err.phase !== "Declaration") {
            return false;
          }
          assert.match(err.message, /dom\/base\/Document\.cpp/);
          const detail = Array.isArray(err.detail) ? err.detail.join(" ") : String(err.detail);
          assert.match(detail, /first/);
          assert.match(detail, /second/);
          return true;
        },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
