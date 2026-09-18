import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ManifestDiscoveryError } from "../errors/index.js";

export const MANIFEST_BASENAME = "w7s.json";
export const MANIFEST_SUFFIX = ".w7s.json";

export function listManifestFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name === MANIFEST_BASENAME || name.endsWith(MANIFEST_SUFFIX))
    .map((name) => join(dir, name));
}

function pickManifestInDir(dir: string): string | null {
  const matches = listManifestFiles(dir);
  if (matches.length === 0) {
    return null;
  }

  const named = join(dir, MANIFEST_BASENAME);
  const hasNamed = matches.includes(named);
  const suffixMatches = matches.filter((path) => path !== named);

  if (hasNamed && suffixMatches.length > 0) {
    throw new ManifestDiscoveryError(
      `Ambiguous manifest: both ${MANIFEST_BASENAME} and *${MANIFEST_SUFFIX} files found.`,
      {
        detail: matches.join("\n"),
        hint: `Keep either ${MANIFEST_BASENAME} or one *${MANIFEST_SUFFIX}, or pass --manifest.`,
      },
    );
  }

  if (suffixMatches.length > 1) {
    throw new ManifestDiscoveryError(
      `Ambiguous manifest: multiple *${MANIFEST_SUFFIX} files found.`,
      {
        detail: matches.join("\n"),
        hint: `Keep only one *${MANIFEST_SUFFIX}, or pass --manifest.`,
      },
    );
  }

  return hasNamed ? named : suffixMatches[0]!;
}

/**
 * Discover a manifest by walking up from cwd.
 * Accepts w7s.json or a single <name>.w7s.json at each level.
 */
export function discoverManifestFile(cwd: string): string {
  let dir = resolve(cwd);
  const root = resolve(dir, "/");

  for (;;) {
    const found = pickManifestInDir(dir);
    if (found) {
      return found;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === root) {
      break;
    }
    dir = parent;
  }

  throw new ManifestDiscoveryError(
    `No ${MANIFEST_BASENAME} or *${MANIFEST_SUFFIX} manifest found.`,
    {
      detail: `Started from: ${resolve(cwd)}`,
      hint: "Create a w7s.json at the engine directory root, or pass --manifest.",
    },
  );
}
