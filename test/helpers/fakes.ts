import assert from "node:assert/strict";
import type {
  ContainerEngine,
  EngineRunResult,
  ImageBuildRequest,
} from "../../src/ports/engine.js";
import type { GitPort } from "../../src/ports/git.js";
import type { Clock } from "../../src/ports/clock.js";
import type { Host } from "../../src/ports/host.js";
import type { Output } from "../../src/ports/output.js";
import type { Ports } from "../../src/ports/index.js";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fake engine. `build()` is allowed — that is how 0.2.0 makes the toolchain.
 * What stays forbidden is reaching docker's build via `run(["build", …])`; only
 * `src/toolchain/` may call the `build` port method (enforced by a unit test).
 */
export class FakeEngine implements ContainerEngine {
  readonly invocations: string[][] = [];
  readonly builds: ImageBuildRequest[] = [];
  availableFlag = true;
  images = new Map<string, { digest: string; id: string }>();
  runImpl: (argv: string[]) => Promise<EngineRunResult> = async () => ({
    exitCode: 0,
    stdout: "",
    stderr: "",
  });
  buildImpl: (request: ImageBuildRequest) => Promise<void> = async (request) => {
    this.images.set(request.tag, {
      digest: `sha256:built-${request.tag}`,
      id: `sha256:id-${request.tag}`,
    });
  };

  async available(): Promise<boolean> {
    return this.availableFlag;
  }

  async run(argv: string[]): Promise<EngineRunResult> {
    this.invocations.push([...argv]);
    if (argv[0] === "build") {
      assert.fail(
        "FakeEngine.run received docker build — use engine.build(); only src/toolchain/ may build",
      );
    }
    return this.runImpl(argv);
  }

  async build(request: ImageBuildRequest): Promise<void> {
    this.builds.push({ ...request });
    await this.buildImpl(request);
  }

  async imageExists(tag: string): Promise<boolean> {
    return this.images.has(tag);
  }

  async inspectImage(ref: string): Promise<{ digest: string; id: string } | null> {
    return this.images.get(ref) ?? null;
  }
}

/**
 * Fake git backed by a pristine fixture directory.
 *
 * `show <commit>:<path>` and `cat-file -e` always read from that fixture — the
 * committed bytes — never from the working tree, matching real git after the
 * commit is verified.
 */
export class FakeGit implements GitPort {
  availableFlag = true;
  /** Absolute paths that have been "cloned" (materialized). */
  readonly trees = new Set<string>();
  headByTree = new Map<string, string>();

  constructor(
    public pristineRoot: string,
    public readonly defaultCommit: string,
  ) {}

  async available(): Promise<boolean> {
    return this.availableFlag;
  }

  async text(args: string[], cwd: string): Promise<string> {
    const result = this.dispatch(args, cwd);
    if (!result.ok) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return result.stdout;
  }

  async bytes(args: string[], cwd: string): Promise<Buffer> {
    const result = this.dispatch(args, cwd);
    if (!result.ok) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return Buffer.from(result.stdout, "utf8");
  }

  async ok(args: string[], cwd: string): Promise<boolean> {
    return this.dispatch(args, cwd).ok;
  }

