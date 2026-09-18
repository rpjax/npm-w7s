import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { discoverManifestFile } from "../../src/manifest/discovery.js";
import { ManifestDiscoveryError } from "../../src/errors/index.js";
import { resolveManifestPath } from "../../src/cli/context.js";
import { W7sError } from "../../src/errors/index.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "w7s-discover-"));
}

describe("manifest discovery", () => {
  it("walks up from a nested cwd to find w7s.json", () => {
    const root = tempDir();
    try {
      const nested = join(root, "a", "b", "c");
      mkdirSync(nested, { recursive: true });
      const manifest = join(root, "w7s.json");
      writeFileSync(manifest, "{}\n");
      assert.equal(discoverManifestFile(nested), manifest);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a single <name>.w7s.json", () => {
    const root = tempDir();
    try {
      const manifest = join(root, "engine.w7s.json");
      writeFileSync(manifest, "{}\n");
      assert.equal(discoverManifestFile(root), manifest);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("--manifest takes precedence over discovery", () => {
    const root = tempDir();
    try {
      writeFileSync(join(root, "w7s.json"), '{"discovered":true}\n');
      const explicit = join(root, "explicit.json");
      writeFileSync(explicit, '{"explicit":true}\n');
      const resolved = resolveManifestPath({ manifest: explicit }, root);
      assert.equal(resolved, explicit);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects w7s.json together with a *.w7s.json candidate", () => {
    const root = tempDir();
    try {
      writeFileSync(join(root, "w7s.json"), "{}\n");
      writeFileSync(join(root, "other.w7s.json"), "{}\n");
      assert.throws(
        () => discoverManifestFile(root),
        (err: unknown) => err instanceof ManifestDiscoveryError,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects two *.w7s.json candidates in the same directory", () => {
    const root = tempDir();
    try {
      writeFileSync(join(root, "a.w7s.json"), "{}\n");
      writeFileSync(join(root, "b.w7s.json"), "{}\n");
      assert.throws(
        () => discoverManifestFile(root),
        (err: unknown) => err instanceof ManifestDiscoveryError,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps discovery failure through resolveManifestPath to Manifest phase", () => {
    const root = tempDir();
    try {
      assert.throws(
        () => resolveManifestPath({}, root),
        (err: unknown) => err instanceof W7sError && err.phase === "Manifest",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
