import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArtifactName, W7sManifest } from "../manifest/types.js";
import { STATE_DIR } from "../artifacts/currency.js";

/**
 * Everything lives under the directory that holds the manifest. There is no
 * global state, no shared cache elsewhere, and nothing written anywhere else.
 *
 * One subdirectory per declared Gecko version, never overwritten: changing
 * `gecko.version` materializes a new tree beside the old one and builds into a
 * new output directory, so switching back is a manifest edit rather than a
 * rebuild.
 */
export const OUTPUT_DIR = "out";

export interface WorkspacePaths {
  manifestDir: string;
  /** Tool-owned, generated, gitignored. */
  stateDir: string;
  logsDir: string;
  /** The materialized Gecko tree for the declared version. */
  geckoSource: string;
  /** The object directory for the declared version. */
  geckoBinary: string;
  /** Deliverable: out/<version>/<target>/. */
  sidecarPackage: string;
  version: string;
  target: string;
}

export function resolveWorkspace(manifestDir: string, manifest: W7sManifest): WorkspacePaths {
  const root = resolve(manifestDir);
  const stateDir = join(root, STATE_DIR);
  const version = manifest.gecko.version;
  const target = manifest.toolchain.target;

  return {
    manifestDir: root,
    stateDir,
    logsDir: join(stateDir, "logs"),
    geckoSource: join(stateDir, "gecko", version),
    geckoBinary: join(stateDir, "build", version),
    sidecarPackage: join(root, OUTPUT_DIR, version, target),
    version,
    target,
  };
}

export function volumeRootFor(paths: WorkspacePaths, artifact: ArtifactName): string {
  switch (artifact) {
    case "gecko-source":
      return paths.geckoSource;
    case "gecko-binary":
      return paths.geckoBinary;
    case "sidecar-package":
      return paths.sidecarPackage;
    default: {
      const _exhaustive: never = artifact;
      return _exhaustive;
    }
  }
}

export function artifactPathFor(paths: WorkspacePaths, artifact: ArtifactName): string {
  return volumeRootFor(paths, artifact);
}

export function ensureWorkspaceDirs(paths: WorkspacePaths): void {
  mkdirSync(paths.stateDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(join(paths.stateDir, "gecko"), { recursive: true });
  mkdirSync(join(paths.stateDir, "build"), { recursive: true });
}

export function containerPathFor(artifact: ArtifactName): string {
  switch (artifact) {
    case "gecko-source":
      return "/gecko-source";
    case "gecko-binary":
      return "/gecko-binary";
    case "sidecar-package":
      return "/sidecar-package";
    default: {
      const _exhaustive: never = artifact;
      return _exhaustive;
    }
  }
}

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function workspaceExists(paths: WorkspacePaths, artifact: ArtifactName): boolean {
  return existsSync(volumeRootFor(paths, artifact));
}