  private dispatch(
    args: string[],
    cwd: string,
  ): { ok: boolean; stdout: string; stderr: string } {
    const [cmd, ...rest] = args;
    if (cmd === "rev-parse") {
      if (rest[0] === "HEAD") {
        const head = this.headByTree.get(cwd) ?? this.defaultCommit;
        if (!this.trees.has(cwd) && !existsSync(join(cwd, ".git"))) {
          return { ok: false, stdout: "", stderr: "not a git repository" };
        }
        return { ok: true, stdout: `${head}\n`, stderr: "" };
      }
      if (rest[0] === "--git-dir") {
        if (this.trees.has(cwd) || existsSync(join(cwd, ".git"))) {
          return { ok: true, stdout: ".git\n", stderr: "" };
        }
        return { ok: false, stdout: "", stderr: "not a git repository" };
      }
    }

    if (cmd === "clone") {
      const dest = rest[rest.length - 1]!;
      mkdirSync(dest, { recursive: true });
      cpSync(this.pristineRoot, dest, { recursive: true });
      mkdirSync(join(dest, ".git"), { recursive: true });
      writeFileSync(join(dest, ".git", "HEAD"), this.defaultCommit, "utf8");
      this.trees.add(dest);
      this.headByTree.set(dest, this.defaultCommit);
      return { ok: true, stdout: "", stderr: "" };
    }

    if (cmd === "checkout") {
      // --detach <commit>
      const commit = rest[rest.length - 1] ?? this.defaultCommit;
      this.trees.add(cwd);
      this.headByTree.set(cwd, commit);
      if (!existsSync(join(cwd, ".git"))) {
        mkdirSync(join(cwd, ".git"), { recursive: true });
      }
      return { ok: true, stdout: "", stderr: "" };
    }

    if (cmd === "cat-file" && rest[0] === "-e") {
      const spec = rest[1] ?? "";
      const path = this.pathFromSpec(spec);
      if (!path) {
        return { ok: false, stdout: "", stderr: "bad object" };
      }
      const full = join(this.pristineRoot, ...path.split("/"));
      return existsSync(full)
        ? { ok: true, stdout: "", stderr: "" }
        : { ok: false, stdout: "", stderr: "does not exist" };
    }

    if (cmd === "show") {
      const spec = rest[0] ?? "";
      const path = this.pathFromSpec(spec);
      if (!path) {
        return { ok: false, stdout: "", stderr: "bad object" };
      }
      const full = join(this.pristineRoot, ...path.split("/"));
      if (!existsSync(full)) {
        return { ok: false, stdout: "", stderr: "does not exist" };
      }
      return { ok: true, stdout: readFileSync(full, "utf8"), stderr: "" };
    }

    return { ok: false, stdout: "", stderr: `unsupported fake git: ${args.join(" ")}` };
  }

  private pathFromSpec(spec: string): string | null {
    const idx = spec.indexOf(":");
    if (idx < 0) {
      return null;
    }
    return spec.slice(idx + 1).replace(/^\.\//, "");
  }
}

export class FakeClock implements Clock {
  private ms: number;

  constructor(start = Date.UTC(2026, 8, 18, 12, 0, 0)) {
    this.ms = start;
  }

  now(): Date {
    return new Date(this.ms);
  }

  nowMs(): number {
    return this.ms;
  }

  advance(ms: number): void {
    this.ms += ms;
  }
}

export class FakeHost implements Host {
  constructor(
    private readonly _cwd: string,
    private readonly _platform: NodeJS.Platform = process.platform,
  ) {}

  platform(): NodeJS.Platform {
    return this._platform;
  }

  env(name: string): string | undefined {
    return process.env[name];
  }

  cwd(): string {
    return this._cwd;
  }

  homedir(): string {
    return this._cwd;
  }

  isStdoutTTY(): boolean {
    return false;
  }

  pathSep(): string {
    return this._platform === "win32" ? "\\" : "/";
  }
}

export class FakeOutput implements Output {
  stdout = "";
  stderr = "";

  writeStdout(text: string): void {
    this.stdout += text;
  }

  writeStderr(text: string): void {
    this.stderr += text;
  }

  reset(): void {
    this.stdout = "";
    this.stderr = "";
  }
}

export const FIXTURE_COMMIT = "feec67e62a5148b41fd017ccbbc463e8a6f9e83d";

export function defaultGecko(): {
  version: string;
  repository: string;
  commit: string;
} {
  return {
    version: "153.2.0",
    repository: "https://github.com/mozilla-firefox/firefox.git",
    commit: FIXTURE_COMMIT,
  };
}

export function defaultToolchain(): {
  target: string;
  baseImage: string;
  aptPackages: string[];
  rustVersion: string;
  sccacheVersion: string;
  extraCommands: string[];
} {
  return {
    target: "linux-x64",
    baseImage: "ubuntu:24.04",
    aptPackages: ["build-essential", "git", "python3", "curl"],
    rustVersion: "1.90.0",
    sccacheVersion: "0.17.0",
    extraCommands: [],
  };
}

export function createFakePorts(
  cwd: string,
  pristineRoot: string,
  commit = FIXTURE_COMMIT,
): Ports & {
  engine: FakeEngine;
  git: FakeGit;
  clock: FakeClock;
  host: FakeHost;
  output: FakeOutput;
} {
  const engine = new FakeEngine();
  const git = new FakeGit(pristineRoot, commit);
  const clock = new FakeClock();
  const host = new FakeHost(cwd);
  const output = new FakeOutput();
  return { engine, git, clock, host, output };
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
