import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyPristineTiny } from "../fixtures/pristine-tiny.js";
import { createFakePorts, writeJson, type FakeEngine } from "./fakes.js";
import { createProgram } from "../../src/cli/program.js";
import type { Ports } from "../../src/ports/index.js";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const cli = join(repoRoot, "dist/cli/index.js");

export const packageVersion = (
  JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }
).version;

export function runW7s(args: string[], cwd = repoRoot): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
}

export interface Workspace {
  dir: string;
  pristine: string;
  ports: Ports & { engine: FakeEngine; output: { stdout: string; stderr: string; reset(): void } };
  cleanup(): void;
}

export function createWorkspace(
  options: {
    modifications?: unknown[];
    tests?: unknown[];
    gitignore?: boolean;
  } = {},
): Workspace {
  const dir = mkdtempSync(join(tmpdir(), "w7s-ws-"));
  const pristine = join(dir, "pristine");
  copyPristineTiny(pristine);

  mkdirSync(join(dir, "mods", "runtime"), { recursive: true });
  mkdirSync(join(dir, "mods", "install", "dom", "base"), { recursive: true });
  writeFileSync(
    join(dir, "mods", "runtime", "speculum-runtime.cpp"),
    "int speculum_runtime(){return 0;}\n",
  );
  writeFileSync(
    join(dir, "mods", "install", "dom", "base", "Document.cpp"),
    "// our Document.cpp\nint x = 2;\n",
  );

  const modifications = options.modifications ?? [
    {
      name: "runtime",
      description: "our runtime",
      type: "files",
      files: [
        { localPath: "./mods/runtime/speculum-runtime.cpp", geckoPath: "speculum-runtime.cpp" },
      ],
      replacesGeckoSource: false,
    },
    {
      name: "install",
      description: "install points",
      type: "directory",
      localPath: "./mods/install",
      geckoPath: ".",
      replacesGeckoSource: true,
    },
  ];

  const tests = options.tests ?? [];

  writeJson(join(dir, "w7s.json"), { modifications, tests });

  if (options.gitignore !== false) {
    writeFileSync(join(dir, ".gitignore"), "dist/\n.w7s/\n");
  }

  const ports = createFakePorts(dir, pristine);

  return {
    dir,
    pristine,
    ports,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function runProgram(
  args: string[],
  ports: Ports,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const output = ports.output as { stdout: string; stderr: string; reset(): void };
  output.reset();
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const program = createProgram({ ports });
  try {
    await program.parseAsync(args, { from: "user" });
  } catch {
    // handleFatal sets exitCode
  }
  const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = previousExit;
  return {
    exitCode,
    stdout: output.stdout,
    stderr: output.stderr,
  };
}

export { cpSync };
