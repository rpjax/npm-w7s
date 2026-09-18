import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { currencyOf } from "../../artifacts/currency.js";
import { expandModifications } from "../../modifications/expand.js";
import { computeFingerprint } from "../../modifications/fingerprint.js";
import { getVersion, requiredToolchainImage } from "../../version.js";
import { fail } from "../../errors/index.js";
import { successPayload } from "../../ux/error-panel.js";

const SIDECAR_STATE = "sidecar.json";

export async function runStart(run: RunContext): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const files = expandModifications(ctx.manifest.modifications, ctx.manifestDir);
  const fingerprint = computeFingerprint(getVersion(), files);
  const cur = currencyOf("gecko-binary", ctx.manifestDir, ctx.paths.geckoBinary, fingerprint);
  if (cur.status !== "current") {
    fail("NotCurrent", "gecko-binary is not current.", {
      hint: "w7s gecko make gecko-binary",
    });
  }

  const imageRef = requiredToolchainImage();
  const name = "w7s-sidecar-local";
  if (!run.options.dryRun) {
    await run.ports.engine.run(["rm", "-f", name]);
    const result = await run.ports.engine.run([
      "run",
      "-d",
      "--name",
      name,
      "-v",
      `${ctx.paths.geckoBinary}:/gecko-binary:ro`,
      imageRef,
      "bash",
      "-lc",
      "sleep infinity",
    ]);
    if (result.exitCode !== 0) {
      fail("Execution", "Failed to start sidecar.", {
        detail: result.stderr || result.stdout,
        hint: "w7s gecko stop",
      });
    }
    mkdirSync(ctx.paths.stateDir, { recursive: true });
    writeFileSync(
      join(ctx.paths.stateDir, SIDECAR_STATE),
      JSON.stringify({ name, startedAt: run.ports.clock.now().toISOString() }, null, 2),
    );
  }

  const payload = successPayload(run.command, run.startedAt, { container: name }, [
    "w7s gecko stop",
  ]);
  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("start", `sidecar container ${name} started`);
  }
  return payload;
}

export async function runStop(run: RunContext): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const stateFile = join(ctx.paths.stateDir, SIDECAR_STATE);
  let name = "w7s-sidecar-local";
  if (existsSync(stateFile)) {
    try {
      name = (JSON.parse(readFileSync(stateFile, "utf8")) as { name: string }).name;
    } catch {
      // keep default
    }
  }

  if (!run.options.dryRun) {
    await run.ports.engine.run(["rm", "-f", name]);
    if (existsSync(stateFile)) {
      unlinkSync(stateFile);
    }
  }

  const payload = successPayload(run.command, run.startedAt, { container: name }, []);
  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("stop", `sidecar container ${name} stopped`);
  }
  return payload;
}
