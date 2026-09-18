import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { expandModifications } from "../../src/modifications/expand.js";
import type { Modification } from "../../src/manifest/types.js";

describe("modification files expansion", () => {
  it("expands an explicit file list", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-mod-files-"));
    try {
      mkdirSync(join(root, "mods", "runtime"), { recursive: true });
      writeFileSync(join(root, "mods", "runtime", "speculum-runtime.cpp"), "int x;\n");

      const modifications: Modification[] = [
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

      const expanded = expandModifications(modifications, root);
      assert.equal(expanded.length, 1);
      assert.equal(expanded[0]!.geckoPath, "speculum-runtime.cpp");
      assert.equal(expanded[0]!.modificationName, "runtime");
      assert.equal(expanded[0]!.replacesGeckoSource, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows differing local and Gecko layouts", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-mod-files2-"));
    try {
      mkdirSync(join(root, "local", "src"), { recursive: true });
      writeFileSync(join(root, "local", "src", "Doc.cpp"), "// ours\n");

      const modifications: Modification[] = [
        {
          name: "remap",
          description: "remap",
          type: "files",
          files: [
            {
              localPath: "./local/src/Doc.cpp",
              geckoPath: "dom/base/Document.cpp",
            },
          ],
          replacesGeckoSource: true,
        },
      ];

      const expanded = expandModifications(modifications, root);
      assert.equal(expanded.length, 1);
      assert.equal(expanded[0]!.geckoPath, "dom/base/Document.cpp");
      assert.ok(expanded[0]!.localPath.endsWith(join("local", "src", "Doc.cpp")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
