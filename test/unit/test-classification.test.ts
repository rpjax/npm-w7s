import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateManifest } from "../../src/manifest/schema.js";
import { W7sError } from "../../src/errors/index.js";

function baseManifest(test: Record<string, unknown>): Record<string, unknown> {
  return {
    modifications: [],
    tests: [test],
  };
}

function releaseGate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "gate",
    description: "gate",
    entryPoint: "./gate.sh",
    runner: "bash",
    workingDirectory: "/gecko-source",
    classification: "release-gate",
    dependsOn: [],
    verifies: "build-output",
    ...overrides,
  };
}

describe("test classification", () => {
  it("rejects release-gate with extraPackages", () => {
    assert.throws(
      () => validateManifest(baseManifest(releaseGate({ extraPackages: ["curl"] }))),
      (err: unknown) =>
        err instanceof W7sError &&
        err.phase === "Manifest" &&
        /extraPackages/.test(err.message),
    );
  });

  it("rejects release-gate with networkAccess", () => {
    assert.throws(
      () => validateManifest(baseManifest(releaseGate({ networkAccess: true }))),
      (err: unknown) =>
        err instanceof W7sError &&
        err.phase === "Manifest" &&
        /networkAccess/.test(err.message),
    );
  });

  it("rejects release-gate with an unlisted runner", () => {
    assert.throws(
      () => validateManifest(baseManifest(releaseGate({ runner: "ruby" }))),
      (err: unknown) =>
        err instanceof W7sError &&
        err.phase === "Manifest" &&
        /runner/.test(err.message),
    );
  });

  it("accepts release-gate with an allowed runner", () => {
    assert.doesNotThrow(() =>
      validateManifest(baseManifest(releaseGate({ runner: "python3" }))),
    );
  });

  it("allows diagnostic tests to declare extraPackages and networkAccess", () => {
    assert.doesNotThrow(() =>
      validateManifest(
        baseManifest({
          name: "diag",
          description: "diag",
          entryPoint: "./d.sh",
          runner: "ruby",
          workingDirectory: "/gecko-source",
          classification: "diagnostic",
          dependsOn: [],
          verifies: "build-output",
          extraPackages: ["curl"],
          networkAccess: true,
        }),
      ),
    );
  });
});
