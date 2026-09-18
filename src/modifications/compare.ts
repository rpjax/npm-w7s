import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fail } from "../errors/index.js";
import type { ExpandedFile } from "./expand.js";
import { resolveInTree } from "./expand.js";

export type CompareOutcome = "unchanged" | "write" | "dirty";

export interface CompareResult {
  file: ExpandedFile;
  outcome: CompareOutcome;
  declared: Buffer;
  current: Buffer | null;
  pristine: Buffer | null;
}

/** Normalize declared content to LF before comparison and writing. */
export function normalizeToLf(content: Buffer | string): Buffer {
  const text = typeof content === "string" ? content : content.toString("utf8");
  return Buffer.from(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
}

export function contentHash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function buffersEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

function readOptional(path: string): Buffer | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path);
}

/**
 * Compare one file: current vs declared vs pristine.
 * Outcomes from docs/03-applying.md:
 *   current == declared  -> unchanged
 *   current == pristine  -> write
 *   otherwise            -> dirty (WorkingTree)
 */
export function compareFile(
  file: ExpandedFile,
  workingTreeRoot: string,
  pristineRoot: string | null,
  pristineContent: Buffer | null | undefined,
): CompareResult {
  const declared = normalizeToLf(readFileSync(file.localPath));
  const currentPath = resolveInTree(workingTreeRoot, file.geckoPath);
  const current = readOptional(currentPath);

  let pristine: Buffer | null = null;
  if (pristineContent !== undefined) {
    pristine = pristineContent;
  } else if (pristineRoot) {
    pristine = readOptional(resolveInTree(pristineRoot, file.geckoPath));
  }

  // Only `declared` is LF-normalized (docs/03-applying.md). current and pristine are compared raw.
  if (current !== null && buffersEqual(current, declared)) {
    return { file, outcome: "unchanged", declared, current, pristine };
  }

  if (current === null) {
    return { file, outcome: "write", declared, current, pristine };
  }

  if (pristine !== null && buffersEqual(current, pristine)) {
    return { file, outcome: "write", declared, current, pristine };
  }

  return { file, outcome: "dirty", declared, current, pristine };
}

export function compareAll(
  files: ExpandedFile[],
  workingTreeRoot: string,
  pristineRoot: string | null,
  readPristine?: (geckoPath: string) => Buffer | null,
): CompareResult[] {
  return files.map((file) => {
    const pristineContent = readPristine ? readPristine(file.geckoPath) : undefined;
    return compareFile(file, workingTreeRoot, pristineRoot, pristineContent);
  });
}

export function assertNoDirty(results: CompareResult[]): void {
  const dirty = results.filter((r) => r.outcome === "dirty");
  if (dirty.length === 0) {
    return;
  }
  fail("WorkingTree", `${dirty.length} file(s) in the working tree differ from the manifest.`, {
    detail: dirty.map((d) => d.file.geckoPath),
    hint: "w7s gecko capture --file <geckoPath> --into <modification>   keep them\nw7s gecko reset gecko-source --force            discard them",
  });
}

/**
 * Verify replacesGeckoSource in both directions against the pristine tree.
 */
export function verifyReplacesDeclarations(
  files: ExpandedFile[],
  existsInPristine: (geckoPath: string) => boolean,
): void {
  for (const file of files) {
    const exists = existsInPristine(file.geckoPath);
    if (file.replacesGeckoSource && !exists) {
      fail(
        "Declaration",
        `Modification "${file.modificationName}" declares replacesGeckoSource: true, but "${file.geckoPath}" does not exist in the pristine tree.`,
        {
          detail: file.geckoPath,
          hint: "Set replacesGeckoSource to false, or correct geckoPath.",
        },
      );
    }
    if (!file.replacesGeckoSource && exists) {
      fail(
        "Declaration",
        `Modification "${file.modificationName}" declares replacesGeckoSource: false, but "${file.geckoPath}" exists in the pristine tree.`,
        {
          detail: file.geckoPath,
          hint: "Set replacesGeckoSource to true, or correct geckoPath.",
        },
      );
    }
  }
}
