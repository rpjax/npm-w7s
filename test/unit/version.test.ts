import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { getVersion, TOOLCHAIN_IMAGE_DIGEST, TOOLCHAIN_IMAGE_TAG } from "../../src/version.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

const REPOSITORY = "ghcr.io/rpjax/w7s-toolchain";

describe("version", () => {
  it("matches package.json version", () => {
    assert.equal(getVersion(), packageVersion());
  });

  it("the toolchain tag names this package version", () => {
    assert.equal(TOOLCHAIN_IMAGE_TAG, `${REPOSITORY}:${packageVersion()}`);
  });

  it("the toolchain digest is a digest reference, never a tag", () => {
    assert.match(TOOLCHAIN_IMAGE_DIGEST, /^ghcr\.io\/rpjax\/w7s-toolchain@sha256:[0-9a-f]{64}$/);
  });

  it("the tag and the digest name the same repository", () => {
    assert.equal(TOOLCHAIN_IMAGE_TAG.split(":")[0], REPOSITORY);
    assert.equal(TOOLCHAIN_IMAGE_DIGEST.split("@")[0], REPOSITORY);
  });
});
