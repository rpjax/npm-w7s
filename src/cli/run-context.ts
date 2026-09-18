import type { Logger } from "../logger/index.js";
import type { Ports } from "../ports/index.js";
import type { GlobalOptions } from "./options.js";

export interface RunContext {
  log: Logger;
  ports: Ports;
  options: GlobalOptions;
  command: string;
  startedAt: number;
}

export function createRunContext(
  options: GlobalOptions,
  ports: Ports,
  log: Logger,
  command: string,
): RunContext {
  return {
    log,
    ports,
    options,
    command,
    startedAt: log.startedAt,
  };
}
