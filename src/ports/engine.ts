export interface EngineRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Port wrapping the container engine CLI.
 * Production code never shells out to docker/podman except through this port.
 * A fake that receives a `build` invocation fails the test (L5).
 */
export interface ContainerEngine {
  /** Whether the engine binary is available and responsive. */
  available(): Promise<boolean>;

  /**
   * Invoke the engine CLI with the given argv (e.g. ["run", "--rm", ...]).
   * Must never be called with a build subcommand by production code.
   */
  run(argv: string[]): Promise<EngineRunResult>;

  /** Inspect an image; null if missing. */
  inspectImage(ref: string): Promise<{ digest: string; id: string } | null>;

  /** Pull an image by reference. */
  pull(ref: string): Promise<void>;

  /**
   * Read a file from /gecko-pristine inside the toolchain image.
   * Returns null if the path does not exist.
   */
  readPristine(imageRef: string, geckoPath: string): Promise<Buffer | null>;

  /** Whether a path exists under /gecko-pristine in the toolchain image. */
  existsPristine(imageRef: string, geckoPath: string): Promise<boolean>;

  /**
   * Copy the pristine tree into a host directory (initialize gecko-source).
   */
  copyPristineTo(imageRef: string, hostDest: string): Promise<void>;
}
