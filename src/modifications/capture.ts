import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fail } from "../errors/index.js";
import type { Modification, W7sManifest } from "../manifest/types.js";
import { expandModifications, resolveInTree, type ExpandedFile } from "./expand.js";
import { buffersEqual, normalizeToLf, verifyReplacesDeclarations } from "./compare.js";

export interface CaptureOptions {
  manifest: W7sManifest;
  manifestDir: string;
  workingTreeRoot: string;
  geckoPath: string;
  intoModification: string;
  existsInPristine: (geckoPath: string) => boolean;
  /** Capture every dirty file into the named modification (directory type only). */
  all?: boolean;
}

export interface CaptureResult {
  captured: string[];
}

function findModification(manifest: W7sManifest, name: string): Modification {
  const mod = manifest.modifications.find((m) => m.name === name);
  if (!mod) {
    fail("Cli", `No modification named "${name}".`, {
      hint: "Pass --into with a modification name from the manifest.",
    });
  }
  return mod!;
}

function localDestFor(
  mod: Modification,
  manifestDir: string,
  geckoPath: string,
): string {
  if (mod.type === "directory") {
    const base = resolve(manifestDir, mod.localPath);
    const geckoBase = mod.geckoPath === "." || mod.geckoPath === "" ? "" : mod.geckoPath.replace(/\\/g, "/");
    let rel = geckoPath.replace(/\\/g, "/");
    if (geckoBase && (rel === geckoBase || rel.startsWith(`${geckoBase}/`))) {
      rel = rel === geckoBase ? "" : rel.slice(geckoBase.length + 1);
    }
    return rel ? join(base, ...rel.split("/")) : base;
  }

  const mapping = mod.files.find((f) => f.geckoPath.replace(/\\/g, "/") === geckoPath.replace(/\\/g, "/"));
  if (!mapping) {
    fail(
      "Declaration",
      `Modification "${mod.name}" does not declare geckoPath "${geckoPath}".`,
      {
        hint: "Add a files mapping, or capture into a directory modification.",
      },
    );
  }
  return resolve(manifestDir, mapping!.localPath);
}

/**
 * Copy a working-tree file into a modification's localPath, verify replacesGeckoSource,
 * then confirm declared == current byte-for-byte.
 */
export function captureWorkingTreeEdit(options: CaptureOptions): CaptureResult {
  const {
    manifest,
    manifestDir,
    workingTreeRoot,
    geckoPath,
    intoModification,
    existsInPristine,
  } = options;

  const mod = findModification(manifest, intoModification);
  const src = resolveInTree(workingTreeRoot, geckoPath);
  if (!existsSync(src)) {
    fail("WorkingTree", `No file at geckoPath "${geckoPath}" in the working tree.`, {
      hint: "Check w7s gecko paths and the path you passed to --file.",
    });
  }

  const dest = localDestFor(mod, manifestDir, geckoPath);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);

  const expanded: ExpandedFile[] = [
    {
      localPath: dest,
      geckoPath: geckoPath.replace(/\\/g, "/"),
      modificationName: mod.name,
      replacesGeckoSource: mod.replacesGeckoSource,
    },
  ];
  verifyReplacesDeclarations(expanded, existsInPristine);

  const declared = normalizeToLf(readFileSync(dest));
  const current = readFileSync(src);
  if (!buffersEqual(declared, normalizeToLf(current)) && !buffersEqual(declared, current)) {
    // After LF normalize of declared, compare against LF-normalized current for equality check.
    const currentLf = normalizeToLf(current);
    if (!buffersEqual(declared, currentLf)) {
      fail("Declaration", `Capture of "${geckoPath}" is incomplete — declared does not equal current.`, {
        detail: relative(manifestDir, dest),
        hint: "Inspect the captured file and the working-tree copy.",
      });
    }
    // Write LF-normalized declared back so future compares match.
    // The working tree should also be LF; write declared (LF) to working tree via the same path.
  }

  // Ensure working tree matches declared (LF).
  const currentLf = normalizeToLf(current);
  if (!buffersEqual(declared, currentLf)) {
    fail("Declaration", `Capture of "${geckoPath}" is incomplete — declared does not equal current.`, {
      hint: "Inspect the captured file and the working-tree copy.",
    });
  }

  return { captured: [geckoPath] };
}

export function expandForFingerprint(manifest: W7sManifest, manifestDir: string): ExpandedFile[] {
  return expandModifications(manifest.modifications, manifestDir);
}
