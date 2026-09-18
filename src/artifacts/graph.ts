import type { ArtifactName } from "../manifest/types.js";
import { ARTIFACT_NAMES } from "../manifest/types.js";
import { fail } from "../errors/index.js";

/** Fixed production chain from docs/01-concepts.md. */
export const ARTIFACT_CHAIN: Record<ArtifactName, ArtifactName[]> = {
  "gecko-source": [],
  "gecko-binary": ["gecko-source"],
  "sidecar-package": ["gecko-binary"],
};

/** Ordered production sequence. */
export const PRODUCTION_ORDER: ArtifactName[] = ["gecko-source", "gecko-binary", "sidecar-package"];

export function assertArtifactName(name: string): asserts name is ArtifactName {
  if (!(ARTIFACT_NAMES as readonly string[]).includes(name)) {
    fail("Cli", `Unknown artifact "${name}".`, {
      hint: `Artifacts: ${ARTIFACT_NAMES.join(", ")}`,
    });
  }
}

/** Artifacts that must be current before producing `target` (excluding target itself). */
export function dependenciesOf(target: ArtifactName): ArtifactName[] {
  const deps: ArtifactName[] = [];
  const visit = (name: ArtifactName): void => {
    for (const dep of ARTIFACT_CHAIN[name]) {
      visit(dep);
      if (!deps.includes(dep)) {
        deps.push(dep);
      }
    }
  };
  visit(target);
  return deps;
}

/** Steps to run for `make target`, optionally restricted with --only. */
export function stepsForMake(target: ArtifactName, only: boolean): ArtifactName[] {
  if (only) {
    return [target];
  }
  return [...dependenciesOf(target), target];
}
