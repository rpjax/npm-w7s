import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ContainerEngine } from "../ports/engine.js";
import { fail } from "../errors/index.js";

/**
 * Docker Desktop bind-mounts from a Windows drive letter into a Linux container
 * go through a userspace file share. A full Gecko tree makes that path unusable —
 * `git diff` during `mach bootstrap` hangs for hours.
 *
 * When the real Docker engine is used with an NTFS workspace we keep a small
 * marker directory on the host and put the real tree in a Docker named volume
 * (Linux VM filesystem). FakeEngine tests and WSL/`\\wsl$\…` paths keep using
 * bind mounts.
 */
export const VOLUME_MARKER = ".w7s-docker-volume";

export function isWindowsDrivePath(hostPath: string): boolean {
  return process.platform === "win32" && /^[A-Za-z]:[\\/]/.test(hostPath);
}

export function usesDockerVolumeBackend(hostPath: string, engine: ContainerEngine): boolean {
  if (
    !isWindowsDrivePath(hostPath) ||
    (engine as { usesNamedVolumesForNtfs?: boolean }).usesNamedVolumesForNtfs !== true
  ) {
    return false;
  }
  // Only the heavy trees — never single files (mozconfig) or out/.
  const norm = hostPath.replace(/\\/g, "/").toLowerCase();
  return (
    /\/\.w7s\/gecko(\/|$)/.test(norm) ||
    /\/\.w7s\/build(\/|$)/.test(norm) ||
    /\/\.w7s\/mozbuild(\/|$)/.test(norm) ||
    /\/\.w7s\/sccache(\/|$)/.test(norm)
  );
}

/** Stable docker volume name for a host path that must not be bind-mounted. */
export function dockerVolumeNameFor(hostPath: string): string {
  const hash = createHash("sha256").update(hostPath.replace(/\\/g, "/")).digest("hex").slice(0, 12);
  return `w7s-${hash}`;
}

export function volumeMarkerPath(hostPath: string): string {
  return join(hostPath, VOLUME_MARKER);
}

export function readVolumeMarker(hostPath: string): string | null {
  const marker = volumeMarkerPath(hostPath);
  if (!existsSync(marker)) {
    return null;
  }
  const name = readFileSync(marker, "utf8").trim();
  return name.length > 0 ? name : null;
}

export function writeVolumeMarker(hostPath: string, volumeName: string): void {
  mkdirSync(hostPath, { recursive: true });
  writeFileSync(volumeMarkerPath(hostPath), `${volumeName}\n`, "utf8");
}

/** Host path spelling docker accepts in bind `-v` specs (forward slashes). */
export function dockerHostPath(hostPath: string): string {
  return hostPath.replace(/\\/g, "/");
}

/**
 * Build a `-v` source: named volume when the Docker engine is using the NTFS
 * volume backend for this path, otherwise a bind mount.
 */
export function dockerVolumeSpec(
  hostPath: string,
  containerPath: string,
  mode?: "ro",
  engine?: ContainerEngine,
): string {
  const useVolume = engine
    ? usesDockerVolumeBackend(hostPath, engine)
    : isWindowsDrivePath(hostPath);
  const source = useVolume
    ? (readVolumeMarker(hostPath) ?? dockerVolumeNameFor(hostPath))
    : dockerHostPath(hostPath);
  return mode ? `${source}:${containerPath}:${mode}` : `${source}:${containerPath}`;
}

export async function ensureNamedVolume(
  engine: ContainerEngine,
  volumeName: string,
): Promise<void> {
  const inspect = await engine.run(["volume", "inspect", volumeName]);
  if (inspect.exitCode === 0) {
    return;
  }
  const created = await engine.run(["volume", "create", volumeName]);
  if (created.exitCode !== 0) {
    fail("Toolchain", `Failed to create docker volume ${volumeName}.`, {
      detail: created.stderr || created.stdout,
      hint: "Check that Docker is running.",
    });
  }
}

