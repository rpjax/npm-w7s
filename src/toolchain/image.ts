import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ContainerEngine } from "../ports/engine.js";
import type { ToolchainDeclaration } from "../manifest/types.js";
import { dockerfileSha256, renderDockerfile, toolchainImageTag } from "./dockerfile.js";

export const LOCK_FILE = "lock.json";

export interface ToolchainLock {
  tag: string;
  dockerfileSha256: string;
  imageId: string | null;
  builtAt: string;
}

export interface EnsureToolchainOptions {
  toolchain: ToolchainDeclaration;
  stateDir: string;
  engine: ContainerEngine;
  now: () => Date;
  dryRun?: boolean;
}

export type EnsureToolchainOutcome =
  | { state: "already-built"; tag: string; dockerfilePath: string }
  | { state: "built"; tag: string; dockerfilePath: string }
  | { state: "would-build"; tag: string; dockerfilePath: string };

/**
 * Make the toolchain image exist, and do nothing if it already does.
 *
 * The tag is the sha256 of the rendered Dockerfile, so it IS the cache key:
 * the image is rebuilt when the manifest's toolchain block changes, and never
 * because time passed. That is what keeps `mach bootstrap` — which fetches
 * whatever Mozilla serves on the day it runs, and has no hash to check against —
 * frozen now that nothing is baked into a published image.
 */
export async function ensureToolchainImage(
  options: EnsureToolchainOptions,
): Promise<EnsureToolchainOutcome> {
  const dockerfile = renderDockerfile(options.toolchain);
  const tag = toolchainImageTag(dockerfile);
  const dockerfilePath = join(options.stateDir, "Dockerfile");

  if (await options.engine.imageExists(tag)) {
    return { state: "already-built", tag, dockerfilePath };
  }

  if (options.dryRun) {
    return { state: "would-build", tag, dockerfilePath };
  }

  mkdirSync(dirname(dockerfilePath), { recursive: true });
  writeFileSync(dockerfilePath, dockerfile, "utf8");

  await options.engine.build({
    dockerfilePath,
    contextDir: options.stateDir,
    tag,
  });

  const image = await options.engine.inspectImage(tag);
  const lock: ToolchainLock = {
    tag,
    dockerfileSha256: dockerfileSha256(dockerfile),
    imageId: image?.id ?? null,
    builtAt: options.now().toISOString(),
  };
  writeFileSync(join(options.stateDir, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  return { state: "built", tag, dockerfilePath };
}
