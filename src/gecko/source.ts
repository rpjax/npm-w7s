import { createHash } from "node:crypto";
import type { GeckoDeclaration } from "../manifest/types.js";

/**
 * Materializing and verifying the Gecko tree.
 *
 * The tree is cloned once per declared version into its own directory and never
 * overwritten: changing `gecko.version` materializes a new tree beside the old
 * one, so switching back is a manifest edit rather than a rebuild.
 *
 * Verification is what replaces the read-only baked image. `git rev-parse HEAD`
 * must equal the declared commit — a commit SHA is a content hash, so this is a
 * proof. It runs after materializing AND before every command that reads the
 * tree, because a tree that drifted is not the tree that was declared.
 */
export interface GeckoSourcePorts {
  /** Run a git command in `cwd`; resolves with stdout on exit 0, rejects otherwise. */
  git(args: string[], cwd: string): Promise<string>;
  exists(path: string): boolean;
}

export type MaterializeOutcome =
  { state: "already-materialized"; commit: string } | { state: "cloned"; commit: string };

export async function verifyCommit(
  ports: GeckoSourcePorts,
  treeDir: string,
  declared: GeckoDeclaration,
): Promise<{ ok: true } | { ok: false; found: string }> {
  const found = (await ports.git(["rev-parse", "HEAD"], treeDir)).trim();
  return found === declared.commit ? { ok: true } : { ok: false, found };
}

export async function materialize(
  ports: GeckoSourcePorts,
  treeDir: string,
  declared: GeckoDeclaration,
): Promise<MaterializeOutcome> {
  if (ports.exists(treeDir)) {
    const check = await verifyCommit(ports, treeDir, declared);
    if (!check.ok) {
      throw new Error(
        `The tree at ${treeDir} is at ${check.found}, but the manifest declares ${declared.commit}. ` +
          `w7s never rewrites a materialized tree — reset this version, or declare a new gecko.version.`,
      );
    }
    return { state: "already-materialized", commit: declared.commit };
  }

  await ports.git(["clone", "--no-checkout", declared.repository, treeDir], ".");
  await ports.git(["checkout", "--detach", declared.commit], treeDir);

  const check = await verifyCommit(ports, treeDir, declared);
  if (!check.ok) {
    throw new Error(
      `After checkout the tree is at ${check.found}, not the declared ${declared.commit}.`,
    );
  }
  return { state: "cloned", commit: declared.commit };
}

/**
 * The baseline for three-state comparison.
 *
 * 0.1.0 compared against a read-only /gecko-pristine mount. Here the pristine
 * bytes are the tree's own content at the verified commit, so the baseline is
 * recorded once at materialization: path -> sha256 of the committed blob.
 */
export function pristineHash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}
