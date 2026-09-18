import { mkdirSync, writeFileSync, cpSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Build pristine-tiny in a fresh temp directory (unique per call).
 * The fixture is generated, never shared or versioned.
 */
export function buildPristineTiny(): string {
  const dest = mkdtempSync(join(tmpdir(), "w7s-pristine-"));

  mkdirSync(join(dest, "dom", "base"), { recursive: true });
  mkdirSync(join(dest, "ipc"), { recursive: true });
  mkdirSync(join(dest, "media"), { recursive: true });
  mkdirSync(join(dest, "a", "b", "c", "d"), { recursive: true });
  mkdirSync(join(dest, "config"), { recursive: true });
  mkdirSync(join(dest, "docshell", "base"), { recursive: true });

  writeFileSync(
    join(dest, "dom", "base", "Document.cpp"),
    "// pristine Document.cpp\nint x = 1;\n",
  );
  writeFileSync(join(dest, "dom", "base", "Document.h"), "// pristine Document.h\n");
  writeFileSync(join(dest, "moz.build"), "# pristine moz.build\nDIRS += ['dom']\n");
  writeFileSync(join(dest, "ipc", "PSpeculum.ipdl"), "// pristine ipdl\n");
  writeFileSync(join(dest, "media", "crlf.txt"), Buffer.from("line1\r\nline2\r\n", "utf8"));
  writeFileSync(join(dest, "a", "b", "c", "d", "deep.txt"), "deep pristine\n");
  writeFileSync(join(dest, "mach"), "#!/usr/bin/env python3\nprint('mach')\n");
  writeFileSync(join(dest, "config", "milestone.txt"), "153.2.0\n");
  writeFileSync(join(dest, "docshell", "base", "BrowsingContext.cpp"), "// pristine BC\n");
  writeFileSync(join(dest, "README.txt"), "firefox pristine fixture\n");

  return dest;
}

/** Copy a freshly built pristine-tiny into `dest`. */
export function copyPristineTiny(dest: string): string {
  const src = buildPristineTiny();
  try {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
  } finally {
    rmSync(src, { recursive: true, force: true });
  }
  return dest;
}
