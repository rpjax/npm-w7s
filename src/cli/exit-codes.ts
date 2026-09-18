import type { ErrorPhase } from "../errors/index.js";

export const EXIT = {
  Ok: 0,
  Execution: 1,
  Cli: 2,
  WorkingTree: 3,
  Toolchain: 4,
  NotCurrent: 5,
  Declaration: 6,
  Test: 7,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * Maps an error phase to its documented exit code.
 * Exit codes are never chosen at the throw site — only here.
 */
export function exitCodeForPhase(phase: ErrorPhase): ExitCode {
  switch (phase) {
    case "Cli":
    case "Manifest":
      return EXIT.Cli;
    case "WorkingTree":
      return EXIT.WorkingTree;
    case "Toolchain":
      return EXIT.Toolchain;
    case "NotCurrent":
      return EXIT.NotCurrent;
    case "Declaration":
      return EXIT.Declaration;
    case "Test":
      return EXIT.Test;
    case "Execution":
      return EXIT.Execution;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
