import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { getVersion } from "../../version.js";
import { ensureToolchainImage } from "../../toolchain/image.js";
import { fail } from "../../errors/index.js";
import { successPayload } from "../../ux/error-panel.js";

/**
 * Render the Dockerfile from the manifest and build the local image.
 *
 * In 0.1.0 this pulled a published image. There is no published image now: the
 * tag is the sha256 of the rendered Dockerfile, so an image that already exists
 * under that tag is by definition the one this manifest describes, and nothing
 * is rebuilt.
 */
export async function runToolchain(
  _opts: Record<string, unknown>,
  run: RunContext,
): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());

  if (!(await run.ports.engine.available())) {
    fail("Toolchain", "Container engine is unavailable.", {
      hint: "Install Docker or Podman, then retry w7s gecko toolchain.",
    });
  }

  const outcome = await ensureToolchainImage({
    toolchain: ctx.manifest.toolchain,
    stateDir: ctx.paths.stateDir,
    engine: run.ports.engine,
    now: () => run.ports.clock.now(),
    dryRun: run.options.dryRun,
  });

  const image = await run.ports.engine.inspectImage(outcome.tag);
  const payload = successPayload(
    run.command,
    run.startedAt,
    {
      tag: outcome.tag,
      state: outcome.state,
      dockerfile: outcome.dockerfilePath,
      imageId: image?.id ?? null,
      w7sVersion: getVersion(),
    },
    ["w7s gecko make gecko-source"],
  );

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("toolchain", `${outcome.tag} (${outcome.state})`);
    run.log.info("toolchain", `dockerfile ${outcome.dockerfilePath}`);
  }
  return payload;
}
