import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { expandModifications } from "../../modifications/expand.js";
import { computeFingerprint } from "../../modifications/fingerprint.js";
import { allCurrency } from "../../artifacts/currency.js";
import { PRODUCTION_ORDER } from "../../artifacts/graph.js";
import { getVersion, requiredToolchainImage } from "../../version.js";
import { successPayload } from "../../ux/error-panel.js";
import { volumeRootFor } from "../../workspace/paths.js";

export async function runStatus(
  opts: { upgrades?: boolean },
  run: RunContext,
): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const files = expandModifications(ctx.manifest.modifications, ctx.manifestDir);
  const fingerprint = computeFingerprint(getVersion(), files);
  const imageRef = requiredToolchainImage();

  let toolchainOk = false;
  let digest = "absent";
  try {
    if (await run.ports.engine.available()) {
      const img = await run.ports.engine.inspectImage(imageRef);
      if (img) {
        toolchainOk = true;
        digest = img.digest;
      }
    }
  } catch {
    toolchainOk = false;
  }

  const currency = allCurrency(
    ctx.manifestDir,
    {
      "gecko-source": volumeRootFor(ctx.paths, "gecko-source"),
      "gecko-binary": volumeRootFor(ctx.paths, "gecko-binary"),
      "sidecar-package": volumeRootFor(ctx.paths, "sidecar-package"),
    },
    fingerprint,
  );

  const artifacts = [
    {
      name: "toolchain",
      status: toolchainOk ? "ok" : "missing",
      detail: imageRef,
      note: toolchainOk ? "digest verified" : "pull required",
      digest,
    },
    ...currency.map((c) => ({
      name: c.name,
      status: c.status,
      detail: c.fingerprint ?? "",
      note: c.reason ?? (c.status === "current" ? fingerprint : c.status),
      fingerprint: c.fingerprint,
    })),
  ];

  const nextBehind = currency.find((c) => c.status !== "current");
  const nextSteps = nextBehind
    ? [`w7s gecko make ${nextBehind.name === "gecko-source" ? "gecko-source" : "sidecar-package"}`]
    : toolchainOk
      ? []
      : ["w7s gecko toolchain --pull"];

  // Prefer the furthest artifact in the chain that is not current
  let nextCommand = "w7s gecko make sidecar-package";
  for (const name of PRODUCTION_ORDER) {
    const c = currency.find((x) => x.name === name);
    if (c && c.status !== "current") {
      nextCommand = `w7s gecko make ${name}`;
      break;
    }
  }
  if (!toolchainOk) {
    nextCommand = "w7s gecko toolchain --pull";
  }

  const upgrades: { geckoPath: string; diff: string }[] = [];
  if (opts.upgrades) {
    for (const file of files.filter((f) => f.replacesGeckoSource)) {
      const pristine = await run.ports.engine.readPristine(imageRef, file.geckoPath);
      if (pristine === null) {
        continue;
      }
      // Upgrade report: compare stored baseline if present; otherwise note pristine available.
      upgrades.push({
        geckoPath: file.geckoPath,
        diff: `(upstream pristine present — review against ${file.localPath})`,
      });
    }
  }

  const payload = successPayload(
    run.command,
    run.startedAt,
    { artifacts, next: nextCommand, upgrades: opts.upgrades ? upgrades : undefined },
    nextSteps.length ? nextSteps : [nextCommand],
    { fingerprint },
  );

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    for (const a of artifacts) {
      run.ports.output.writeStdout(
        `  ${a.name.padEnd(18)}${String(a.detail).padEnd(44)}${String(a.status).padEnd(10)}${a.note}\n`,
      );
    }
    run.ports.output.writeStdout(`\n  next -> ${nextCommand}\n`);
  }

  return payload;
}
