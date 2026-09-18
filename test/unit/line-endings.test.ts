import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { normalizeToLf } from "../../src/modifications/compare.js";
import { expandModifications, resolveInTree } from "../../src/modifications/expand.js";
import { applyModifications } from "../../src/modifications/apply.js";
import type { Modification } from "../../src/manifest/types.js";

describe("line endings", () => {
  it("CRLF input produces LF declared content", () => {
    const crlf = Buffer.from("line1\r\nline2\r\n", "utf8");
    const normalized = normalizeToLf(crlf);
    assert.equal(normalized.toString("utf8"), "line1\nline2\n");
    assert.ok(!normalized.includes(0x0d));
  });

  it("an LF file is left untouched by normalization", () => {
    const lf = Buffer.from("line1\nline2\n", "utf8");
    const normalized = normalizeToLf(lf);
    assert.ok(normalized.equals(lf));
  });

  it("apply writes LF when the declared file was stored with CRLF", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-lf-"));
    try {
      mkdirSync(join(root, "mods", "media"), { recursive: true });
      writeFileSync(
        join(root, "mods", "media", "crlf.txt"),
        Buffer.from("line1\r\nline2\r\n", "utf8"),
      );
      const tree = join(root, "tree");
      mkdirSync(join(tree, "media"), { recursive: true });
      // Working tree starts as pristine LF so the outcome is write, not dirty.
      writeFileSync(join(tree, "media", "crlf.txt"), Buffer.from("line1\nline2\n", "utf8"));

      const modifications: Modification[] = [
        {
          name: "crlf",
          description: "crlf",
          type: "files",
          files: [{ localPath: "./mods/media/crlf.txt", geckoPath: "media/crlf.txt" }],
          replacesGeckoSource: true,
        },
      ];
      const files = expandModifications(modifications, root);
      applyModifications({
        files,
        workingTreeRoot: tree,
        pristineRoot: null,
        existsInPristine: () => true,
        skipReplacesCheck: true,
        readPristine: () => Buffer.from("line1\nline2\n", "utf8"),
      });

      const written = readFileSync(resolveInTree(tree, "media/crlf.txt"));
      assert.equal(written.toString("utf8"), "line1\nline2\n");
      assert.ok(!written.includes(0x0d));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
