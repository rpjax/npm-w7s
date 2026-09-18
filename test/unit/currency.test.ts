import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  currencyOf,
  stampArtifact,
  volumeStampPath,
  readRepoState,
} from "../../src/artifacts/currency.js";

describe("currency", () => {
  it("reports missing when no repo stamp exists", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-cur-"));
    try {
      const volume = join(root, "volume");
      mkdirSync(volume, { recursive: true });
      const report = currencyOf("gecko-source", root, volume);
      assert.equal(report.status, "missing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports current when both stamps agree and match expected fingerprint", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-cur2-"));
    try {
      const volume = join(root, "volume");
      stampArtifact("gecko-source", root, volume, "abcdef123456", "2026-09-18T12:00:00.000Z");
      const report = currencyOf("gecko-source", root, volume, "abcdef123456");
      assert.equal(report.status, "current");
      assert.equal(report.fingerprint, "abcdef123456");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports behind when fingerprint changed but stamps agree", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-cur3-"));
    try {
      const volume = join(root, "volume");
      stampArtifact("gecko-binary", root, volume, "oldfingerprint", "2026-09-18T12:00:00.000Z");
      const report = currencyOf("gecko-binary", root, volume, "newfingerprint");
      assert.equal(report.status, "behind");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("two-record disagreement => missing, never current", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-cur4-"));
    try {
      const volume = join(root, "volume");
      stampArtifact("sidecar-package", root, volume, "repo-fp-aaaa", "2026-09-18T12:00:00.000Z");
      writeFileSync(
        volumeStampPath(volume),
        `${JSON.stringify({ fingerprint: "volume-fp-bbbb", updatedAt: "2026-09-18T12:00:00.000Z" }, null, 2)}\n`,
      );
      const repo = readRepoState(root).artifacts["sidecar-package"];
      assert.ok(repo);
      assert.notEqual(repo.fingerprint, "volume-fp-bbbb");

      const report = currencyOf("sidecar-package", root, volume, "repo-fp-aaaa");
      assert.equal(report.status, "missing");
      assert.match(String(report.reason), /disagree/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
