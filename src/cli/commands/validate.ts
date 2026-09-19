import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunContext } from "../run-context.js";
import { resolveManifestPath } from "../context.js";
import { loadManifest } from "../../manifest/load.js";
import { validateManifest } from "../../manifest/schema.js";
import { expandModifications } from "../../modifications/expand.js";
import { verifyReplacesDeclarations } from "../../modifications/compare.js";
import { dirname } from "node:path";
import { existsPristine } from "../../gecko/pristine.js";
import { successPayload } from "../../ux/error-panel.js";
import { fail } from "../../errors/index.js";
import { resolveWorkspace } from "../../workspace/paths.js";

export async function runValidate(run: RunContext): Promise<Record<string, unknown>> {
  const cwd = run.ports.host.cwd();
  const manifestPath = resolveManifestPath(run.options, cwd);
  const raw = loadManifest(manifestPath);
  validateManifest(raw);

  const manifestDir = dirname(manifestPath);
  const files = expandModifications(raw.modifications, manifestDir);
  const paths = resolveWorkspace(manifestDir, raw);

  let pristineChecked = false;
  let unchecked: string[] = [];

  const treeReady = await run.ports.git.ok(["rev-parse", "--git-dir"], paths.geckoSource);

  if (treeReady) {
    const exists = (geckoPath: string) =>
      existsPristine(run.ports.git, paths.geckoSource, raw.gecko.commit, geckoPath);
    // verifyReplacesDeclarations is sync — prefetch
    const existsSet = new Set<string>();
    for (const f of files) {
      if (await exists(f.geckoPath)) {
        existsSet.add(f.geckoPath);
      }
    }
    verifyReplacesDeclarations(files, (p) => existsSet.has(p));
    pristineChecked = true;
  } else {
    unchecked = files.map((f) => f.geckoPath);
  }

  // Generated paths must be gitignored by the consumer when a .gitignore exists
  const gitignorePath = join(manifestDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gi = readFileSync(gitignorePath, "utf8");
    const hasOut = /(^|[\n/])out\/?(\n|$)/m.test(gi) || gi.includes("out/");
    const hasW7s = gi.includes(".w7s");
    if (!hasOut || !hasW7s) {
      fail(
        "Manifest",
        "validate fails if out/ and .w7s/ are not ignored by the consumer's repository.",
        {
          hint: "Add out/ and .w7s/ to .gitignore",
        },
      );
    }
  }

  const payload = successPayload(
    run.command,
    run.startedAt,
    {
      manifestPath,
      modifications: files.length,
      pristineChecked,
      unchecked,
    },
    pristineChecked ? ["w7s gecko make gecko-source"] : ["w7s gecko make gecko-source"],
  );

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.log.ok("validate", `manifest ok · ${files.length} files`);
    if (!pristineChecked) {
      run.log.warn(
        "validate",
        `pristine comparison unchecked (${unchecked.length} paths) — tree not materialized yet`,
      );
    }
  }
  return payload;
}
