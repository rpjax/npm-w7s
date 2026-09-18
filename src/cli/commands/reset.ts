import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { assertArtifactName } from "../../artifacts/graph.js";
import type { ArtifactName } from "../../manifest/types.js";
import { expandModifications } from "../../modifications/expand.js";
import {
  resetArtifact,
  listDirtyFiles,
  prefetchPristine,
  pristineReader,
} from "../../pipeline/make.js";
import { TOOLCHAIN_IMAGE_DIGEST } from "../../version.js";
import { fail } from "../../errors/index.js";
import { successPayload } from "../../ux/error-panel.js";

export async function runReset(
  artifact: string,
  opts: { force?: boolean },
  run: RunContext,
): Promise<Record<string, unknown>> {
  assertArtifactName(artifact);
  const name = artifact as ArtifactName;

  if (name === "gecko-source" && opts.force && !run.options.yes && !run.ports.host.isStdoutTTY()) {
    fail("Cli", "Refusing reset --force outside a terminal without -y/--yes.", {
      hint: "w7s gecko reset gecko-source --force -y",
    });
  }

  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const imageRef = TOOLCHAIN_IMAGE_DIGEST;
  const files = expandModifications(ctx.manifest.modifications, ctx.manifestDir);

  let dirty: string[] = [];
  if (name === "gecko-source") {
    try {
      await prefetchPristine(run.ports, imageRef, files);
      dirty = listDirtyFiles(ctx.manifest, ctx.manifestDir, ctx.paths.geckoSource, pristineReader);
    } catch {
      dirty = [];
    }
  }

  if (!run.options.dryRun) {
    resetArtifact(name, ctx.manifestDir, ctx.paths, Boolean(opts.force), dirty);
  }

  const payload = successPayload(run.command, run.startedAt, { artifact: name, discarded: dirty }, [
    `w7s gecko make ${name}`,
  ]);
  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("reset", `${name} discarded`);
  }
  return payload;
}
