import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

let cachedVersion: string | undefined;

export function getVersion(): string {
  if (cachedVersion === undefined) {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      version: string;
    };
    cachedVersion = pkg.version;
  }
  return cachedVersion;
}

/** Toolchain image reference required by this w7s version. No override. */
export function requiredToolchainImage(version = getVersion()): string {
  return `ghcr.io/rpjax/w7s-toolchain:${version}`;
}

/** Compilation target name — a property of the toolchain image. */
export const TOOLCHAIN_TARGET = "linux-x64";
