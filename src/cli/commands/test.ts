import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { expandModifications } from "../../modifications/expand.js";
import { computeFingerprint } from "../../modifications/fingerprint.js";
import { allCurrency } from "../../artifacts/currency.js";
import { selectTests } from "../../tests/select.js";
import { runTests, assertTestsOk } from "../../tests/run.js";
import { printTestReport, testReportJson } from "../../tests/report.js";
import { getVersion, requiredToolchainImage } from "../../version.js";
import type { TestClassification } from "../../manifest/types.js";
import { fail } from "../../errors/index.js";

export interface TestCommandOpts {
  name?: string[];
  tag?: string[];
  classification?: string;
  arguments?: string;
  list?: boolean;
  stopOnFailure?: boolean;
  continueOnFailure?: boolean;
  strict?: boolean;
}

export async function runTest(opts: TestCommandOpts, run: RunContext): Promise<Record<string, unknown>> {
  if (opts.stopOnFailure && opts.continueOnFailure) {
    fail("Cli", "Pass either --stop-on-failure or --continue-on-failure, not both.");
  }
  if (!opts.stopOnFailure && !opts.continueOnFailure) {
    fail("Cli", "Pass either --stop-on-failure or --continue-on-failure explicitly.", {
      hint: "w7s gecko test --stop-on-failure",
    });
  }

  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const files = expandModifications(ctx.manifest.modifications, ctx.manifestDir);
  const fingerprint = computeFingerprint(getVersion(), files);
  const currency = allCurrency(
    ctx.manifestDir,
    {
      "gecko-source": ctx.paths.geckoSource,
      "gecko-binary": ctx.paths.geckoBinary,
      "sidecar-package": ctx.paths.sidecarPackage,
    },
    fingerprint,
  );

  const selected = selectTests(
    ctx.manifest.tests,
    {
      names: opts.name,
      tags: opts.tag,
      classification: opts.classification as TestClassification | undefined,
    },
    currency,
    { strict: opts.strict },
  );

  if (opts.list) {
    const list = selected.map((s) => ({
      name: s.test.name,
      classification: s.test.classification,
      dependsOn: s.test.dependsOn,
      status: s.status,
      blockReason: s.blockReason ?? null,
      nextCommand: s.nextCommand ?? null,
    }));
    const payload = {
      ok: true,
      command: run.command,
      elapsedSeconds: Number(((Date.now() - run.startedAt) / 1000).toFixed(1)),
      result: { tests: list },
      nextSteps: [],
    };
    if (run.options.json) {
      run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
    } else {
      for (const t of list) {
        run.ports.output.writeStdout(
          `  ${t.classification.padEnd(14)}${t.name.padEnd(32)}${t.status}${t.blockReason ? `  (${t.blockReason})` : ""}\n`,
        );
      }
    }
    return payload;
  }

  const imageRef = requiredToolchainImage();
  if (!(await run.ports.engine.available())) {
    fail("Toolchain", "Container engine is unavailable.", {
      hint: "w7s gecko toolchain --pull",
    });
  }

  const summary = await runTests({
    selected,
    manifestDir: ctx.manifestDir,
    engine: run.ports.engine,
    imageRef,
    clock: run.ports.clock,
    stopOnFailure: Boolean(opts.stopOnFailure),
    strict: Boolean(opts.strict),
    extraArguments: opts.arguments,
    mounts: [
      { host: ctx.paths.geckoSource, container: "/gecko-source", readOnly: true },
      { host: ctx.paths.geckoBinary, container: "/gecko-binary", readOnly: true },
      { host: ctx.manifestDir, container: "/workspace" },
    ],
    dryRun: run.options.dryRun,
  });

  const payload = testReportJson(summary, run.command, Number(((Date.now() - run.startedAt) / 1000).toFixed(1)));

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    printTestReport(summary, run.ports.output);
  }

  if (!summary.ok) {
    assertTestsOk(summary);
  }
  return payload;
}
