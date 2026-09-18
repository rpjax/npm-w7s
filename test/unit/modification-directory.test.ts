import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { expandModifications } from "../../src/modifications/expand.js";
import type { Modification } from "../../src/manifest/types.js";

describe("modification directory expansion", () => {
  it("expands a directory entry into destination geckoPaths", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-mod-dir-"));
    try {
      mkdirSync(join(root, "mods", "install", "dom", "base"), { recursive: true });
      writeFileSync(join(root, "mods", "install", "dom", "base", "Document.cpp"), "x\n");
      writeFileSync(join(root, "mods", "install", "moz.build"), "DIRS=[]\n");

      const modifications: Modification[] = [
        {
          name: "install",
          description: "install points",
          type: "directory",
          localPath: "./mods/install",
          geckoPath: ".",
          replacesGeckoSource: true,
        },
      ];

      const expanded = expandModifications(modifications, root);
      const paths = expanded.map((f) => f.geckoPath).sort();
      assert.deepEqual(paths, ["dom/base/Document.cpp", "moz.build"]);
      for (const file of expanded) {
        assert.equal(file.modificationName, "install");
        assert.equal(file.replacesGeckoSource, true);
        assert.ok(file.localPath.includes("mods"));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("joins a non-root geckoPath prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-mod-dir2-"));
    try {
      mkdirSync(join(root, "mods", "deep"), { recursive: true });
      writeFileSync(join(root, "mods", "deep", "deep.txt"), "deep\n");

      const modifications: Modification[] = [
        {
          name: "deep",
          description: "deep",
          type: "directory",
          localPath: "./mods/deep",
          geckoPath: "a/b/c/d",
          replacesGeckoSource: true,
        },
      ];

      const expanded = expandModifications(modifications, root);
      assert.equal(expanded.length, 1);
      assert.equal(expanded[0]!.geckoPath, "a/b/c/d/deep.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
