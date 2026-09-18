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

/*
 * The toolchain image is stated twice, by hand, and derived from nothing.
 *
 * A tag is a mutable pointer. Whoever can push to the registry can make
 * `w7s-toolchain:0.1.0` mean different bytes, and a w7s that pulled by tag would
 * then compile a different Firefox without ever saying so. Pulling by digest makes
 * that unrepresentable: the registry has no way to hand back anything but these
 * bytes. So the digest is the only reference that reaches the container engine,
 * and the tag exists for people to read.
 *
 * Both constants are updated by hand at release time, after the image is pushed
 * and its digest is known. See docs/09-release.md.
 */

/** The exact image bytes this w7s version runs. Every pull and every run uses this. */
export const TOOLCHAIN_IMAGE_DIGEST =
  "ghcr.io/rpjax/w7s-toolchain@sha256:ae738bf9f02aa28e1c81c2686962ae7e02f05fed5c67089d7de2837e681f8a2a";

/** The same image, named for a person to read. Printed in output; never pulled, never run. */
export const TOOLCHAIN_IMAGE_TAG = "ghcr.io/rpjax/w7s-toolchain:0.1.0";

/** Compilation target name — a property of the toolchain image. */
export const TOOLCHAIN_TARGET = "linux-x64";
