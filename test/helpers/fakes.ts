import assert from "node:assert/strict";
import type { ContainerEngine, EngineRunResult } from "../../src/ports/engine.js";
import type { Clock } from "../../src/ports/clock.js";
import type { Host } from "../../src/ports/host.js";
import type { Output } from "../../src/ports/output.js";
import type { Ports } from "../../src/ports/index.js";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Fake engine. Receiving a `build` invocation fails the test (L5).
 */
export class FakeEngine implements ContainerEngine {
  readonly invocations: string[][] = [];
  availableFlag = true;
  images = new Map<string, { digest: string; id: string }>();
  runImpl: (argv: string[]) => Promise<EngineRunResult> = async () => ({
    exitCode: 0,
    stdout: "",
    stderr: "",
  });

  constructor(public pristineRoot: string) {
    this.images.set("ghcr.io/rpjax/w7s-toolchain:0.1.0", {
      digest: "sha256:faketoolchain",
      id: "sha256:fakeid",
    });
  }

  async available(): Promise<boolean> {
    return this.availableFlag;
  }

  async run(argv: string[]): Promise<EngineRunResult> {
    this.invocations.push([...argv]);
    if (argv[0] === "build" || argv.includes("build")) {
      assert.fail("FakeEngine received a build invocation — w7s must never build images (L5)");
    }
    return this.runImpl(argv);
  }

  async inspectImage(ref: string): Promise<{ digest: string; id: string } | null> {
    return this.images.get(ref) ?? null;
  }

  async pull(ref: string): Promise<void> {
    this.images.set(ref, { digest: `sha256:pulled-${ref}`, id: "sha256:pulled" });
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

export function createFakePorts(cwd: string, pristineRoot: string): Ports & {
  engine: FakeEngine;
  clock: FakeClock;
  host: FakeHost;
  output: FakeOutput;
} {
  const engine = new FakeEngine(pristineRoot);
  const clock = new FakeClock();
  const host = new FakeHost(cwd);
  const output = new FakeOutput();
  return { engine, clock, host, output };
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
