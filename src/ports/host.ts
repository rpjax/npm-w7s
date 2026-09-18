/**
 * Port wrapping platform and environment. Windows/Linux path behaviour is a tested axis.
 */
export interface Host {
  platform(): NodeJS.Platform;
  env(name: string): string | undefined;
  cwd(): string;
  homedir(): string;
  isStdoutTTY(): boolean;
  pathSep(): string;
}

export class SystemHost implements Host {
  platform(): NodeJS.Platform {
    return process.platform;
  }

  env(name: string): string | undefined {
    return process.env[name];
  }

  cwd(): string {
    return process.cwd();
  }

  homedir(): string {
    return process.env.HOME ?? process.env.USERPROFILE ?? "";
  }

  isStdoutTTY(): boolean {
    return process.stdout.isTTY === true;
  }

  pathSep(): string {
    return process.platform === "win32" ? "\\" : "/";
  }
}
