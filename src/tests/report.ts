import type { Output } from "../ports/output.js";
import type { RunTestsSummary, TestResult } from "./run.js";

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

export function formatTestLine(result: TestResult): string[] {
  const lines: string[] = [];
  const classLabel = pad(result.classification, 14);
  const name = pad(result.name, 32);
  const outcome = result.outcome.toUpperCase() === "PASSED" ? "passed" : result.outcome;
  const time = result.elapsedSeconds ? `${result.elapsedSeconds}s` : "";

  if (result.outcome === "blocked") {
    lines.push(`  ${classLabel} ${name} blocked`);
    if (result.blockReason) {
      lines.push(`                ${result.blockReason}  ->  ${result.nextCommand ?? ""}`);
    }
    return lines;
  }

  if (result.outcome === "failed") {
    lines.push(`  ${classLabel} ${name} FAILED     ${time}`);
    if (result.logPath) {
      lines.push(`                ${result.logPath}`);
    }
    return lines;
  }

  if (result.outcome === "excluded") {
    return lines;
  }

  lines.push(`  ${classLabel} ${name} ${outcome.padEnd(8)} ${time}`);
  return lines;
}

export function printTestReport(summary: RunTestsSummary, output: Output): void {
  for (const result of summary.results) {
    for (const line of formatTestLine(result)) {
      output.writeStdout(`${line}\n`);
    }
  }

  const parts = [
    `${summary.passed} passed`,
    `${summary.failed} failed`,
    `${summary.blocked} blocked`,
  ];
  if (summary.excluded > 0) {
    parts.push(`${summary.excluded} diagnostic not counted`);
  }
  if (summary.incomplete) {
    parts.push("incomplete");
  }

  output.writeStdout(`\n  ${parts.join(" · ")}\n`);
}

export function testReportJson(summary: RunTestsSummary, command: string, elapsedSeconds: number) {
  return {
    ok: summary.ok,
    command,
    elapsedSeconds,
    result: {
      tests: summary.results.map((r) => ({
        name: r.name,
        classification: r.classification,
        outcome: r.outcome,
        elapsedSeconds: r.elapsedSeconds,
        exitCode: r.exitCode ?? null,
        logPath: r.logPath ?? null,
        blockReason: r.blockReason ?? null,
        nextCommand: r.nextCommand ?? null,
        report: r.report ?? null,
      })),
      passed: summary.passed,
      failed: summary.failed,
      blocked: summary.blocked,
      excluded: summary.excluded,
      incomplete: summary.incomplete,
    },
    nextSteps: summary.ok
      ? []
      : summary.results
          .filter((r) => r.nextCommand)
          .map((r) => r.nextCommand!)
          .filter((v, i, a) => a.indexOf(v) === i),
  };
}
