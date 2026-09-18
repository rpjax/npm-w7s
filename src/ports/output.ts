/**
 * Port wrapping stdout and stderr so the single-JSON-document guarantee can be asserted.
 */
export interface Output {
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export class ProcessOutput implements Output {
  writeStdout(text: string): void {
    process.stdout.write(text);
  }

  writeStderr(text: string): void {
    process.stderr.write(text);
  }
}
