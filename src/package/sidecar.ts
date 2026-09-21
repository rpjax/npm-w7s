import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { fail } from "../errors/index.js";
import type { WorkspacePaths } from "../workspace/paths.js";
import { getVersion } from "../version.js";

export interface PackageBuildJson {
  fingerprint: string;
  w7sVersion: string;
  firefoxVersion: string;
  target: string;
  timestamp: string;
  hashes: {
    "firefox.tar.gz": string;
  };
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Where `mach package` leaves its archive, relative to the object directory. */
export const PACKAGE_DIR = "dist";

/**
 * Find the archive `mach package` produced.
 *
 * Nothing is ever fabricated here. 0.1.0 wrote a placeholder file when the real
 * archive was absent, which meant a build that half-failed still stamped a
 * finished artifact — a path whose only effect is to lie about success. A
 * missing archive is a failure, and it says what it found instead.
 */
export function findPackagedArchive(objdir: string): string | null {
  const distDir = join(objdir, PACKAGE_DIR);
  if (!existsSync(distDir)) {
    return null;
  }
  const candidates = readdirSync(distDir)
    .filter((name) => /^firefox-.*\.tar\.(gz|bz2|xz)$/.test(name))
    .sort();
  const chosen = candidates[0];
  return chosen ? join(distDir, chosen) : null;
}

/** The milestone of the tree that was compiled. Read, never guessed. */
export function readMilestone(geckoSource: string): string {
  const path = join(geckoSource, "config", "milestone.txt");
  if (!existsSync(path)) {
    fail("Execution", `Cannot read the Firefox milestone: ${path} is missing.`, {
      hint: "The tree is not a Gecko checkout, or it was never materialized.",
    });
  }
  const line = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .pop();
  if (!line) {
    fail("Execution", `${path} contains no milestone.`);
  }
  return line!;
}

/**
 * Produce sidecar-package layout:
 *   out/<version>/<target>/firefox.tar.gz
 *   out/<version>/<target>/build.json
 * Nothing else.
 */
export async function writeSidecarPackage(options: {
  paths: WorkspacePaths;
  fingerprint: string;
  timestamp: string;
  dryRun?: boolean;
}): Promise<{ path: string; sizeBytes: number; sha256: string; buildJson: PackageBuildJson }> {
  const { paths, fingerprint, timestamp, dryRun } = options;
  const outDir = paths.sidecarPackage;
  const archivePath = join(outDir, "firefox.tar.gz");
  const buildPath = join(outDir, "build.json");

  if (dryRun) {
    return {
      path: outDir,
      sizeBytes: 0,
      sha256: "",
      buildJson: {
        fingerprint,
        w7sVersion: getVersion(),
        firefoxVersion: "",
        target: paths.target,
        timestamp,
        hashes: { "firefox.tar.gz": "" },
      },
    };
  }

  const produced = findPackagedArchive(paths.geckoBinary);
  if (!produced) {
    fail("Execution", "mach package produced no archive.", {
      detail: existsSync(join(paths.geckoBinary, PACKAGE_DIR))
        ? readdirSync(join(paths.geckoBinary, PACKAGE_DIR)).join("\n")
        : `${join(paths.geckoBinary, PACKAGE_DIR)} does not exist`,
      hint: "w7s gecko make gecko-binary",
    });
  }

  mkdirSync(outDir, { recursive: true });
  copyFileSync(produced!, archivePath);

  const sha = await sha256File(archivePath);
  const buildJson: PackageBuildJson = {
    fingerprint,
    w7sVersion: getVersion(),
    firefoxVersion: readMilestone(paths.geckoSource),
    target: paths.target,
    timestamp,
    hashes: { "firefox.tar.gz": sha },
  };
  writeFileSync(buildPath, `${JSON.stringify(buildJson, null, 2)}\n`, "utf8");

  return {
    path: outDir,
    sizeBytes: statSync(archivePath).size,
    sha256: sha,
    buildJson,
  };
}

export function assertPackageLayout(packageDir: string): string[] {
  const allowed = new Set(["firefox.tar.gz", "build.json"]);
  const entries = readdirSync(packageDir);
  const unexpected = entries.filter((e) => !allowed.has(e));
  if (unexpected.length > 0) {
    fail("Execution", "sidecar-package contains unexpected files.", {
      detail: unexpected,
      hint: "Only firefox.tar.gz and build.json are allowed.",
    });
  }
  for (const req of allowed) {
    if (!entries.includes(req)) {
      fail("Execution", `sidecar-package is missing ${req}.`, {
        hint: "w7s gecko make sidecar-package",
      });
    }
  }
  return entries;
}
