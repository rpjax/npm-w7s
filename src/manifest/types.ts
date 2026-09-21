/** Artifact names — the only values accepted by make. */
export const ARTIFACT_NAMES = ["gecko-source", "gecko-binary", "sidecar-package"] as const;
export type ArtifactName = (typeof ARTIFACT_NAMES)[number];

export function isArtifactName(value: string): value is ArtifactName {
  return (ARTIFACT_NAMES as readonly string[]).includes(value);
}

export type ModificationType = "directory" | "files";

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

/**
 * The Gecko tree this build uses.
 *
 * `commit` is the guarantee. A commit SHA is a content hash, so verifying
 * `git rev-parse HEAD` against it is a proof, not a hope — which is why the tree
 * no longer needs to be baked into a published image.
 *
 * `version` is a label and is NEVER parsed. It names the directory under
 * `.w7s/gecko/` and `out/`, nothing more. w7s never derives it from the commit,
 * and never derives the commit from it.
 */
export interface GeckoDeclaration {
  version: string;
  repository: string;
  commit: string;
}

/**
 * The contents of the build image. Every field is stated by the operator.
 *
 * w7s assembles; it does not choose. The tool owns the rules of building Gecko —
 * layer order, cache mounts, that `mach bootstrap` runs and with which flags. It
 * never adds a package nobody named and never picks a version nobody stated.
 */
export interface ToolchainDeclaration {
  target: string;
  baseImage: string;
  aptPackages: string[];
  rustVersion: string;
  sccacheVersion: string;
  extraCommands?: string[];
  /** ac_add_options / mk_add_options lines, verbatim and in order. MOZ_OBJDIR is w7s's. */
  mozconfigOptions?: string[];
}

export interface W7sManifest {
  gecko: GeckoDeclaration;
  toolchain: ToolchainDeclaration;
  modifications: Modification[];
}
