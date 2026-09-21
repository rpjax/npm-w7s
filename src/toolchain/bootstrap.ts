import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ContainerEngine } from "../ports/engine.js";
import { fail } from "../errors/index.js";

/**
 * `mach bootstrap` state, cached under the toolchain tag.
 *
 * Bootstrap needs a checkout, and in 0.2.0 the tree lives on the host rather
 * than inside the image, so this cannot be a Dockerfile layer any more. It runs
 * once into a directory keyed by the toolchain tag and mounted at
 * MOZBUILD_STATE_PATH on every later container.
 *
 * The keying is the whole point. Bootstrap fetches whatever Mozilla is serving
 * on the day it runs and there is no hash to check it against, so it is not
 * verifiable — only freezable. Tying its state directory to the same
 * content-addressed tag as the image means it is re-run when the manifest's
 * toolchain block changes, and never because time passed.
 */
export const MOZBUILD_CONTAINER_PATH = "/mozbuild";
const SENTINEL = ".w7s-bootstrapped";

export function mozbuildStateDir(stateDir: string, toolchainTag: string): string {
  const key = toolchainTag.split(":").pop() ?? toolchainTag;
  return join(stateDir, "mozbuild", key);
}

export function isBootstrapped(dir: string): boolean {
  return existsSync(join(dir, SENTINEL));
}

export async function ensureBootstrapped(options: {
  engine: ContainerEngine;
  imageRef: string;
  stateDir: string;
  toolchainTag: string;
  geckoSource: string;
  now: () => Date;
}): Promise<{ dir: string; state: "already-bootstrapped" | "bootstrapped" }> {
  const dir = mozbuildStateDir(options.stateDir, options.toolchainTag);
  if (isBootstrapped(dir)) {
    return { dir, state: "already-bootstrapped" };
  }

  mkdirSync(dir, { recursive: true });

  const result = await options.engine.run([
    "run",
    "--rm",
    "-v",
    `${options.geckoSource}:/gecko-source`,
    "-v",
    `${dir}:${MOZBUILD_CONTAINER_PATH}`,
    "-e",
    `MOZBUILD_STATE_PATH=${MOZBUILD_CONTAINER_PATH}`,
    "-w",
    "/gecko-source",
    options.imageRef,
    "bash",
    "-lc",
    "./mach --no-interactive bootstrap --application-choice=browser",
  ]);

  if (result.exitCode !== 0) {
    fail("Toolchain", "mach bootstrap failed.", {
      detail: (result.stderr || result.stdout).slice(-2000),
      hint: "w7s gecko shell, then run ./mach bootstrap by hand to see the full output.",
    });
  }

  writeFileSync(join(dir, SENTINEL), `${options.now().toISOString()}\n`, "utf8");
  return { dir, state: "bootstrapped" };
}
