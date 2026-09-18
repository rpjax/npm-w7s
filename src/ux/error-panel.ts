import pc from "picocolors";
import type { W7sError, ErrorPhase } from "../errors/index.js";
import { exitCodeForPhase } from "../cli/exit-codes.js";
import type { Output } from "../ports/output.js";
import { nextStepsForPhase } from "./next-steps.js";

export interface ErrorPanelOptions {
  err: W7sError;
  startedAt: number;
  color?: boolean;
  output?: Output;
}

function defaultColor(): boolean {
  return pc.isColorSupported && process.stdout.isTTY === true && !process.env.NO_COLOR;
}

function detailLines(detail: string | string[] | undefined): string[] {
  if (detail === undefined) {
    return [];
  }
  return Array.isArray(detail) ? detail : detail.split("\n");
}

/**
 * Every failure prints the cause and, on the next line, the command that addresses it.
 */
export function printErrorPanel(options: ErrorPanelOptions): void {
  const useColor = options.color ?? defaultColor();
  const c = (text: string, style: (v: string) => string) => (useColor ? style(text) : text);
  const out = options.output ?? {
    writeStdout: (t) => process.stdout.write(t),
    writeStderr: (t) => process.stderr.write(t),
  };
  const { err } = options;
  const elapsedSec = ((Date.now() - options.startedAt) / 1000).toFixed(1);
  const exitCode = exitCodeForPhase(err.phase);

  out.writeStdout(`\n${useColor ? pc.bold("── Error ──") : "── Error ──"}\n\n`);
  out.writeStdout(c(`  ✖  [${err.phase}] ${err.message}`, pc.red) + "\n");
  out.writeStdout("\n");

  for (const line of detailLines(err.detail)) {
    out.writeStdout(`       │ ${line}\n`);
  }
  if (err.detail) {
    out.writeStdout("\n");
  }

  if (err.causeText) {
    out.writeStdout(`       │ Cause: ${err.causeText}\n\n`);
  }

  const hint = err.hint ?? nextStepsForPhase(err.phase)[0];
  if (hint) {
    out.writeStdout(c(`       ↳ ${hint}`, pc.yellow) + "\n\n");
  }

  out.writeStdout(`  Elapsed  ${elapsedSec}s\n`);
  out.writeStdout(`  Exit     ${exitCode}\n\n`);
}

export function jsonDetail(detail: string | string[] | undefined): string | string[] | null {
  if (detail === undefined) {
    return null;
  }
  return detail;
}

export function failurePayload(
  err: W7sError,
  command: string,
  startedAt: number,
): Record<string, unknown> {
  return {
    ok: false,
    command,
    phase: err.phase,
    message: err.message,
    hint: err.hint ?? nextStepsForPhase(err.phase)[0] ?? null,
    detail: jsonDetail(err.detail),
    elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    exitCode: exitCodeForPhase(err.phase),
  };
}

export function successPayload(
  command: string,
  startedAt: number,
  result: Record<string, unknown>,
  nextSteps: string[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    command,
    elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    result,
    nextSteps,
    ...extra,
  };
}

export type { ErrorPhase };
