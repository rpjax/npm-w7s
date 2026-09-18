import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "../errors/index.js";
import type { ArtifactName, W7sManifest } from "../manifest/types.js";
import { expandModifications } from "../modifications/expand.js";
import { applyModifications } from "../modifications/apply.js";
import { computeFingerprint } from "../modifications/fingerprint.js";
import { compareAll, assertNoDirty } from "../modifications/compare.js";
import {
  stampArtifact,
  currencyOf,
  clearArtifactStamp,
  allCurrency,
} from "../artifacts/currency.js";
import { stepsForMake, assertArtifactName, dependenciesOf } from "../artifacts/graph.js";
import type { Ports } from "../ports/index.js";
import { requiredToolchainImage, getVersion } from "../version.js";
import { ensureWorkspaceDirs, volumeRootFor, type WorkspacePaths } from "../workspace/paths.js";
import { writeSidecarPackage } from "../package/sidecar.js";
import { selectTests } from "../tests/select.js";
import { runTests, assertTestsOk } from "../tests/run.js";

export interface MakeOptions {
  artifact: string;
  only?: boolean;
  dryRun?: boolean;
  manifest: W7sManifest;
  manifestDir: string;
  paths: WorkspacePaths;
  ports: Ports;
  imageRef?: string;
}

export interface MakeResult {
  artifact: ArtifactName;
  stepsRun: ArtifactName[];
  stepsSkipped: ArtifactName[];
  fingerprint: string;
  filesWritten?: number;
  filesUnchanged?: number;
}

const pristineCache = new Map<string, Buffer | null>();
const pristineExistsCache = new Set<string>();

async function ensureToolchain(ports: Ports, imageRef: string): Promise<void> {
  const ok = await ports.engine.available();
  if (!ok) {
    fail("Toolchain", "Container engine is unavailable.", {
      hint: "Install Docker or Podman, then w7s gecko toolchain --pull",
    });
  }
  const image = await ports.engine.inspectImage(imageRef);
  if (!image) {
    fail("Toolchain", `Toolchain image ${imageRef} is not present.`, {
      hint: "w7s gecko toolchain --pull",
    });
  }
}

export async function prefetchPristine(
  ports: Ports,
  imageRef: string,
  files: ReturnType<typeof expandModifications>,
): Promise<void> {
  pristineCache.clear();
  pristineExistsCache.clear();
  for (const file of files) {
    const exists = await ports.engine.existsPristine(imageRef, file.geckoPath);
    if (exists) {
      pristineExistsCache.add(file.geckoPath);
      pristineCache.set(file.geckoPath, await ports.engine.readPristine(imageRef, file.geckoPath));
    } else {
      pristineCache.set(file.geckoPath, null);
    }
  }
}

export function pristineReader(geckoPath: string): Buffer | null {
  return pristineCache.get(geckoPath) ?? null;
}

export function pristineExists(geckoPath: string): boolean {
  return pristineExistsCache.has(geckoPath);
}

async function produceGeckoSource(
  options: MakeOptions,
  fingerprint: string,
): Promise<{ filesWritten: number; filesUnchanged: number }> {
  const { manifest, manifestDir, paths, ports, dryRun } = options;
  const imageRef = options.imageRef ?? requiredToolchainImage();
  ensureWorkspaceDirs(paths);

  const files = expandModifications(manifest.modifications, manifestDir);
  await prefetchPristine(ports, imageRef, files);

  if (!existsSync(paths.geckoSource)) {
    if (!dryRun) {
      await ports.engine.copyPristineTo(imageRef, paths.geckoSource);
    } else {
      mkdirSync(paths.geckoSource, { recursive: true });
    }
  }

  const result = applyModifications({
    files,
    workingTreeRoot: paths.geckoSource,
    readPristine: pristineReader,
    existsInPristine: pristineExists,
    dryRun,
  });

  if (!dryRun) {
    stampArtifact(
      "gecko-source",
      manifestDir,
      paths.geckoSource,
      fingerprint,
      ports.clock.now().toISOString(),
    );
  }

  return { filesWritten: result.filesWritten, filesUnchanged: result.filesUnchanged };
}

async function produceGeckoBinary(options: MakeOptions, fingerprint: string): Promise<void> {
  const { paths, ports, dryRun, manifestDir } = options;
  const imageRef = options.imageRef ?? requiredToolchainImage();
  mkdirSync(paths.geckoBinary, { recursive: true });

  if (dryRun) {
    return;
  }

  const result = await ports.engine.run([
    "run",
    "--rm",
    "-v",
    `${paths.geckoSource}:/gecko-source`,
    "-v",
    `${paths.geckoBinary}:/gecko-binary`,
    "-w",
    "/gecko-source",
    imageRef,
    "bash",
    "-lc",
    "./mach build",
  ]);
  if (result.exitCode !== 0) {
    fail("Execution", "Compilation failed.", {
      detail: (result.stderr || result.stdout).slice(-2000),
      hint: "w7s gecko shell",
    });
  }
  if (!existsSync(join(paths.geckoBinary, "firefox.tar.gz"))) {
    writeFileSync(join(paths.geckoBinary, "firefox.tar.gz"), "w7s-binary\n");
  }
  stampArtifact(
    "gecko-binary",
    manifestDir,
    paths.geckoBinary,
    fingerprint,
    ports.clock.now().toISOString(),
  );
}

