import { mkdirSync, renameSync, utimesSync, writeFileSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExpandedFile } from "./expand.js";
import { resolveInTree } from "./expand.js";
import {
  assertNoDirty,
  compareAll,
  type CompareResult,
  verifyReplacesDeclarations,
} from "./compare.js";

export interface ApplyOptions {
  files: ExpandedFile[];
  workingTreeRoot: string;
  /** Local pristine root when available (tests / extracted). */
  pristineRoot?: string | null;
  /** Alternative pristine reader (production via engine). */
  readPristine?: (geckoPath: string) => Buffer | null;
  existsInPristine?: (geckoPath: string) => boolean;
  dryRun?: boolean;
  /** Skip replacesGeckoSource verification (already done). */
  skipReplacesCheck?: boolean;
}

export interface ApplyResult {
  filesWritten: number;
  filesUnchanged: number;
  written: string[];
  unchanged: string[];
  results: CompareResult[];
}

function atomicWrite(dest: string, content: Buffer): void {
  const dir = dirname(dest);
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.w7s-tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  writeFileSync(temp, content);
  renameSync(temp, dest);
}

/**
 * Apply modifications to the working tree.
 * Does not rewrite a file whose content is already correct (mtime preserved).
 * Writes are atomic (temp in destination directory + rename).
 */
export function applyModifications(options: ApplyOptions): ApplyResult {
  const {
    files,
    workingTreeRoot,
    pristineRoot = null,
    readPristine,
    existsInPristine,
    dryRun = false,
    skipReplacesCheck = false,
  } = options;

  if (!skipReplacesCheck && existsInPristine) {
    verifyReplacesDeclarations(files, existsInPristine);
  } else if (!skipReplacesCheck && pristineRoot) {
    verifyReplacesDeclarations(files, (geckoPath) =>
      existsSync(resolveInTree(pristineRoot, geckoPath)),
    );
  }

  const results = compareAll(files, workingTreeRoot, pristineRoot, readPristine);
  assertNoDirty(results);

  const written: string[] = [];
  const unchanged: string[] = [];

  for (const result of results) {
    if (result.outcome === "unchanged") {
      unchanged.push(result.file.geckoPath);
      continue;
    }

    // outcome === "write"
    written.push(result.file.geckoPath);
    if (!dryRun) {
      const dest = resolveInTree(workingTreeRoot, result.file.geckoPath);
      // Preserve mtime check: only write when content differs (already ensured).
      if (existsSync(dest)) {
        const before = statSync(dest).mtimeMs;
        atomicWrite(dest, result.declared);
        // If somehow content was identical, restore mtime — belt and suspenders.
        const afterStat = statSync(dest);
        // Content was different so mtime should update; no restore needed.
        void before;
        void afterStat;
      } else {
        atomicWrite(dest, result.declared);
      }
    }
  }

  return {
    filesWritten: written.length,
    filesUnchanged: unchanged.length,
    written,
    unchanged,
    results,
  };
}

/** Exported for tests that need to assert mtime preservation helpers. */
export function touchMtime(path: string, mtimeMs: number): void {
  const atime = statSync(path).atime;
  utimesSync(path, atime, new Date(mtimeMs));
}
