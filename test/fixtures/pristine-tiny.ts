import { mkdirSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const fixturePristineTiny = join(here, "pristine-tiny");

/**
 * Build pristine-tiny: shapes that matter for apply/compare tests.
 */
export function buildPristineTiny(dest: string = fixturePristineTiny): string {
  mkdirSync(join(dest, "dom", "base"), { recursive: true });
  mkdirSync(join(dest, "ipc"), { recursive: true });
  mkdirSync(join(dest, "media"), { recursive: true });
  mkdirSync(join(dest, "a", "b", "c", "d"), { recursive: true });
  mkdirSync(join(dest, "config"), { recursive: true });
  mkdirSync(join(dest, "docshell", "base"), { recursive: true });

  writeFileSync(join(dest, "dom", "base", "Document.cpp"), "// pristine Document.cpp\nint x = 1;\n");
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

export function copyPristineTiny(dest: string): string {
  if (!existsSync(join(fixturePristineTiny, "mach"))) {
    buildPristineTiny(fixturePristineTiny);
  }
  mkdirSync(dest, { recursive: true });
  cpSync(fixturePristineTiny, dest, { recursive: true });
  return dest;
}

buildPristineTiny(fixturePristineTiny);
