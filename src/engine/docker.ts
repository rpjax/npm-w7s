import { spawn } from "node:child_process";
import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContainerEngine, EngineRunResult } from "../ports/engine.js";
import { fail } from "../errors/index.js";

function runProcess(
  command: string,
  argv: string[],
  options: { cwd?: string } = {},
): Promise<EngineRunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, argv, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      resolvePromise({ exitCode: 1, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Docker-backed container engine.
 * Never issues `docker build` — that is a hard boundary (docs/06-provider.md).
 */
export class DockerEngine implements ContainerEngine {
  constructor(private readonly binary = "docker") {}

  async available(): Promise<boolean> {
    const result = await runProcess(this.binary, ["version", "--format", "{{.Server.Version}}"]);
    return result.exitCode === 0;
  }

  async run(argv: string[]): Promise<EngineRunResult> {
    if (argv[0] === "build" || argv.includes("build")) {
      fail("Execution", "w7s never builds images — dockup is the only image builder.", {
        detail: argv.join(" "),
        hint: "Remove any image-build step from your workflow.",
      });
    }
    return runProcess(this.binary, argv);
  }

  async inspectImage(ref: string): Promise<{ digest: string; id: string } | null> {
    const result = await runProcess(this.binary, [
      "image",
      "inspect",
      ref,
      "--format",
      "{{.Id}} {{index .RepoDigests 0}}",
    ]);
    if (result.exitCode !== 0) {
      return null;
    }
    const parts = result.stdout.trim().split(/\s+/);
    const id = parts[0] ?? "";
    const digest = parts[1] ?? id;
    return { id, digest };
  }

  async pull(ref: string): Promise<void> {
    const result = await this.run(["pull", ref]);
    if (result.exitCode !== 0) {
      fail("Toolchain", `Failed to pull toolchain image ${ref}.`, {
        detail: result.stderr || result.stdout,
        hint: "w7s gecko toolchain --pull",
      });
    }
  }

  async readPristine(imageRef: string, geckoPath: string): Promise<Buffer | null> {
    const containerPath = `/gecko-pristine/${geckoPath.replace(/\\/g, "/")}`;
    const result = await this.run(["run", "--rm", imageRef, "cat", containerPath]);
    if (result.exitCode !== 0) {
      return null;
    }
    return Buffer.from(result.stdout, "utf8");
  }

  async existsPristine(imageRef: string, geckoPath: string): Promise<boolean> {
    const containerPath = `/gecko-pristine/${geckoPath.replace(/\\/g, "/")}`;
    const result = await this.run(["run", "--rm", imageRef, "test", "-e", containerPath]);
    return result.exitCode === 0;
  }

  async copyPristineTo(imageRef: string, hostDest: string): Promise<void> {
    mkdirSync(hostDest, { recursive: true });
    const result = await this.run([
      "run",
      "--rm",
      "-v",
      `${hostDest}:/out`,
      imageRef,
      "bash",
      "-lc",
      "cp -a --no-preserve=ownership /gecko-pristine/. /out/",
    ]);
    if (result.exitCode !== 0) {
      fail("Toolchain", "Failed to copy pristine tree into gecko-source.", {
        detail: result.stderr || result.stdout,
        hint: "w7s gecko toolchain --pull",
      });
    }
  }
}

/**
 * Local-filesystem engine used when a pristine root is injected (tests).
 * Still refuses `build`.
 */
export class LocalPristineEngine implements ContainerEngine {
  readonly invocations: string[][] = [];

  constructor(
    private readonly pristineRoot: string,
    private readonly inner: ContainerEngine | null = null,
  ) {}

  async available(): Promise<boolean> {
    return existsSync(this.pristineRoot);
  }

  async run(argv: string[]): Promise<EngineRunResult> {
    this.invocations.push([...argv]);
    if (argv[0] === "build" || argv.includes("build")) {
      throw new Error("LocalPristineEngine received a build invocation — L5 violation");
    }
    if (this.inner) {
      return this.inner.run(argv);
    }
    // Simulate successful no-op container runs for compile/package/test in unit/integration.
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  async inspectImage(ref: string): Promise<{ digest: string; id: string } | null> {
    return { digest: `sha256:fake-${ref}`, id: "sha256:fake" };
  }

  async pull(_ref: string): Promise<void> {
    // no-op for local
  }

  async readPristine(_imageRef: string, geckoPath: string): Promise<Buffer | null> {
    const path = join(this.pristineRoot, ...geckoPath.replace(/\\/g, "/").split("/"));
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path);
  }

  async existsPristine(_imageRef: string, geckoPath: string): Promise<boolean> {
    const path = join(this.pristineRoot, ...geckoPath.replace(/\\/g, "/").split("/"));
    return existsSync(path);
  }

  async copyPristineTo(_imageRef: string, hostDest: string): Promise<void> {
    mkdirSync(hostDest, { recursive: true });
    cpSync(this.pristineRoot, hostDest, { recursive: true });
    // Ensure stamp directory is clean of fixture metadata if any
    writeFileSync(join(hostDest, ".w7s-copied"), "1");
  }
}
