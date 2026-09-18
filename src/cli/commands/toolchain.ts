import type { RunContext } from "../run-context.js";
import { requiredToolchainImage, getVersion } from "../../version.js";
import { fail } from "../../errors/index.js";
import { successPayload } from "../../ux/error-panel.js";

export async function runToolchain(
  opts: { pull?: boolean },
  run: RunContext,
): Promise<Record<string, unknown>> {
  if (!opts.pull) {
    fail("Cli", "Pass --pull to fetch the toolchain image this w7s version requires.", {
      hint: "w7s gecko toolchain --pull",
    });
  }

  const imageRef = requiredToolchainImage();
  if (!(await run.ports.engine.available())) {
    fail("Toolchain", "Container engine is unavailable.", {
      hint: "Install Docker or Podman, then retry w7s gecko toolchain --pull",
    });
  }

  if (!run.options.dryRun) {
    await run.ports.engine.pull(imageRef);
  }

  const image = await run.ports.engine.inspectImage(imageRef);
  const payload = successPayload(
    run.command,
    run.startedAt,
    {
      image: imageRef,
      digest: image?.digest ?? null,
      w7sVersion: getVersion(),
    },
    ["w7s gecko make gecko-source"],
  );

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("toolchain", `${imageRef}`);
    if (image) {
      run.log.info("toolchain", `digest ${image.digest}`);
    }
  }
  return payload;
}
