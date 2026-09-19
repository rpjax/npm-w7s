import { existsSync, statSync } from "node:fs";
import type { RunContext } from "../run-context.js";
import { loadValidatedManifest } from "../context.js";
import { assertArtifactName } from "../../artifacts/graph.js";
import type { ArtifactName } from "../../manifest/types.js";
import { artifactPathFor, containerPathFor, toPosixPath } from "../../workspace/paths.js";
import { expandModifications } from "../../modifications/expand.js";
import { computeFingerprint } from "../../modifications/fingerprint.js";
import { getVersion } from "../../version.js";
import { successPayload } from "../../ux/error-panel.js";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";

async function fileSha(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (c) => hash.update(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function runPaths(
  opts: { artifact?: string },
  run: RunContext,
): Promise<Record<string, unknown>> {
  const ctx = loadValidatedManifest(run.options, run.ports.host.cwd());
  const files = expandModifications(ctx.manifest.modifications, ctx.manifestDir);
  const fingerprint = computeFingerprint(getVersion(), files);

  if (opts.artifact) {
    assertArtifactName(opts.artifact);
    const name = opts.artifact as ArtifactName;
    const host = artifactPathFor(ctx.paths, name);
    const container = containerPathFor(name);
    let sizeBytes = 0;
    let sha256 = "";
    if (name === "sidecar-package" && existsSync(join(host, "firefox.tar.gz"))) {
      const archive = join(host, "firefox.tar.gz");
      sizeBytes = statSync(archive).size;
      sha256 = await fileSha(archive);
    }

    const result = {
      artifact: name,
      path: host,
      pathPosix: toPosixPath(host),
      containerPath: container,
      sizeBytes,
      sha256,
      fingerprint,
      w7sVersion: getVersion(),
      target: ctx.paths.target,
    };

    const payload = successPayload(run.command, run.startedAt, result, [], { fingerprint });
    if (run.options.json) {
      // Provider contract: flat fields for dockup
      run.ports.output.writeStdout(
        `${JSON.stringify({
          ok: true,
          command: run.command,
          path: host,
          sizeBytes,
          sha256,
          fingerprint,
          w7sVersion: getVersion(),
          target: ctx.paths.target,
          elapsedSeconds: payload.elapsedSeconds,
          result,
          nextSteps: [],
        })}\n`,
      );
    } else {
      run.ports.output.writeStdout(`  ${name}\n`);
      run.ports.output.writeStdout(`    host       ${host}\n`);
      run.ports.output.writeStdout(`    container  ${container}\n`);
      run.ports.output.writeStdout(`    target     ${ctx.paths.target}\n`);
    }
    return payload;
  }

  const all = (["gecko-source", "gecko-binary", "sidecar-package"] as ArtifactName[]).map(
    (name) => ({
      artifact: name,
      host: artifactPathFor(ctx.paths, name),
      container: containerPathFor(name),
    }),
  );

  const payload = successPayload(
    run.command,
    run.startedAt,
    { paths: all, target: ctx.paths.target },
    [],
    {
      fingerprint,
    },
  );

  if (run.options.json) {
    run.ports.output.writeStdout(`${JSON.stringify(payload)}\n`);
  } else {
    run.ports.output.writeStdout(`  target  ${ctx.paths.target}\n\n`);
    for (const p of all) {
      run.ports.output.writeStdout(`  ${p.artifact}\n`);
      run.ports.output.writeStdout(`    host       ${p.host}\n`);
      run.ports.output.writeStdout(`    container  ${p.container}\n`);
    }
  }
  return payload;
}
