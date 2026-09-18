import pc from "picocolors";
import type { Output } from "../ports/output.js";

export interface SessionHeaderOptions {
  version: string;
  command: string;
  manifestBasename?: string;
  flags?: string[];
  color?: boolean;
  output?: Output;
}

function defaultColor(): boolean {
  return pc.isColorSupported && process.stdout.isTTY === true && !process.env.NO_COLOR;
}

export function printSessionHeader(options: SessionHeaderOptions): void {
  const useColor = options.color ?? defaultColor();
  const c = (text: string, style: (v: string) => string) => (useColor ? style(text) : text);
  const out = options.output ?? {
    writeStdout: (t) => process.stdout.write(t),
    writeStderr: (t) => process.stderr.write(t),
  };

  const metaParts = [options.command];
  if (options.manifestBasename) {
    metaParts.push(options.manifestBasename);
  }
  if (options.flags?.length) {
    metaParts.push(options.flags.join(" · "));
  }

  out.writeStdout("\n");
  out.writeStdout(`${c("w7s", pc.bold)}  ${c(`v${options.version}`, pc.dim)}\n`);
  out.writeStdout(c(metaParts.join("  ·  "), pc.dim) + "\n");
  out.writeStdout(c("────────────────────────────────────────", pc.dim) + "\n");
  out.writeStdout("\n");
}
