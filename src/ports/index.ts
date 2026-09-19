export type { ContainerEngine, EngineRunResult, ImageBuildRequest } from "./engine.js";
export type { GitPort } from "./git.js";
export type { Clock } from "./clock.js";
export { SystemClock } from "./clock.js";
export type { Host } from "./host.js";
export { SystemHost } from "./host.js";
export type { Output } from "./output.js";
export { ProcessOutput } from "./output.js";

import type { ContainerEngine } from "./engine.js";
import type { GitPort } from "./git.js";
import type { Clock } from "./clock.js";
import { SystemClock } from "./clock.js";
import type { Host } from "./host.js";
import { SystemHost } from "./host.js";
import type { Output } from "./output.js";
import { ProcessOutput } from "./output.js";

export interface Ports {
  engine: ContainerEngine;
  git: GitPort;
  clock: Clock;
  host: Host;
  output: Output;
}

export function createSystemPorts(engine: ContainerEngine, git: GitPort): Ports {
  return {
    engine,
    git,
    clock: new SystemClock(),
    host: new SystemHost(),
    output: new ProcessOutput(),
  };
}
