import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactName } from "../manifest/types.js";
import { ARTIFACT_NAMES } from "../manifest/types.js";

export const STATE_DIR = ".w7s";
export const STATE_FILE = "state.json";
export const VOLUME_STAMP = ".w7s-stamp.json";

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

export function readRepoState(manifestDir: string): StateFile {
  return readJson<StateFile>(statePath(manifestDir)) ?? { artifacts: {} };
}

export function readVolumeStamp(volumeRoot: string): ArtifactRecord | null {
  return readJson<ArtifactRecord>(volumeStampPath(volumeRoot));
}

/**
 * Dual-stamp currency: repo .w7s/state.json AND stamp inside the volume.
 * Disagreement => missing, never current.
 */
export function currencyOf(
  name: ArtifactName,
  manifestDir: string,
  volumeRoot: string | null,
  expectedFingerprint?: string,
): CurrencyReport {
  const repo = readRepoState(manifestDir).artifacts[name];
  if (!repo) {
    return { name, status: "missing", reason: "no repo stamp" };
  }

  if (volumeRoot === null) {
    return { name, status: "missing", reason: "volume path unavailable" };
  }

  if (!existsSync(volumeRoot)) {
    return { name, status: "missing", reason: "volume absent" };
  }

  const volume = readVolumeStamp(volumeRoot);
  if (!volume) {
    return { name, status: "missing", reason: "volume stamp absent" };
  }

  if (repo.fingerprint !== volume.fingerprint) {
    return {
      name,
      status: "missing",
      reason: "repo and volume stamps disagree",
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
  volumeRoot: string,
  fingerprint: string,
  updatedAt: string,
): void {
  const record: ArtifactRecord = { fingerprint, updatedAt };

  const stateDir = join(manifestDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  const state = readRepoState(manifestDir);
  state.artifacts[name] = record;
  writeFileSync(statePath(manifestDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");

  mkdirSync(volumeRoot, { recursive: true });
  writeFileSync(volumeStampPath(volumeRoot), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export function clearArtifactStamp(
  name: ArtifactName,
  manifestDir: string,
  volumeRoot: string | null,
): void {
  const state = readRepoState(manifestDir);
  delete state.artifacts[name];
  const stateDir = join(manifestDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath(manifestDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");

  if (volumeRoot && existsSync(volumeStampPath(volumeRoot))) {
    try {
      unlinkSync(volumeStampPath(volumeRoot));
    } catch {
      // ignore missing stamp
    }
  }
}

export function allCurrency(
  manifestDir: string,
  volumeRoots: Partial<Record<ArtifactName, string | null>>,
  expectedFingerprint?: string,
): CurrencyReport[] {
  return ARTIFACT_NAMES.map((name) =>
    currencyOf(name, manifestDir, volumeRoots[name] ?? null, expectedFingerprint),
  );
}
