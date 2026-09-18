import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { getVersion, requiredToolchainImage } from "../../src/version.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("version", () => {
  it("matches package.json version", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      version: string;
    };
    assert.equal(getVersion(), pkg.version);
  });

  it("required toolchain tag matches package version", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      version: string;
    };
    assert.equal(requiredToolchainImage(), `ghcr.io/rpjax/w7s-toolchain:${pkg.version}`);
  });
});
