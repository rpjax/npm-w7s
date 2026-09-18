import { dirname, resolve } from "node:path";
import { discoverManifestFile } from "../manifest/discovery.js";
import { loadManifest } from "../manifest/load.js";
import { validateManifest } from "../manifest/schema.js";
import { fail, ManifestDiscoveryError } from "../errors/index.js";
import type { W7sManifest } from "../manifest/types.js";
import type { GlobalOptions } from "./options.js";
import { resolveWorkspace, type WorkspacePaths } from "../workspace/paths.js";

export interface ManifestContext {
  manifestPath: string;
  manifestDir: string;
  manifest: W7sManifest;
  paths: WorkspacePaths;
}

export function resolveManifestPath(
  options: Pick<GlobalOptions, "manifest">,
  cwd: string,
): string {
  try {
    if (options.manifest) {
      return resolve(cwd, options.manifest);
    }
    return discoverManifestFile(cwd);
  } catch (err) {
    if (err instanceof ManifestDiscoveryError) {
      fail("Manifest", err.message, { detail: err.detail, hint: err.hint });
    }
    throw err;
  }
}

export function loadValidatedManifest(
  options: Pick<GlobalOptions, "manifest">,
  cwd: string,
): ManifestContext {
  const manifestPath = resolveManifestPath(options, cwd);
  const raw = loadManifest(manifestPath);
  validateManifest(raw);
  const manifestDir = dirname(manifestPath);
  return {
    manifestPath,
    manifestDir,
    manifest: raw,
    paths: resolveWorkspace(manifestDir),
  };
}
