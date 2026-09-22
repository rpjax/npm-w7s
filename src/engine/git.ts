import type { GitPort } from "../ports/git.js";
import { runProcess } from "./docker.js";

/**
 * Host git against a bind-mounted / multi-uid tree hits the same "dubious
 * ownership" guard as git inside the container. Pass `-c safe.directory=*` on
 * every invocation so we never mutate the operator's global gitconfig.
 */
const SAFE_DIRECTORY_ARGS = ["-c", "safe.directory=*"] as const;

export class SystemGit implements GitPort {
  constructor(private readonly binary = "git") {}

  async available(): Promise<boolean> {
    const result = await runProcess(this.binary, ["--version"], { stream: false });
    return result.exitCode === 0;
  }

  async text(args: string[], cwd: string): Promise<string> {
    const result = await runProcess(this.binary, [...SAFE_DIRECTORY_ARGS, ...args], {
      cwd,
      stream: false,
    });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout;
  }

  async bytes(args: string[], cwd: string): Promise<Buffer> {
    const result = await runProcess(this.binary, [...SAFE_DIRECTORY_ARGS, ...args], {
      cwd,
      stream: false,
    });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdoutBytes;
  }

  async ok(args: string[], cwd: string): Promise<boolean> {
    const result = await runProcess(this.binary, [...SAFE_DIRECTORY_ARGS, ...args], {
      cwd,
      stream: false,
    });
    return result.exitCode === 0;
  }
}
