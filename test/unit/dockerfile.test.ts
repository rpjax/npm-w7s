import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dockerfileSha256,
  renderDockerfile,
  toolchainImageTag,
} from "../../src/toolchain/dockerfile.js";
import type { ToolchainDeclaration } from "../../src/manifest/types.js";

const declaration: ToolchainDeclaration = {
  target: "linux-x64",
  baseImage: "ubuntu:24.04",
  aptPackages: ["python3", "git", "build-essential"],
  rustVersion: "1.90.0",
  sccacheVersion: "0.17.0",
};

describe("toolchain Dockerfile", () => {
  it("renders byte-identically for the same declaration", () => {
    assert.equal(renderDockerfile(declaration), renderDockerfile({ ...declaration }));
  });

  it("does not depend on the order packages were written in", () => {
    const shuffled = { ...declaration, aptPackages: ["git", "build-essential", "python3"] };
    assert.equal(renderDockerfile(shuffled), renderDockerfile(declaration));
  });

  it("changes when anything the operator declared changes", () => {
    const other = { ...declaration, rustVersion: "1.91.0" };
    assert.notEqual(renderDockerfile(other), renderDockerfile(declaration));
    assert.notEqual(
      toolchainImageTag(renderDockerfile(other)),
      toolchainImageTag(renderDockerfile(declaration)),
    );
  });

  it("never names a package the manifest did not", () => {
    const rendered = renderDockerfile({ ...declaration, aptPackages: [] });
    assert.ok(!rendered.includes("apt-get install"));
  });

  it("appends extraCommands verbatim and in order", () => {
    const rendered = renderDockerfile({
      ...declaration,
      extraCommands: ["echo first", "echo second"],
    });
    assert.ok(rendered.indexOf("RUN echo first") < rendered.indexOf("RUN echo second"));
  });

  it("tags with the first 16 hex of the Dockerfile sha256", () => {
    const rendered = renderDockerfile(declaration);
    assert.equal(
      toolchainImageTag(rendered),
      `w7s-toolchain:local-${dockerfileSha256(rendered).slice(0, 16)}`,
    );
  });
});
