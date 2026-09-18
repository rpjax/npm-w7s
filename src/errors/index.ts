export type ErrorPhase =
  | "Cli"
  | "Manifest"
  | "WorkingTree"
  | "Declaration"
  | "Toolchain"
  | "NotCurrent"
  | "Test"
  | "Execution";

export interface W7sErrorOptions {
  cause?: unknown;
  hint?: string;
  detail?: string | string[];
}

export class W7sError extends Error {
  readonly phase: ErrorPhase;
  readonly hint?: string;
  readonly detail?: string | string[];
  readonly causeText?: string;

  constructor(phase: ErrorPhase, message: string, options: W7sErrorOptions = {}) {
    super(message);
    this.name = "W7sError";
    this.phase = phase;
    this.hint = options.hint;
    this.detail = options.detail;
    this.causeText =
      options.cause instanceof Error
        ? options.cause.message
        : options.cause !== undefined
          ? String(options.cause)
          : undefined;
  }
}

export class ManifestDiscoveryError extends Error {
  readonly detail?: string;
  readonly hint?: string;

  constructor(message: string, options: { detail?: string; hint?: string } = {}) {
    super(message);
    this.name = "ManifestDiscoveryError";
    this.detail = options.detail;
    this.hint = options.hint;
  }
}

export function fail(phase: ErrorPhase, message: string, options: W7sErrorOptions = {}): never {
  throw new W7sError(phase, message, options);
}
