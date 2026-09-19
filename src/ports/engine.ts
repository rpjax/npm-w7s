export interface EngineRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ImageBuildRequest {
  dockerfilePath: string;
  contextDir: string;
  tag: string;
}

/**
 * Port wrapping the container engine CLI.
 *
 * NOTE, because this inverts a 0.1.0 rule: building an image used to be
 * forbidden here — the image was published and only ever pulled. In 0.2.0 there
 * is no published image, so `build` is the primary operation. What replaces the
 * old prohibition is narrower and still enforced by test: only `src/toolchain/`
 * may call `build`, and it may only build the Dockerfile w7s rendered itself.
 */
export interface ContainerEngine {
  /** Whether the engine binary is available and responsive. */
  available(): Promise<boolean>;

  /** Invoke the engine CLI with the given argv (e.g. ["run", "--rm", ...]). */
  run(argv: string[]): Promise<EngineRunResult>;

  /** Build the rendered toolchain Dockerfile under a content-addressed tag. */
  build(request: ImageBuildRequest): Promise<void>;

  /** Whether an image with this exact tag exists locally. The cache check. */
  imageExists(tag: string): Promise<boolean>;

  /** Inspect an image; null if missing. */
  inspectImage(ref: string): Promise<{ digest: string; id: string } | null>;
}
