import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fail } from "../errors/index.js";
import type { ArtifactName, W7sManifest } from "../manifest/types.js";
import { expandModifications } from "../modifications/expand.js";
import { applyModifications } from "../modifications/apply.js";
import { computeFingerprint } from "../modifications/fingerprint.js";
import { compareAll, assertNoDirty } from "../modifications/compare.js";
import { stampArtifact, currencyOf, clearArtifactStamp } from "../artifacts/currency.js";
import { stepsForMake, assertArtifactName, dependenciesOf } from "../artifacts/graph.js";
import type { Ports } from "../ports/index.js";
import { getVersion } from "../version.js";
import { ensureToolchainImage } from "../toolchain/image.js";
import { materialize } from "../gecko/source.js";
import {
  ensureBootstrapped,
  mozbuildStateDir,
  MOZBUILD_CONTAINER_PATH,
} from "../toolchain/bootstrap.js";
import { renderMozconfig, OBJDIR_CONTAINER_PATH } from "../toolchain/mozconfig.js";
import { readPristine, existsPristine as pristineInGit } from "../gecko/pristine.js";
import { ensureWorkspaceDirs, volumeRootFor, type WorkspacePaths } from "../workspace/paths.js";
import { writeSidecarPackage } from "../package/sidecar.js";
import {
  dockerVolumeSpec,
  ensureVolumeMount,
  exportPackagedArchiveFromVolume,
  materializeIntoVolume,
  usesDockerVolumeBackend,
} from "../engine/mount.js";

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

/**
 * Make the toolchain image exist. In 0.1.0 this checked that a published image
 * had been pulled; now it renders the Dockerfile from the manifest and builds it
 * locally if an image with that content-addressed tag is not already present.
 */
async function ensureToolchain(options: MakeOptions): Promise<string> {
  const ok = await options.ports.engine.available();
  if (!ok) {
    fail("Toolchain", "Container engine is unavailable.", {
      hint: "Install Docker or Podman, then retry.",
    });
  }
  const outcome = await ensureToolchainImage({
    toolchain: options.manifest.toolchain,
    stateDir: options.paths.stateDir,
    engine: options.ports.engine,
    now: () => options.ports.clock.now(),
    dryRun: options.dryRun,
  });
  return outcome.tag;
}

/**
 * Load the committed bytes of every declared path, straight out of the tree's
 * object database. `git show <commit>:<path>` cannot drift with the working
 * tree, which is why nothing has to be cached alongside it or mounted read-only.
 */
