/** Artifact names — the only values accepted by dependsOn and make. */
export const ARTIFACT_NAMES = ["gecko-source", "gecko-binary", "sidecar-package"] as const;
export type ArtifactName = (typeof ARTIFACT_NAMES)[number];

export function isArtifactName(value: string): value is ArtifactName {
  return (ARTIFACT_NAMES as readonly string[]).includes(value);
}

/** Runners a release-gate test may name — the toolchain image provides exactly these. */
export const RELEASE_GATE_RUNNERS = [
  "bash",
  "python3",
  "node",
  "dotnet",
  "clang",
  "g++",
  "cmake",
  "jq",
] as const;

export type ReleaseGateRunner = (typeof RELEASE_GATE_RUNNERS)[number];

export function releaseGateRunnerAllowed(runner: string): boolean {
  const first = runner.trim().split(/\s+/)[0] ?? "";
  return (RELEASE_GATE_RUNNERS as readonly string[]).includes(first);
}

export type ModificationType = "directory" | "files";
export type TestClassification = "release-gate" | "diagnostic";
export type TestVerifies = "build-output" | "released-image";

export interface FileMapping {
  localPath: string;
  geckoPath: string;
}

export interface DirectoryModification {
  name: string;
  description: string;
  type: "directory";
  localPath: string;
  geckoPath: string;
  replacesGeckoSource: boolean;
}

export interface FilesModification {
  name: string;
  description: string;
  type: "files";
  files: FileMapping[];
  replacesGeckoSource: boolean;
}

export type Modification = DirectoryModification | FilesModification;

export interface TestDeclaration {
  name: string;
  description: string;
  entryPoint: string;
  runner: string;
  workingDirectory: string;
  classification: TestClassification;
  dependsOn: ArtifactName[];
  verifies: TestVerifies;
  arguments?: string[];
  environment?: Record<string, string>;
  extraPackages?: string[];
  networkAccess?: boolean;
  report?: string;
  timeoutSeconds?: number;
  tags?: string[];
}

export interface W7sManifest {
  modifications: Modification[];
  tests: TestDeclaration[];
}
