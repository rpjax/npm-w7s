import type { ArtifactName, TestDeclaration, TestClassification } from "../manifest/types.js";
import type { CurrencyReport } from "../artifacts/currency.js";

export interface TestSelectors {
  names?: string[];
  tags?: string[];
  classification?: TestClassification;
}

export type TestRunStatus = "selected" | "blocked" | "excluded";

export interface SelectedTest {
  test: TestDeclaration;
  index: number;
  status: TestRunStatus;
  blockReason?: string;
  nextCommand?: string;
}

function matchesSelectors(test: TestDeclaration, selectors: TestSelectors): boolean {
  if (selectors.classification && test.classification !== selectors.classification) {
    return false;
  }
  if (selectors.names && selectors.names.length > 0) {
    if (!selectors.names.includes(test.name)) {
      return false;
    }
  }
  if (selectors.tags && selectors.tags.length > 0) {
    const tags = test.tags ?? [];
    if (!selectors.tags.some((t) => tags.includes(t))) {
      return false;
    }
  }
  return true;
}

function dependencyBlock(
  test: TestDeclaration,
  currency: CurrencyReport[],
): { reason: string; nextCommand: string } | null {
  for (const dep of test.dependsOn) {
    const report = currency.find((c) => c.name === dep);
    if (!report || report.status !== "current") {
      return {
        reason: `needs ${dep}`,
        nextCommand: `w7s gecko make ${dep}`,
      };
    }
  }
  return null;
}

/**
 * Select tests in declaration order. Dependency gating marks blocked, not failed.
 * --strict excludes diagnostics from the count (caller handles).
 */
export function selectTests(
  tests: TestDeclaration[],
  selectors: TestSelectors,
  currency: CurrencyReport[],
  options: { strict?: boolean } = {},
): SelectedTest[] {
  const selected: SelectedTest[] = [];

  tests.forEach((test, index) => {
    if (!matchesSelectors(test, selectors)) {
      return;
    }

    if (options.strict && test.classification === "diagnostic") {
      selected.push({ test, index, status: "excluded" });
      return;
    }

    const block = dependencyBlock(test, currency);
    if (block) {
      selected.push({
        test,
        index,
        status: "blocked",
        blockReason: block.reason,
        nextCommand: block.nextCommand,
      });
      return;
    }

    selected.push({ test, index, status: "selected" });
  });

  return selected;
}

export function artifactCurrencyMap(
  reports: CurrencyReport[],
): Partial<Record<ArtifactName, CurrencyReport>> {
  const map: Partial<Record<ArtifactName, CurrencyReport>> = {};
  for (const r of reports) {
    map[r.name] = r;
  }
  return map;
}
