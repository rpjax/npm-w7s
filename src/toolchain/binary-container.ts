import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ContainerEngine } from "../ports/engine.js";
import { dockerVolumeSpec, ensureVolumeMount } from "../engine/mount.js";
import type { WorkspacePaths } from "../workspace/paths.js";
import type { W7sManifest } from "../manifest/types.js";
import {
  ensureBootstrapped,
  mozbuildStateDir,
  MOZBUILD_CONTAINER_PATH,
} from "./bootstrap.js";
import { renderMozconfig, OBJDIR_CONTAINER_PATH } from "./mozconfig.js";

/**
 * Mounts + env shared by `gecko make gecko-binary` and `gecko shell <cmd>`.
 * mozbuild = mozbuildStateDir(tag), never the parent `.w7s/mozbuild/`.
 * Does not include `-w` — callers append optional binds then set workdir.
 */
export async function geckoBinaryMountArgs(options: {
  paths: WorkspacePaths;
  ports: { engine: ContainerEngine };
  manifest: W7sManifest;
  imageRef: string;
  now: () => Date;
}): Promise<string[]> {
  const { paths, ports, manifest, imageRef } = options;

  mkdirSync(paths.geckoBinary, { recursive: true });
  await ensureVolumeMount(ports.engine, paths.geckoSource);
  await ensureVolumeMount(ports.engine, paths.geckoBinary);

  await ensureBootstrapped({
    engine: ports.engine,
    imageRef,
    stateDir: paths.stateDir,
    toolchainTag: imageRef,
    geckoSource: paths.geckoSource,
    now: options.now,
  });

  const mozbuildDir = mozbuildStateDir(paths.stateDir, imageRef);
  const sccacheDir = join(paths.stateDir, "sccache");
  mkdirSync(sccacheDir, { recursive: true });
  await ensureVolumeMount(ports.engine, mozbuildDir);
  await ensureVolumeMount(ports.engine, sccacheDir);

  const mozconfigPath = join(paths.stateDir, "mozconfig", `${paths.version}.mozconfig`);
  mkdirSync(dirname(mozconfigPath), { recursive: true });
  writeFileSync(mozconfigPath, renderMozconfig(manifest.toolchain), "utf8");

  return [
    "-v",
    dockerVolumeSpec(paths.geckoSource, "/gecko-source", undefined, ports.engine),
    "-v",
    dockerVolumeSpec(paths.geckoBinary, OBJDIR_CONTAINER_PATH, undefined, ports.engine),
    "-v",
    dockerVolumeSpec(mozbuildDir, MOZBUILD_CONTAINER_PATH, undefined, ports.engine),
    "-v",
    dockerVolumeSpec(sccacheDir, "/cache/sccache", undefined, ports.engine),
    "-v",
    dockerVolumeSpec(mozconfigPath, "/w7s.mozconfig", "ro", ports.engine),
    "-e",
    `MOZBUILD_STATE_PATH=${MOZBUILD_CONTAINER_PATH}`,
    "-e",
    "MOZCONFIG=/w7s.mozconfig",
    "-e",
    "PYTHONUNBUFFERED=1",
  ];
}

/** Forward SPECULUM_* from the host into the container (digest dump, monorepo gates). */
export function forwardSpeculumEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("SPECULUM_") || value === undefined) continue;
    out.push("-e", `${key}=${value}`);
  }
  return out;
}

/** Interactive debug shell: source + workspace only (no binary tree required). */
export function geckoInteractiveDockerArgs(options: {
  paths: WorkspacePaths;
  ports: { engine: ContainerEngine };
  manifestDir: string;
}): string[] {
  const { paths, ports, manifestDir } = options;
  return [
    "-v",
    dockerVolumeSpec(paths.geckoSource, "/gecko-source", undefined, ports.engine),
    "-v",
    dockerVolumeSpec(manifestDir, "/workspace", undefined, ports.engine),
    "-e",
    "PYTHONUNBUFFERED=1",
    ...forwardSpeculumEnv(),
    "-w",
    "/gecko-source",
  ];
}
