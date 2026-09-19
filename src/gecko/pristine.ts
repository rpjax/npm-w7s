import type { GitPort } from "../ports/git.js";

/**
 * Pristine access: the committed content of a file, read straight out of the
 * object database of the materialized tree.
 *
 * This is deliberately NOT "whatever is on disk at the start of the run" and not
 * a snapshot recorded at materialization time. `git show <commit>:<path>` returns
 * the bytes that commit contains, and the commit is verified against the
 * manifest, so the answer cannot drift with the working tree and needs nothing
 * cached alongside it.
 */
function toGitPath(geckoPath: string): string {
  return geckoPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export async function readPristine(
  git: GitPort,
  treeDir: string,
  commit: string,
  geckoPath: string,
): Promise<Buffer | null> {
  const spec = `${commit}:${toGitPath(geckoPath)}`;
  if (!(await git.ok(["cat-file", "-e", spec], treeDir))) {
    return null;
  }
  return git.bytes(["show", spec], treeDir);
}

export async function existsPristine(
  git: GitPort,
  treeDir: string,
  commit: string,
  geckoPath: string,
): Promise<boolean> {
  return git.ok(["cat-file", "-e", `${commit}:${toGitPath(geckoPath)}`], treeDir);
}