export async function prefetchPristine(
  ports: Ports,
  treeDir: string,
  commit: string,
  files: ReturnType<typeof expandModifications>,
): Promise<void> {
  pristineCache.clear();
  pristineExistsCache.clear();
  for (const file of files) {
    if (await pristineInGit(ports.git, treeDir, commit, file.geckoPath)) {
      pristineExistsCache.add(file.geckoPath);
      pristineCache.set(
        file.geckoPath,
        await readPristine(ports.git, treeDir, commit, file.geckoPath),
      );
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
  ensureWorkspaceDirs(paths);

  let pristineChecked = false;
  if (!dryRun) {
    if (usesDockerVolumeBackend(paths.geckoSource, ports.engine)) {
      if (manifest.modifications.length > 0) {
        fail(
          "Toolchain",
          "Modifications on a Windows drive require the tree on a WSL filesystem.",
          {
            detail:
              "NTFS workspaces store the Gecko tree in a Docker volume; applying host-side modifications needs a bind-mounted tree.",
            hint: "Move the manifest to \\\\wsl$\\Ubuntu\\home\\… or keep modifications empty for a smoke build.",
          },
        );
      }
      const imageRef = options.imageRef ?? (await ensureToolchain(options));
      await materializeIntoVolume({
        engine: ports.engine,
        imageRef,
        hostTreeDir: paths.geckoSource,
        repository: manifest.gecko.repository,
        commit: manifest.gecko.commit,
      });
      // Volume trees are verified inside the container; pristine git show on the
      // host marker is unavailable. Empty modifications skip that path above.
      pristineChecked = false;
    } else {
      await materialize(
        {
          git: (args, cwd) => ports.git.text(args, cwd),
          exists: (path) => existsSync(path),
        },
        paths.geckoSource,
        manifest.gecko,
      );
      pristineChecked = true;
    }
  } else if (await ports.git.ok(["rev-parse", "--git-dir"], paths.geckoSource)) {
    pristineChecked = true;
  } else if (!existsSync(paths.geckoSource)) {
    mkdirSync(paths.geckoSource, { recursive: true });
  }

  const files = expandModifications(manifest.modifications, manifestDir);
  if (pristineChecked) {
    await prefetchPristine(ports, paths.geckoSource, manifest.gecko.commit, files);
  }

  const result = applyModifications({
    files,
    workingTreeRoot: paths.geckoSource,
    readPristine: pristineReader,
    existsInPristine: pristineExists,
    dryRun,
    skipReplacesCheck: !pristineChecked,
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
  const { paths, ports, dryRun, manifestDir, manifest } = options;
  mkdirSync(paths.geckoBinary, { recursive: true });

  if (dryRun) {
    return;
  }

  const imageRef = options.imageRef ?? (await ensureToolchain(options));

  await ensureVolumeMount(ports.engine, paths.geckoSource);
  await ensureVolumeMount(ports.engine, paths.geckoBinary);

  await ensureBootstrapped({
    engine: ports.engine,
    imageRef,
    stateDir: paths.stateDir,
    toolchainTag: imageRef,
    geckoSource: paths.geckoSource,
    now: () => ports.clock.now(),
  });

  const mozbuildDir = mozbuildStateDir(paths.stateDir, imageRef);
  const sccacheDir = join(paths.stateDir, "sccache");
  mkdirSync(sccacheDir, { recursive: true });
  await ensureVolumeMount(ports.engine, mozbuildDir);
  await ensureVolumeMount(ports.engine, sccacheDir);

  // The mozconfig lives beside the tree, not inside it: the tree is the verified
  // commit plus declared modifications, and nothing else may appear in it.
  const mozconfigPath = join(paths.stateDir, "mozconfig", `${paths.version}.mozconfig`);
  mkdirSync(dirname(mozconfigPath), { recursive: true });
  writeFileSync(mozconfigPath, renderMozconfig(manifest.toolchain), "utf8");

  const mounts = [
    "-v",
    dockerVolumeSpec(paths.geckoSource, "/gecko-source", undefined, ports.engine),
    "-v",
    dockerVolumeSpec(paths.geckoBinary, OBJDIR_CONTAINER_PATH, undefined, ports.engine),
    "-v",
    dockerVolumeSpec(mozbuildDir, MOZBUILD_CONTAINER_PATH, undefined, ports.engine),
    "-v",
    dockerVolumeSpec(sccacheDir, "/cache/sccache", undefined, ports.engine),
    "-v",
    dockerVolumeSpec(mozconfigPath, "/w7s.mozconfig", "ro", ports.engine),
    "-e",
    `MOZBUILD_STATE_PATH=${MOZBUILD_CONTAINER_PATH}`,
    "-e",
    "MOZCONFIG=/w7s.mozconfig",
    "-e",
    "PYTHONUNBUFFERED=1",
    "-w",
    "/gecko-source",
  ];

  const build = await ports.engine.run([
    "run",
    "--rm",
    ...mounts,
    imageRef,
    "bash",
    "-lc",
    "./mach build",
  ]);
  if (build.exitCode !== 0) {
    fail("Execution", "Compilation failed.", {
      detail: (build.stderr || build.stdout).slice(-2000),
      hint: "w7s gecko shell",
    });
  }

  const pack = await ports.engine.run([
    "run",
    "--rm",
    ...mounts,
    imageRef,
    "bash",
    "-lc",
    "./mach package",
  ]);
  if (pack.exitCode !== 0) {
    fail("Execution", "Packaging failed.", {
      detail: (pack.stderr || pack.stdout).slice(-2000),
      hint: "w7s gecko shell",
    });
  }

  await exportPackagedArchiveFromVolume({
    engine: ports.engine,
    imageRef,
    hostObjdir: paths.geckoBinary,
  });

  stampArtifact(
    "gecko-binary",
    manifestDir,
    paths.geckoBinary,
    fingerprint,
    ports.clock.now().toISOString(),
  );
}

async function produceSidecarPackage(options: MakeOptions, fingerprint: string): Promise<void> {
  const { paths, ports, dryRun, manifestDir } = options;

  await writeSidecarPackage({
    paths,
    fingerprint,
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

  const files = expandModifications(options.manifest.modifications, options.manifestDir);
  const fingerprint = computeFingerprint(getVersion(), files);

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
