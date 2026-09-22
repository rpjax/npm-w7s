import { fail } from "../errors/index.js";

/**
 * Paths that Docker Desktop bind-mounts from a Windows drive letter into a Linux
 * container go through a userspace file share. A full Gecko tree makes that path
 * unusable — `git diff` during `mach bootstrap` hangs for hours. WSL filesystem
 * paths (`\\wsl$\…`) and native Linux paths are fine.
 */
export function assertContainerFriendlyPath(hostPath: string, label: string): void {
  if (process.platform !== "win32") {
    return;
  }
  if (/^[A-Za-z]:[\\/]/.test(hostPath)) {
    fail(
      "Toolchain",
      `${label} is on a Windows drive (${hostPath}). A Gecko tree cannot be bind-mounted from NTFS into the toolchain container.`,
      {
        detail:
          "Docker Desktop file sharing turns every git/mach filesystem walk into a multi-hour hang.",
        hint: "Keep the manifest (and .w7s/) on a WSL filesystem, e.g. \\\\wsl$\\Ubuntu\\home\\you\\gecko-engine",
      },
    );
  }
}

/** Host path spelling docker accepts in `-v` specs (forward slashes). */
export function dockerHostPath(hostPath: string): string {
  return hostPath.replace(/\\/g, "/");
}

export function dockerVolumeSpec(
  hostPath: string,
  containerPath: string,
  mode?: "ro",
): string {
  const host = dockerHostPath(hostPath);
  return mode ? `${host}:${containerPath}:${mode}` : `${host}:${containerPath}`;
}
