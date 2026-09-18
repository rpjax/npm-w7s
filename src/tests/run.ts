import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ContainerEngine } from "../ports/engine.js";
import type { Clock } from "../ports/clock.js";
import type { TestDeclaration } from "../manifest/types.js";
import type { SelectedTest } from "./select.js";
import { fail } from "../errors/index.js";

export type TestOutcome = "passed" | "failed" | "blocked" | "excluded";

export interface TestResult {
  name: string;
  classification: string;
  outcome: TestOutcome;
  elapsedSeconds: number;
  exitCode?: number;
  logPath?: string;
  blockReason?: string;
  nextCommand?: string;
  report?: unknown;
}

export interface RunTestsOptions {
  selected: SelectedTest[];
  manifestDir: string;
  engine: ContainerEngine;
  imageRef: string;
  clock: Clock;
  stopOnFailure: boolean;
  strict: boolean;
  /** Extra arguments appended to every selected test command. */
  extraArguments?: string;
  /** Host paths mounted into the container. */
  mounts: { host: string; container: string; readOnly?: boolean }[];
  dryRun?: boolean;
}

export interface RunTestsSummary {
  results: TestResult[];
  passed: number;
  failed: number;
  blocked: number;
  excluded: number;
  incomplete: boolean;
  ok: boolean;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function timestamp(clock: Clock): string {
  const d = clock.now();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

function buildCommand(test: TestDeclaration, extraArguments?: string): string[] {
  const parts = test.runner.trim().split(/\s+/);
  parts.push(test.entryPoint);
  if (test.arguments) {
    parts.push(...test.arguments);
  }
  if (extraArguments) {
    parts.push(...extraArguments.split(/\s+/).filter(Boolean));
  }
  return parts;
}

/**
 * Run selected tests inside the toolchain container.
 * Never interprets test output — captures to .w7s/logs and shows the path on failure.
 */
export async function runTests(options: RunTestsOptions): Promise<RunTestsSummary> {
  const {
    selected,
    manifestDir,
    engine,
    imageRef,
    clock,
    stopOnFailure,
    strict,
    extraArguments,
    mounts,
    dryRun,
  } = options;

  const logDir = join(manifestDir, ".w7s", "logs");
  mkdirSync(logDir, { recursive: true });

  const results: TestResult[] = [];
  let failed = 0;
  let passed = 0;
  let blocked = 0;
  let excluded = 0;

  for (const item of selected) {
    if (item.status === "excluded") {
      excluded += 1;
      results.push({
        name: item.test.name,
        classification: item.test.classification,
        outcome: "excluded",
        elapsedSeconds: 0,
      });
      continue;
    }

    if (item.status === "blocked") {
      blocked += 1;
      results.push({
        name: item.test.name,
        classification: item.test.classification,
        outcome: "blocked",
        elapsedSeconds: 0,
        blockReason: item.blockReason,
        nextCommand: item.nextCommand,
      });
      if (strict) {
        failed += 1;
      }
      continue;
    }

    const test = item.test;
    const started = clock.nowMs();
    const logPath = join(logDir, `${slug(test.name)}-${timestamp(clock)}.log`);

    if (dryRun) {
      results.push({
        name: test.name,
        classification: test.classification,
        outcome: "passed",
        elapsedSeconds: 0,
        logPath,
      });
      passed += 1;
      continue;
    }

    const cmd = buildCommand(test, extraArguments);
    const argv = ["run", "--rm"];
    for (const m of mounts) {
      argv.push("-v", `${m.host}:${m.container}${m.readOnly ? ":ro" : ""}`);
    }
    argv.push("-w", test.workingDirectory);
    if (test.environment) {
      for (const [k, v] of Object.entries(test.environment)) {
        argv.push("-e", `${k}=${v}`);
      }
    }
    argv.push(imageRef, ...cmd);

    const result = await engine.run(argv);
    const elapsedSeconds = Number(((clock.nowMs() - started) / 1000).toFixed(1));
    const logBody = [`$ ${cmd.join(" ")}`, "", result.stdout, result.stderr].join("\n");
    writeFileSync(logPath, logBody, "utf8");

    let report: unknown;
    if (test.report) {
      const reportPath = join(manifestDir, test.report);
      if (existsSync(reportPath)) {
        try {
          report = JSON.parse(readFileSync(reportPath, "utf8"));
        } catch {
          report = readFileSync(reportPath, "utf8");
        }
      }
    }

    if (result.exitCode === 0) {
      passed += 1;
      results.push({
        name: test.name,
        classification: test.classification,
        outcome: "passed",
        elapsedSeconds,
        exitCode: 0,
        logPath,
        report,
      });
    } else {
      failed += 1;
      results.push({
        name: test.name,
        classification: test.classification,
        outcome: "failed",
        elapsedSeconds,
        exitCode: result.exitCode,
        logPath,
        report,
      });
      if (stopOnFailure) {
        break;
      }
    }
  }

  const releaseGates = selected.filter((s) => s.test.classification === "release-gate");
  const executedGates = results.filter(
    (r) =>
      r.classification === "release-gate" && (r.outcome === "passed" || r.outcome === "failed"),
  );
  const incomplete =
    releaseGates.length > 0 &&
    executedGates.length < releaseGates.filter((s) => s.status !== "excluded").length;

  const ok = failed === 0 && !incomplete;

  return { results, passed, failed, blocked, excluded, incomplete, ok };
}

export function assertTestsOk(summary: RunTestsSummary): void {
  if (summary.ok) {
    return;
  }
  if (summary.failed > 0) {
    const first = summary.results.find((r) => r.outcome === "failed");
    fail("Test", `Release-gate test failed${first ? `: ${first.name}` : "."}`, {
      detail: first?.logPath,
      hint: first?.logPath
        ? `Inspect ${first.logPath}`
        : "w7s gecko test --classification release-gate",
    });
  }
  if (summary.incomplete) {
    fail("Test", "Test run incomplete — not every release-gate test executed.", {
      hint: "Satisfy dependsOn, then re-run w7s gecko test --classification release-gate",
    });
  }
}
