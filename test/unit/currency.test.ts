import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  currencyOf,
  stampArtifact,
  volumeStampPath,
  buildJsonPath,
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

  it("two-record disagreement for volumes => missing, never current", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-cur4-"));
    try {
      const volume = join(root, "volume");
      stampArtifact("gecko-source", root, volume, "repo-fp-aaaa", "2026-09-18T12:00:00.000Z");
      writeFileSync(
        volumeStampPath(volume),
        `${JSON.stringify({ fingerprint: "volume-fp-bbbb", updatedAt: "2026-09-18T12:00:00.000Z" }, null, 2)}\n`,
      );
      const report = currencyOf("gecko-source", root, volume, "repo-fp-aaaa");
      assert.equal(report.status, "missing");
      assert.match(String(report.reason), /disagree/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sidecar-package currency reads build.json, not a volume stamp", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-cur5-"));
    try {
      const pkg = join(root, "dist", "linux-x64");
      mkdirSync(pkg, { recursive: true });
      writeFileSync(
        buildJsonPath(pkg),
        `${JSON.stringify({ fingerprint: "pkg-fp-cccc", timestamp: "2026-09-18T12:00:00.000Z" }, null, 2)}\n`,
      );
      stampArtifact("sidecar-package", root, pkg, "pkg-fp-cccc", "2026-09-18T12:00:00.000Z");
      assert.equal(existsSync(volumeStampPath(pkg)), false);
      const report = currencyOf("sidecar-package", root, pkg, "pkg-fp-cccc");
      assert.equal(report.status, "current");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sidecar-package reports missing when build.json disagrees with repo stamp", () => {
    const root = mkdtempSync(join(tmpdir(), "w7s-cur6-"));
    try {
      const pkg = join(root, "dist", "linux-x64");
      mkdirSync(pkg, { recursive: true });
      writeFileSync(
        buildJsonPath(pkg),
        `${JSON.stringify({ fingerprint: "build-fp", timestamp: "2026-09-18T12:00:00.000Z" }, null, 2)}\n`,
      );
      stampArtifact("sidecar-package", root, pkg, "repo-fp", "2026-09-18T12:00:00.000Z");
      const repo = readRepoState(root).artifacts["sidecar-package"];
      assert.equal(repo?.fingerprint, "repo-fp");
      const report = currencyOf("sidecar-package", root, pkg, "repo-fp");
      assert.equal(report.status, "missing");
      assert.match(String(report.reason), /build\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
