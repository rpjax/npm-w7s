import type { GitPort } from "../ports/git.js";
import { runProcess } from "./docker.js";

export class SystemGit implements GitPort {
  constructor(private readonly binary = "git") {}

  async available(): Promise<boolean> {
    const result = await runProcess(this.binary, ["--version"]);
    return result.exitCode === 0;
  }

  async text(args: string[], cwd: string): Promise<string> {
    const result = await runProcess(this.binary, args, { cwd });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout;
  }

  async bytes(args: string[], cwd: string): Promise<Buffer> {
    const result = await runProcess(this.binary, args, { cwd });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdoutBytes;
  }

  async ok(args: string[], cwd: string): Promise<boolean> {
    const result = await runProcess(this.binary, args, { cwd });
    return result.exitCode === 0;
  }
}
