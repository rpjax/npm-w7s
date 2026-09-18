import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectTests } from "../../src/tests/select.js";
import type { TestDeclaration } from "../../src/manifest/types.js";
import type { CurrencyReport } from "../../src/artifacts/currency.js";

function testDecl(partial: Partial<TestDeclaration> & Pick<TestDeclaration, "name">): TestDeclaration {
  return {
    description: partial.description ?? partial.name,
    entryPoint: partial.entryPoint ?? "./t.sh",
    runner: partial.runner ?? "bash",
    workingDirectory: partial.workingDirectory ?? "/gecko-source",
    classification: partial.classification ?? "diagnostic",
    dependsOn: partial.dependsOn ?? [],
    verifies: partial.verifies ?? "build-output",
    tags: partial.tags,
    ...partial,
  };
}

const allCurrent: CurrencyReport[] = [
  { name: "gecko-source", status: "current", fingerprint: "aaa" },
  { name: "gecko-binary", status: "current", fingerprint: "aaa" },
  { name: "sidecar-package", status: "current", fingerprint: "aaa" },
];

describe("test selection", () => {
  const tests: TestDeclaration[] = [
    testDecl({ name: "alpha", tags: ["smoke"], classification: "release-gate", dependsOn: ["gecko-source"] }),
    testDecl({ name: "beta", tags: ["slow"], classification: "diagnostic", dependsOn: ["gecko-binary"] }),
    testDecl({ name: "gamma", tags: ["smoke", "net"], classification: "diagnostic", dependsOn: [] }),
  ];

  it("selects by name", () => {
    const selected = selectTests(tests, { names: ["beta"] }, allCurrent);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.test.name, "beta");
    assert.equal(selected[0]!.status, "selected");
  });

  it("selects by tag", () => {
    const selected = selectTests(tests, { tags: ["smoke"] }, allCurrent);
    assert.deepEqual(
      selected.map((s) => s.test.name),
      ["alpha", "gamma"],
    );
  });

  it("selects by classification", () => {
    const selected = selectTests(tests, { classification: "release-gate" }, allCurrent);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.test.name, "alpha");
  });

  it("preserves declaration order", () => {
    const selected = selectTests(tests, {}, allCurrent);
    assert.deepEqual(
      selected.map((s) => s.test.name),
      ["alpha", "beta", "gamma"],
    );
  });

  it("marks dependency gating as blocked, not failed", () => {
    const currency: CurrencyReport[] = [
      { name: "gecko-source", status: "missing" },
      { name: "gecko-binary", status: "missing" },
      { name: "sidecar-package", status: "missing" },
    ];
    const selected = selectTests(tests, { names: ["alpha"] }, currency);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.status, "blocked");
    assert.match(String(selected[0]!.blockReason), /gecko-source/);
    assert.equal(selected[0]!.nextCommand, "w7s gecko make gecko-source");
  });

  it("excludes diagnostics under --strict", () => {
    const selected = selectTests(tests, { classification: "diagnostic" }, allCurrent, {
      strict: true,
    });
    assert.ok(selected.every((s) => s.status === "excluded"));
  });
});
