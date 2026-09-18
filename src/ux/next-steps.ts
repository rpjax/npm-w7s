import type { ErrorPhase } from "../errors/index.js";

/**
 * Every phase yields a non-empty next command.
 * Printed on the line after the failure cause — no exception.
 */
export function nextStepsForPhase(phase: ErrorPhase): string[] {
  switch (phase) {
    case "Cli":
      return ["w7s gecko --help"];
    case "Manifest":
      return ["w7s gecko validate"];
    case "WorkingTree":
      return [
        "w7s gecko capture --file <geckoPath> --into <modification>",
        "w7s gecko reset gecko-source --force",
      ];
    case "Declaration":
      return ["w7s gecko validate"];
    case "Toolchain":
      return ["w7s gecko toolchain --pull"];
    case "NotCurrent":
      return ["w7s gecko make sidecar-package"];
    case "Test":
      return ["w7s gecko test --classification release-gate"];
    case "Execution":
      return ["w7s gecko status"];
    default: {
      const _exhaustive: never = phase;
      return [_exhaustive];
    }
  }
}

export function printNextSteps(steps: string[], write: (text: string) => void = console.log): void {
  if (steps.length === 0) {
    return;
  }
  write("");
  write("── Next steps ──");
  write("");
  for (const step of steps) {
    write(`  → ${step}`);
  }
  write("");
}
