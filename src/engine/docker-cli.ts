import { accessSync, constants, lstatSync, readlinkSync, realpathSync } from "node:fs";
import { join as posixJoin } from "node:path/posix";
import { join as win32Join } from "node:path/win32";
import { fail } from "../errors/index.js";

export interface DockerBinaryProbe {
  /** PATH-like string to search. */
  pathEnv: string;
  /** Platform of the Node process (linux under WSL). */
  platform: NodeJS.Platform;
  /** Whether a path exists and is executable. */
  isExecutable: (path: string) => boolean;
  /** Resolve symlinks; return the input path if resolution fails. */
  resolveRealPath: (path: string) => string;
}

function defaultIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultResolveRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    // Broken symlink: still inspect the link text for .exe /mnt/c.
    try {
      if (lstatSync(path).isSymbolicLink()) {
        return readlinkSync(path);
      }
    } catch {
      /* fall through */
    }
    return path;
  }
}

/**
 * True when this path is the Windows Docker Desktop client (or a symlink to it).
 * Using it under WSL with POSIX `-v /home/…` produces an empty/invalid mount.
 */
export function isWindowsDockerBinary(resolvedPath: string): boolean {
  const norm = resolvedPath.replace(/\\/g, "/");
  if (/\.exe$/i.test(norm)) {
    return true;
  }
  // WSL mounts of the Windows drive / Docker Desktop install tree.
  if (/^\/mnt\/[a-z]\//i.test(norm)) {
    return true;
  }
  if (/\/docker\/docker\/resources\/bin\//i.test(norm)) {
    return true;
  }
  return false;
}

function listPathCandidates(
  pathEnv: string,
  names: string[],
  platform: NodeJS.Platform,
  isExecutable: (p: string) => boolean,
): string[] {
  const pathDelimiter = platform === "win32" ? ";" : ":";
  const pathJoin = platform === "win32" ? win32Join : posixJoin;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const dir of pathEnv.split(pathDelimiter)) {
    if (!dir) {
      continue;
    }
    for (const name of names) {
      const candidate = pathJoin(dir, name);
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      if (isExecutable(candidate)) {
        out.push(candidate);
      }
    }
  }
  return out;
}

/**
 * Pick a Docker CLI that can bind-mount Linux paths.
 *
 * On win32 the Windows client is correct. On Linux (including WSL) we must use a
 * native Linux client talking to the WSL Integration socket — never docker.exe.
 */
export function resolveDockerBinary(probe?: Partial<DockerBinaryProbe>): string {
  const platform = probe?.platform ?? process.platform;
  if (platform === "win32") {
    return "docker";
  }

  const pathEnv = probe?.pathEnv ?? process.env.PATH ?? "";
  const isExecutable = probe?.isExecutable ?? defaultIsExecutable;
  const resolveRealPath = probe?.resolveRealPath ?? defaultResolveRealPath;

  const candidates = listPathCandidates(pathEnv, ["docker", "docker.exe"], platform, isExecutable);
  const linux: string[] = [];
  const windows: string[] = [];
  for (const candidate of candidates) {
    const resolved = resolveRealPath(candidate);
    if (isWindowsDockerBinary(resolved) || isWindowsDockerBinary(candidate)) {
      windows.push(candidate);
    } else {
      linux.push(candidate);
    }
  }

  if (linux.length > 0) {
    return linux[0]!;
  }

  if (windows.length > 0) {
    fail(
      "Toolchain",
      "Docker CLI under WSL is the Windows client (docker.exe); bind mounts of Linux paths will be empty.",
      {
        detail: [
          `Found only a Windows Docker binary: ${windows[0]}`,
          "POSIX -v /home/…:/gecko-source does not work through docker.exe.",
        ].join("\n"),
        hint: "Enable Docker Desktop → Settings → Resources → WSL Integration for this distro, then ensure `command -v docker` is a Linux binary (not *.exe). Install docker-ce in the distro if needed.",
      },
    );
  }

  // Nothing on PATH — keep the bare name so available() surfaces a normal miss.
  return "docker";
}
