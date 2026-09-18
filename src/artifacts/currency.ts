import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactName } from "../manifest/types.js";
import { ARTIFACT_NAMES } from "../manifest/types.js";

export const STATE_DIR = ".w7s";
export const STATE_FILE = "state.json";
export const VOLUME_STAMP = ".w7s-stamp.json";
export const BUILD_JSON = "build.json";

export type CurrencyStatus = "current" | "behind" | "missing";

export interface ArtifactRecord {
  fingerprint: string;
  updatedAt: string;
}

export interface StateFile {
  artifacts: Partial<Record<ArtifactName, ArtifactRecord>>;
}

export interface CurrencyReport {
  name: ArtifactName;
  status: CurrencyStatus;
  fingerprint?: string;
  reason?: string;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function statePath(manifestDir: string): string {
  return join(manifestDir, STATE_DIR, STATE_FILE);
}

export function volumeStampPath(volumeRoot: string): string {
  return join(volumeRoot, VOLUME_STAMP);
}

export function buildJsonPath(packageDir: string): string {
  return join(packageDir, BUILD_JSON);
}

export function readRepoState(manifestDir: string): StateFile {
  return readJson<StateFile>(statePath(manifestDir)) ?? { artifacts: {} };
}

export function readVolumeStamp(volumeRoot: string): ArtifactRecord | null {
  return readJson<ArtifactRecord>(volumeStampPath(volumeRoot));
}

/**
 * sidecar-package has no .w7s/volumes stamp — its record is build.json inside dist/<target>/.
 */
export function readPackageRecord(packageDir: string): ArtifactRecord | null {
  const build = readJson<{ fingerprint?: string; timestamp?: string }>(buildJsonPath(packageDir));
  if (!build?.fingerprint) {
    return null;
  }
  return {
    fingerprint: build.fingerprint,
    updatedAt: build.timestamp ?? "",
  };
}

function readInnerRecord(name: ArtifactName, artifactRoot: string): ArtifactRecord | null {
  if (name === "sidecar-package") {
    return readPackageRecord(artifactRoot);
  }
  return readVolumeStamp(artifactRoot);
}

/**
 * Dual-stamp currency: repo .w7s/state.json AND the artifact's own record.
 * For gecko-source / gecko-binary: .w7s-stamp.json inside the volume.
 * For sidecar-package: build.json inside dist/<target>/.
 * Disagreement => missing, never current.
 */
export function currencyOf(
  name: ArtifactName,
  manifestDir: string,
  artifactRoot: string | null,
  expectedFingerprint?: string,
): CurrencyReport {
  const repo = readRepoState(manifestDir).artifacts[name];
  if (!repo) {
    return { name, status: "missing", reason: "no repo stamp" };
  }

  if (artifactRoot === null) {
    return { name, status: "missing", reason: "artifact path unavailable" };
  }

  if (!existsSync(artifactRoot)) {
    return { name, status: "missing", reason: "artifact absent" };
  }

  const inner = readInnerRecord(name, artifactRoot);
  if (!inner) {
    return {
      name,
      status: "missing",
      reason: name === "sidecar-package" ? "build.json absent" : "volume stamp absent",
    };
  }

  if (repo.fingerprint !== inner.fingerprint) {
    return {
      name,
      status: "missing",
      reason:
        name === "sidecar-package"
          ? "repo stamp and build.json disagree"
          : "repo and volume stamps disagree",
      fingerprint: repo.fingerprint,
    };
  }

  if (expectedFingerprint !== undefined && repo.fingerprint !== expectedFingerprint) {
    return {
      name,
      status: "behind",
      fingerprint: repo.fingerprint,
      reason: "fingerprint changed",
    };
  }

  return { name, status: "current", fingerprint: repo.fingerprint };
}

export function stampArtifact(
  name: ArtifactName,
  manifestDir: string,
  artifactRoot: string,
  fingerprint: string,
  updatedAt: string,
): void {
  const record: ArtifactRecord = { fingerprint, updatedAt };

  const stateDir = join(manifestDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  const state = readRepoState(manifestDir);
  state.artifacts[name] = record;
  writeFileSync(statePath(manifestDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");

  if (name === "sidecar-package") {
    // build.json is written by writeSidecarPackage — do not place a volume stamp in dist/.
    return;
  }

  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(volumeStampPath(artifactRoot), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export function clearArtifactStamp(
  name: ArtifactName,
  manifestDir: string,
  artifactRoot: string | null,
): void {
  const state = readRepoState(manifestDir);
  delete state.artifacts[name];
  const stateDir = join(manifestDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath(manifestDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");

  if (name === "sidecar-package") {
    return;
  }

  if (artifactRoot && existsSync(volumeStampPath(artifactRoot))) {
    try {
      unlinkSync(volumeStampPath(artifactRoot));
    } catch {
      // ignore missing stamp
    }
  }
}

export function allCurrency(
  manifestDir: string,
  artifactRoots: Partial<Record<ArtifactName, string | null>>,
  expectedFingerprint?: string,
): CurrencyReport[] {
  return ARTIFACT_NAMES.map((name) =>
    currencyOf(name, manifestDir, artifactRoots[name] ?? null, expectedFingerprint),
  );
}
