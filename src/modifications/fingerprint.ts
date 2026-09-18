import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { contentHash, normalizeToLf } from "./compare.js";
import type { ExpandedFile } from "./expand.js";

/**
 * fingerprint = sha256( w7s version || every (geckoPath, content hash), sorted )[0:12]
 * Stable across platforms: geckoPath uses posix separators; content is LF-normalized.
 */
export function computeFingerprint(w7sVersion: string, files: ExpandedFile[]): string {
  const pairs = files
    .map((file) => {
      const declared = normalizeToLf(readFileSync(file.localPath));
      return { geckoPath: file.geckoPath, hash: contentHash(declared) };
    })
    .sort((a, b) => (a.geckoPath < b.geckoPath ? -1 : a.geckoPath > b.geckoPath ? 1 : 0));

  const payload = [
    w7sVersion,
    ...pairs.map((p) => `${p.geckoPath}\n${p.hash}`),
  ].join("\n");

  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 12);
}
