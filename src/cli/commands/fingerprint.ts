import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { expandModifications } from "../../modifications/expand.js";
import { computeFingerprint } from "../../modifications/fingerprint.js";
import { getVersion } from "../../version.js";
import { successPayload } from "../../ux/error-panel.js";

export async function runFingerprint(run: RunContext): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const files = expandModifications(ctx.manifest.modifications, ctx.manifestDir);
  const fingerprint = computeFingerprint(getVersion(), files);

  const payload = successPayload(run.command, run.startedAt, { fingerprint }, [], {
    fingerprint,
  });

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.ports.output.writeStdout(`${fingerprint}\n`);
  }
  return payload;
}