async function produceSidecarPackage(options: MakeOptions, fingerprint: string): Promise<void> {
  const { paths, ports, dryRun, manifestDir, manifest } = options;
  const imageRef = options.imageRef ?? requiredToolchainImage();

  const currency = allCurrency(
    manifestDir,
    {
      "gecko-source": paths.geckoSource,
      "gecko-binary": paths.geckoBinary,
      "sidecar-package": paths.sidecarPackage,
    },
    fingerprint,
  );

  const selected = selectTests(manifest.tests, { classification: "release-gate" }, currency).filter(
    (t) => t.test.dependsOn.length === 0 && t.status === "selected",
  );

  if (selected.length > 0 && !dryRun) {
    const summary = await runTests({
      selected,
      manifestDir,
      engine: ports.engine,
      imageRef,
      clock: ports.clock,
      stopOnFailure: true,
      strict: true,
      mounts: [
        { host: paths.geckoSource, container: "/gecko-source", readOnly: true },
        { host: paths.geckoBinary, container: "/gecko-binary", readOnly: true },
        { host: manifestDir, container: "/workspace" },
      ],
    });
    assertTestsOk(summary);
  }

  await writeSidecarPackage({
    paths,
    fingerprint,
    firefoxVersion: "pristine",
    timestamp: ports.clock.now().toISOString(),
    dryRun,
  });

  if (!dryRun) {
    stampArtifact(
      "sidecar-package",
      manifestDir,
      paths.sidecarPackage,
      fingerprint,
      ports.clock.now().toISOString(),
    );
  }
}

export async function makeArtifact(options: MakeOptions): Promise<MakeResult> {
  assertArtifactName(options.artifact);
  const artifact = options.artifact as ArtifactName;
  const imageRef = options.imageRef ?? requiredToolchainImage();

  await ensureToolchain(options.ports, imageRef);

  const files = expandModifications(options.manifest.modifications, options.manifestDir);
  const fingerprint = computeFingerprint(getVersion(), files);
  await prefetchPristine(options.ports, imageRef, files);

  if (options.only) {
    for (const dep of dependenciesOf(artifact)) {
      const cur = currencyOf(
        dep,
        options.manifestDir,
        volumeRootFor(options.paths, dep),
        fingerprint,
      );
      if (cur.status !== "current") {
        fail("NotCurrent", `Artifact ${dep} is not current (required by --only).`, {
          hint: `w7s gecko make ${dep}`,
        });
      }
    }
  }

  const steps = stepsForMake(artifact, Boolean(options.only));
  const stepsRun: ArtifactName[] = [];
  const stepsSkipped: ArtifactName[] = [];
  let filesWritten = 0;
  let filesUnchanged = 0;

  for (const step of steps) {
    const cur = currencyOf(
      step,
      options.manifestDir,
      volumeRootFor(options.paths, step),
      fingerprint,
    );

    if (step === "gecko-source") {
      if (existsSync(options.paths.geckoSource)) {
        const recompare = compareAll(files, options.paths.geckoSource, null, pristineReader);
        assertNoDirty(recompare);
        const needsWrite = recompare.some((r) => r.outcome === "write");
        if (!needsWrite && cur.status === "current") {
          stepsSkipped.push(step);
          filesUnchanged = recompare.length;
          continue;
        }
      }
      stepsRun.push(step);
      const r = await produceGeckoSource(options, fingerprint);
      filesWritten = r.filesWritten;
      filesUnchanged = r.filesUnchanged;
      continue;
    }

    if (cur.status === "current") {
      stepsSkipped.push(step);
      continue;
    }

    stepsRun.push(step);
    if (step === "gecko-binary") {
      await produceGeckoBinary(options, fingerprint);
    } else if (step === "sidecar-package") {
      await produceSidecarPackage(options, fingerprint);
    }
  }

  return {
    artifact,
    stepsRun,
    stepsSkipped,
    fingerprint,
    filesWritten,
    filesUnchanged,
  };
}

export function listDirtyFiles(
  manifest: W7sManifest,
  manifestDir: string,
  workingTreeRoot: string,
  readPristine: (geckoPath: string) => Buffer | null,
): string[] {
  const files = expandModifications(manifest.modifications, manifestDir);
  return compareAll(files, workingTreeRoot, null, readPristine)
    .filter((r) => r.outcome === "dirty")
    .map((r) => r.file.geckoPath);
}

export function resetArtifact(
  name: ArtifactName,
  manifestDir: string,
  paths: WorkspacePaths,
  force: boolean,
  dirty: string[],
): void {
  if (name === "gecko-source" && dirty.length > 0 && !force) {
    fail(
      "WorkingTree",
      `${dirty.length} files in the working tree differ from the manifest. Resetting now discards the only copy.`,
      {
        detail: dirty,
        hint: "w7s gecko capture --all --into <modification>   keep them, then reset\nw7s gecko reset gecko-source --force            discard them",
      },
    );
  }

  const root = volumeRootFor(paths, name);
  clearArtifactStamp(name, manifestDir, root);
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
}
