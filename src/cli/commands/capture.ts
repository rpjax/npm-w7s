import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { captureWorkingTreeEdit } from "../../modifications/capture.js";
import { expandModifications } from "../../modifications/expand.js";
import { compareAll } from "../../modifications/compare.js";
import { TOOLCHAIN_IMAGE_DIGEST } from "../../version.js";
import { fail } from "../../errors/index.js";
import { successPayload } from "../../ux/error-panel.js";
import { prefetchPristine, pristineExists, pristineReader } from "../../pipeline/make.js";

export async function runCapture(
  opts: { file?: string; into?: string; all?: boolean },
  run: RunContext,
): Promise<Record<string, unknown>> {
  if (!opts.into) {
    fail("Cli", "Pass --into <modification>.", {
      hint: 'w7s gecko capture --file <geckoPath> --into "modification name"',
    });
  }
  if (!opts.file && !opts.all) {
    fail("Cli", "Pass --file <geckoPath> or --all.", {
      hint: 'w7s gecko capture --file <geckoPath> --into "modification name"',
    });
  }

  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const imageRef = TOOLCHAIN_IMAGE_DIGEST;
  const files = expandModifications(ctx.manifest.modifications, ctx.manifestDir);
  await prefetchPristine(run.ports, imageRef, files);

  const captured: string[] = [];

  if (opts.all) {
    const dirty = compareAll(files, ctx.paths.geckoSource, null, pristineReader)
      .filter((r) => r.outcome === "dirty")
      .map((r) => r.file.geckoPath);
    for (const geckoPath of dirty) {
      const result = captureWorkingTreeEdit({
        manifest: ctx.manifest,
        manifestDir: ctx.manifestDir,
        workingTreeRoot: ctx.paths.geckoSource,
        geckoPath,
        intoModification: opts.into!,
        existsInPristine: pristineExists,
      });
      captured.push(...result.captured);
    }
  } else {
    const result = captureWorkingTreeEdit({
      manifest: ctx.manifest,
      manifestDir: ctx.manifestDir,
      workingTreeRoot: ctx.paths.geckoSource,
      geckoPath: opts.file!,
      intoModification: opts.into!,
      existsInPristine: pristineExists,
    });
    captured.push(...result.captured);
  }

  const payload = successPayload(run.command, run.startedAt, { captured }, [
    "w7s gecko make gecko-source",
  ]);
  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("capture", `captured ${captured.length} file(s) into "${opts.into}"`);
  }
  return payload;
}
