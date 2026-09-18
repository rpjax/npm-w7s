import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fail } from "../errors/index.js";
import type { Modification } from "../manifest/types.js";

export interface ExpandedFile {
  /** Absolute path on the host (repository side). */
  localPath: string;
  /** Path relative to the gecko tree root (posix separators). */
  geckoPath: string;
  /** Modification entry that claimed this destination. */
  modificationName: string;
  replacesGeckoSource: boolean;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function joinGeckoPath(base: string, rel: string): string {
  const baseNorm = base === "." || base === "" ? "" : toPosix(base).replace(/\/+$/, "");
  const relNorm = toPosix(rel).replace(/^\/+/, "");
  if (!baseNorm) {
    return relNorm;
  }
  if (!relNorm) {
    return baseNorm;
  }
  return `${baseNorm}/${relNorm}`;
}

function expandDirectory(
  mod: Extract<Modification, { type: "directory" }>,
  manifestDir: string,
): ExpandedFile[] {
  const localRoot = resolve(manifestDir, mod.localPath);
  let files: string[];
  try {
    files = walkFiles(localRoot);
  } catch (err) {
    fail("Declaration", `Modification "${mod.name}" localPath is not readable.`, {
      cause: err,
      detail: localRoot,
      hint: `Check that ${mod.localPath} exists relative to the manifest.`,
    });
  }

  return files!.map((abs) => {
    const rel = relative(localRoot, abs);
    return {
      localPath: abs,
      geckoPath: joinGeckoPath(mod.geckoPath, rel),
      modificationName: mod.name,
      replacesGeckoSource: mod.replacesGeckoSource,
    };
  });
}

function expandFiles(
  mod: Extract<Modification, { type: "files" }>,
  manifestDir: string,
): ExpandedFile[] {
  return mod.files.map((mapping) => ({
    localPath: resolve(manifestDir, mapping.localPath),
    geckoPath: toPosix(mapping.geckoPath).replace(/^\/+/, ""),
    modificationName: mod.name,
    replacesGeckoSource: mod.replacesGeckoSource,
  }));
}

/**
 * Expand modifications into a flat list of (localPath, geckoPath).
 * Two entries claiming the same geckoPath is a Declaration error naming both.
 */
export function expandModifications(
  modifications: Modification[],
  manifestDir: string,
): ExpandedFile[] {
  const expanded: ExpandedFile[] = [];
  const claimed = new Map<string, ExpandedFile>();

  for (const mod of modifications) {
    const files = mod.type === "directory" ? expandDirectory(mod, manifestDir) : expandFiles(mod, manifestDir);
    for (const file of files) {
      const prior = claimed.get(file.geckoPath);
      if (prior) {
        fail(
          "Declaration",
          `Two modifications claim geckoPath "${file.geckoPath}".`,
          {
            detail: [`"${prior.modificationName}"`, `"${file.modificationName}"`],
            hint: "Give each destination to exactly one modification entry.",
          },
        );
      }
      claimed.set(file.geckoPath, file);
      expanded.push(file);
    }
  }

  return expanded;
}

export function normalizeGeckoPath(geckoPath: string): string {
  return toPosix(geckoPath).replace(/^\/+/, "");
}

export function resolveInTree(treeRoot: string, geckoPath: string): string {
  const norm = normalizeGeckoPath(geckoPath);
  return resolve(treeRoot, ...norm.split("/"));
}
