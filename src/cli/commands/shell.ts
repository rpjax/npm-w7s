import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { ensureToolchainImage } from "../../toolchain/image.js";
import { fail } from "../../errors/index.js";
import { successPayload } from "../../ux/error-panel.js";
import { dockerVolumeSpec } from "../../engine/mount.js";

export async function runShell(
  command: string[] | undefined,
  run: RunContext,
): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const imageRef = (
    await ensureToolchainImage({
      toolchain: ctx.manifest.toolchain,
      stateDir: ctx.paths.stateDir,
      engine: run.ports.engine,
      now: () => run.ports.clock.now(),
      dryRun: run.options.dryRun,
    })
  ).tag;

  if (!(await run.ports.engine.available())) {
    fail("Toolchain", "Container engine is unavailable.", {
      hint: "w7s gecko toolchain",
    });
  }

  const cmd = command && command.length > 0 ? command : ["bash"];
  const argv = [
    "run",
    "--rm",
    "-it",
    "-v",
    dockerVolumeSpec(ctx.paths.geckoSource, "/gecko-source", undefined, run.ports.engine),
    "-v",
    dockerVolumeSpec(ctx.manifestDir, "/workspace", undefined, run.ports.engine),
    "-e",
    "PYTHONUNBUFFERED=1",
    "-w",
    "/gecko-source",
    imageRef,
    ...cmd,
  ];

  if (run.options.dryRun) {
    const payload = successPayload(run.command, run.startedAt, { argv }, []);
    if (run.options.json) {
      run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
    } else {
      run.log.info("shell", argv.join(" "));
    }
    return payload;
  }

  const result = await run.ports.engine.run(argv);
  const payload = successPayload(run.command, run.startedAt, { exitCode: result.exitCode }, []);

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else if (result.exitCode !== 0) {
    fail("Execution", "Shell command failed.", {
      detail: result.stderr || result.stdout,
      hint: "w7s gecko shell",
    });
  }
  return payload;
}
