import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextStepsForPhase } from "../../src/ux/next-steps.js";
import type { ErrorPhase } from "../../src/errors/index.js";

describe("next steps", () => {
  const phases: ErrorPhase[] = [
    "Cli",
    "Manifest",
    "WorkingTree",
    "Declaration",
    "Toolchain",
    "NotCurrent",
    "Test",
    "Execution",
  ];

  for (const phase of phases) {
    it(`${phase} yields a non-empty next command`, () => {
      const steps = nextStepsForPhase(phase);
      assert.ok(steps.length > 0);
      assert.ok(steps[0]!.trim().length > 0);
    });
  }
});
