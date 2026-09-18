import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { expandModifications } from "../../src/modifications/expand.js";
import { computeFingerprint } from "../../src/modifications/fingerprint.js";
import type { Modification } from "../../src/manifest/types.js";

describe("fingerprint", () => {
  function buildWorkspace(contentB = "second\n"): {
    root: string;
    files: ReturnType<typeof expandModifications>;
    cleanup(): void;
  } {
    const root = mkdtempSync(join(tmpdir(), "w7s-fp-"));
    mkdirSync(join(root, "mods"), { recursive: true });
    writeFileSync(join(root, "mods", "z.cpp"), "first\n");
    writeFileSync(join(root, "mods", "a.cpp"), contentB);

    const modifications: Modification[] = [
      {
        name: "pair",
        description: "pair",
        type: "files",
        files: [
          { localPath: "./mods/z.cpp", geckoPath: "z.cpp" },
          { localPath: "./mods/a.cpp", geckoPath: "a.cpp" },
        ],
        replacesGeckoSource: false,
      },
    ];
    return {
      root,
      files: expandModifications(modifications, root),
      cleanup() {
        rmSync(root, { recursive: true, force: true });
      },
    };
  }

  it("is deterministic across key order", () => {
    const a = buildWorkspace();
    const b = buildWorkspace();
    try {
      const reversed: Modification[] = [
        {
          name: "pair",
          description: "pair",
          type: "files",
          files: [
            { localPath: "./mods/a.cpp", geckoPath: "a.cpp" },
            { localPath: "./mods/z.cpp", geckoPath: "z.cpp" },
          ],
          replacesGeckoSource: false,
        },
      ];
      const filesReversed = expandModifications(reversed, b.root);
      assert.equal(computeFingerprint("0.1.0", a.files), computeFingerprint("0.1.0", filesReversed));
      assert.equal(computeFingerprint("0.1.0", a.files).length, 12);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });

  it("uses posix geckoPath separators on every platform", () => {
    const ctx = buildWorkspace();
    try {
      for (const file of ctx.files) {
        assert.ok(!file.geckoPath.includes("\\"));
      }
      assert.equal(computeFingerprint("0.1.0", ctx.files), computeFingerprint("0.1.0", ctx.files));
    } finally {
      ctx.cleanup();
    }
  });

  it("changes when one byte of content changes", () => {
    const a = buildWorkspace("second\n");
    const b = buildWorkspace("second!\n");
    try {
      assert.notEqual(computeFingerprint("0.1.0", a.files), computeFingerprint("0.1.0", b.files));
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
