import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { makeArtifact } from "../../pipeline/make.js";
import { successPayload } from "../../ux/error-panel.js";
import { printNextSteps } from "../../ux/next-steps.js";

export async function runMake(
  artifact: string,
  opts: { only?: boolean },
  run: RunContext,
): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const result = await makeArtifact({
    artifact,
    only: opts.only,
    dryRun: run.options.dryRun,
    manifest: ctx.manifest,
    manifestDir: ctx.manifestDir,
    paths: ctx.paths,
    ports: run.ports,
  });

  const nextSteps =
    result.artifact === "sidecar-package"
      ? ["dockup deploy — package the released image"]
      : [`w7s gecko make ${result.artifact === "gecko-source" ? "gecko-binary" : "sidecar-package"}`];

  const payload = successPayload(
    run.command,
    run.startedAt,
    {
      artifact: result.artifact,
      stepsRun: result.stepsRun,
      stepsSkipped: result.stepsSkipped,
      filesWritten: result.filesWritten ?? 0,
      filesUnchanged: result.filesUnchanged ?? 0,
    },
    nextSteps,
    { fingerprint: result.fingerprint },
  );

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("make", `${result.artifact} ready · fingerprint ${result.fingerprint}`);
    if (result.stepsSkipped.length) {
      run.log.info("make", `skipped current: ${result.stepsSkipped.join(", ")}`);
    }
    printNextSteps(nextSteps, (t) => run.ports.output.writeStdout(`${t}\n`));
  }

  return payload;
}