export async function ensureVolumeMount(
  engine: ContainerEngine,
  hostPath: string,
): Promise<string | null> {
  if (!usesDockerVolumeBackend(hostPath, engine)) {
    return null;
  }
  const volume = readVolumeMarker(hostPath) ?? dockerVolumeNameFor(hostPath);
  await ensureNamedVolume(engine, volume);
  writeVolumeMarker(hostPath, volume);
  return volume;
}

/**
 * Materialize the declared commit into a named volume (Windows NTFS workspaces).
 * Leaves a marker file on the host so later mounts resolve to the volume.
 */
export async function materializeIntoVolume(options: {
  engine: ContainerEngine;
  imageRef: string;
  hostTreeDir: string;
  repository: string;
  commit: string;
}): Promise<{ volume: string; state: "cloned" | "already-materialized" }> {
  const volume = (await ensureVolumeMount(options.engine, options.hostTreeDir))!;

  const existing = await options.engine.run([
    "run",
    "--rm",
    "-v",
    `${volume}:/gecko-source`,
    "-w",
    "/gecko-source",
    options.imageRef,
    "bash",
    "-lc",
    "test -d .git && git rev-parse HEAD",
  ]);
  if (existing.exitCode === 0 && existing.stdout.trim() === options.commit) {
    return { volume, state: "already-materialized" };
  }

  if (existing.exitCode === 0 && existing.stdout.trim().length > 0) {
    fail(
      "WorkingTree",
      `The docker volume for ${options.hostTreeDir} is at ${existing.stdout.trim()}, not ${options.commit}.`,
      {
        hint: `docker volume rm ${volume}   then  w7s gecko make gecko-source`,
      },
    );
  }

  const repo = options.repository.replace(/'/g, `'\\''`);
  const commit = options.commit.replace(/'/g, `'\\''`);
  const clone = await options.engine.run([
    "run",
    "--rm",
    "-v",
    `${volume}:/gecko-source`,
    "-e",
    "PYTHONUNBUFFERED=1",
    options.imageRef,
    "bash",
    "-lc",
    [
      "set -euo pipefail",
      "rm -rf /tmp/gecko-clone",
      `git clone --filter=blob:none --no-checkout '${repo}' /tmp/gecko-clone`,
      "cd /tmp/gecko-clone",
      `git checkout --detach '${commit}'`,
      "shopt -s dotglob && cp -a /tmp/gecko-clone/. /gecko-source/",
      "cd /gecko-source && git rev-parse HEAD",
    ].join(" && "),
  ]);

  if (clone.exitCode !== 0) {
    fail("Execution", "Failed to materialize the Gecko tree into a docker volume.", {
      detail: (clone.stderr || clone.stdout).slice(-2000),
      hint: "w7s gecko make gecko-source",
    });
  }
  const head = clone.stdout.trim().split(/\r?\n/).pop()?.trim();
  if (head !== options.commit) {
    fail("Execution", `Volume checkout is at ${head}, not ${options.commit}.`);
  }
  return { volume, state: "cloned" };
}

/** Copy mach's packaged archive from a volume-backed objdir onto the host marker dir. */
export async function exportPackagedArchiveFromVolume(options: {
  engine: ContainerEngine;
  imageRef: string;
  hostObjdir: string;
}): Promise<void> {
  const volume = readVolumeMarker(options.hostObjdir);
  if (!volume) {
    return;
  }
  const hostDist = join(options.hostObjdir, "dist");
  mkdirSync(hostDist, { recursive: true });
  const result = await options.engine.run([
    "run",
    "--rm",
    "-v",
    `${volume}:/vol`,
    "-v",
    `${dockerHostPath(hostDist)}:/out`,
    options.imageRef,
    "bash",
    "-lc",
    "set -euo pipefail; mkdir -p /out; shopt -s nullglob; files=(/vol/dist/firefox-*.tar.*); if [ ${#files[@]} -eq 0 ]; then echo 'no archive in volume dist/' >&2; ls -la /vol/dist >&2 || true; exit 1; fi; cp -a \"${files[@]}\" /out/",
  ]);
  if (result.exitCode !== 0) {
    fail("Execution", "mach package produced no archive in the docker volume.", {
      detail: result.stderr || result.stdout,
      hint: "w7s gecko make gecko-binary",
    });
  }
}
