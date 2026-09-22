import { spawn } from "node:child_process";
import { dirname } from "node:path";
import type { ContainerEngine, EngineRunResult, ImageBuildRequest } from "../ports/engine.js";
import { fail } from "../errors/index.js";
import { assertContainerFriendlyPath } from "./mount.js";

export function runProcess(
  command: string,
  argv: string[],
  options: { cwd?: string; stream?: boolean } = {},
): Promise<EngineRunResult & { stdoutBytes: Buffer }> {
  const stream = options.stream !== false;
  return new Promise((resolvePromise) => {
    const child = spawn(command, argv, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
    });
    const out: Buffer[] = [];
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out.push(chunk);
      if (stream) {
        process.stdout.write(chunk);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stream) {
        process.stderr.write(chunk);
      }
    });
    child.on("error", (err) => {
      resolvePromise({
        exitCode: 1,
        stdout: "",
        stdoutBytes: Buffer.alloc(0),
        stderr: err.message,
      });
    });
    child.on("close", (code) => {
      const stdoutBytes = Buffer.concat(out);
      resolvePromise({
        exitCode: code ?? 1,
        stdout: stdoutBytes.toString("utf8"),
        stdoutBytes,
        stderr,
      });
    });
  });
}

/** Refuse NTFS bind-mounts of the Gecko tree before docker ever sees them. */
function assertNoNtfsGeckoMounts(argv: string[]): void {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] !== "-v" && argv[i] !== "--volume") {
      continue;
    }
    const spec = argv[i + 1] ?? "";
    for (const container of ["/gecko-source", "/gecko-binary", "/mozbuild"]) {
      const needle = `:${container}`;
      const idx = spec.indexOf(needle);
      if (idx < 0) {
        continue;
      }
      const after = spec.slice(idx + needle.length);
      if (after !== "" && !after.startsWith(":")) {
        continue;
      }
      assertContainerFriendlyPath(spec.slice(0, idx).replace(/\//g, "\\"), container.slice(1));
    }
  }
}

/** Docker-backed container engine. */
export class DockerEngine implements ContainerEngine {
  constructor(private readonly binary = "docker") {}

  async available(): Promise<boolean> {
    const result = await runProcess(this.binary, ["version", "--format", "{{.Server.Version}}"]);
    return result.exitCode === 0;
  }

  async run(argv: string[]): Promise<EngineRunResult> {
    assertNoNtfsGeckoMounts(argv);
    return runProcess(this.binary, argv);
  }

  async build(request: ImageBuildRequest): Promise<void> {
    const result = await runProcess(this.binary, [
      "build",
      "--file",
      request.dockerfilePath,
      "--tag",
      request.tag,
      request.contextDir || dirname(request.dockerfilePath),
    ]);
    if (result.exitCode !== 0) {
      fail("Toolchain", `Failed to build the toolchain image ${request.tag}.`, {
        detail: result.stderr || result.stdout,
        hint: "Check the toolchain block in your manifest, then retry w7s gecko toolchain.",
      });
    }
  }

  async imageExists(tag: string): Promise<boolean> {
    const result = await runProcess(this.binary, ["image", "inspect", tag, "--format", "{{.Id}}"]);
    return result.exitCode === 0;
  }

  async inspectImage(ref: string): Promise<{ digest: string; id: string } | null> {
    const result = await runProcess(this.binary, ["image", "inspect", ref, "--format", "{{.Id}}"]);
    if (result.exitCode !== 0) {
      return null;
    }
    const id = result.stdout.trim();
    return { id, digest: id };
  }
}
