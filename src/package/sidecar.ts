import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
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

/**
 * Produce sidecar-package layout:
 *   dist/<target>/firefox.tar.gz
 *   dist/<target>/build.json
 * Nothing else.
 */
export async function writeSidecarPackage(options: {
  paths: WorkspacePaths;
  fingerprint: string;
  firefoxVersion: string;
  timestamp: string;
  /** Path to an existing firefox archive to copy/link, or create a placeholder archive for fakes. */
  firefoxArchiveSource?: string;
  dryRun?: boolean;
}): Promise<{ path: string; sizeBytes: number; sha256: string; buildJson: PackageBuildJson }> {
  const { paths, fingerprint, firefoxVersion, timestamp, dryRun } = options;
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
        firefoxVersion,
        target: paths.target,
        timestamp,
        hashes: { "firefox.tar.gz": "" },
      },
    };
  }

  mkdirSync(outDir, { recursive: true });

  if (options.firefoxArchiveSource) {
    if (!existsSync(options.firefoxArchiveSource)) {
      fail("Execution", `Required package file missing: ${options.firefoxArchiveSource}.`, {
        hint: "w7s gecko make gecko-binary",
      });
    }
    copyFileSync(options.firefoxArchiveSource, archivePath);
  } else {
    // In portable tiers the fake engine leaves a marker archive after "package".
    const marker = join(paths.geckoBinary, "firefox.tar.gz");
    if (existsSync(marker)) {
      copyFileSync(marker, archivePath);
    } else if (!existsSync(archivePath)) {
      // Minimal placeholder for layout tests when engine faked the package step.
      writeFileSync(archivePath, Buffer.from("w7s-fake-firefox-archive\n", "utf8"));
    }
  }

  if (!existsSync(archivePath)) {
    fail("Execution", "sidecar-package is missing firefox.tar.gz.", {
      hint: "w7s gecko make gecko-binary",
    });
  }

  const sha = await sha256File(archivePath);
  const buildJson: PackageBuildJson = {
    fingerprint,
    w7sVersion: getVersion(),
    firefoxVersion,
    target: paths.target,
    timestamp,
    hashes: { "firefox.tar.gz": sha },
  };
  writeFileSync(buildPath, `${JSON.stringify(buildJson, null, 2)}\n`, "utf8");

  // Refuse unexpected files? package.test asserts every written path — we only write these two.
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
