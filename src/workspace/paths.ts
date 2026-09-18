import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ArtifactName } from "../manifest/types.js";
import { STATE_DIR } from "../artifacts/currency.js";
import { TOOLCHAIN_TARGET } from "../version.js";

export interface WorkspacePaths {
  manifestDir: string;
  stateDir: string;
  volumesDir: string;
  logsDir: string;
  distDir: string;
  geckoSource: string;
  geckoBinary: string;
  /** Deliverable directory: only firefox.tar.gz + build.json. */
  sidecarPackage: string;
  /** Dual-stamp volume for sidecar-package (kept out of dist/). */
  sidecarStamp: string;
  target: string;
}

export function resolveWorkspace(manifestDir: string, target = TOOLCHAIN_TARGET): WorkspacePaths {
  const stateDir = join(manifestDir, STATE_DIR);
  const volumesDir = join(stateDir, "volumes");
  return {
    manifestDir: resolve(manifestDir),
    stateDir,
    volumesDir,
    logsDir: join(stateDir, "logs"),
    distDir: join(manifestDir, "dist"),
    geckoSource: join(volumesDir, "gecko-source"),
    geckoBinary: join(volumesDir, "gecko-binary"),
    sidecarPackage: join(manifestDir, "dist", target),
    sidecarStamp: join(volumesDir, "sidecar-package"),
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
      return paths.sidecarStamp;
    default: {
      const _exhaustive: never = artifact;
      return _exhaustive;
    }
  }
}

/** Host path of the artifact content (distinct from the currency stamp for sidecar-package). */
export function artifactPathFor(paths: WorkspacePaths, artifact: ArtifactName): string {
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

export function ensureWorkspaceDirs(paths: WorkspacePaths): void {
  mkdirSync(paths.stateDir, { recursive: true });
  mkdirSync(paths.volumesDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
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
