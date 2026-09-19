/**
 * Port wrapping git.
 *
 * git is not an implementation detail here, it is the guarantee: a commit SHA is
 * a content hash, so `rev-parse` proves the tree is the declared one, and
 * `show <commit>:<path>` yields the pristine bytes of any file no matter what
 * the working tree currently looks like. That is what replaced the read-only
 * `/gecko-pristine` mount of 0.1.0.
 */
export interface GitPort {
  /** Whether git is available. */
  available(): Promise<boolean>;

  /** Run git in `cwd`. Resolves with stdout on exit 0; rejects otherwise. */
  text(args: string[], cwd: string): Promise<string>;

  /** Run git in `cwd`, returning raw bytes. Rejects on non-zero exit. */
  bytes(args: string[], cwd: string): Promise<Buffer>;

  /** Run git in `cwd`, returning only whether it succeeded. */
  ok(args: string[], cwd: string): Promise<boolean>;
}
