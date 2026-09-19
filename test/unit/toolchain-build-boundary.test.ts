import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(repoRoot, "src");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 0.2.0 inverted the 0.1.0 rule: building an image is allowed, but only from
 * `src/toolchain/`, and only of the Dockerfile w7s rendered itself.
 */
describe("toolchain build boundary", () => {
  it("only src/toolchain/ calls engine.build / ContainerEngine.build", () => {
    const callers: string[] = [];
    for (const file of listTsFiles(srcRoot)) {
      const text = readFileSync(file, "utf8");
      // Port method invocations — not ImageBuildRequest types or comments.
      if (/\.build\s*\(/.test(text) && /engine/.test(text)) {
        callers.push(relative(srcRoot, file).replace(/\\/g, "/"));
      }
    }
    assert.deepEqual(callers, ["toolchain/image.ts"]);
  });
});
