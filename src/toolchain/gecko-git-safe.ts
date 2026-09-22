/**
 * Git refuses a bind-mounted tree whose uid/gid is not the container user
 * ("detected dubious ownership"). Every container command that runs git or mach
 * against /gecko-source must mark that path safe first.
 *
 * `extraCommands` in the consumer manifest cannot substitute for this: they bake
 * into the image after a rebuild, while bootstrap / mach run against a host tree.
 */
export const GECKO_GIT_SAFE_DIRECTORY_COMMANDS = [
  "git config --global --add safe.directory /gecko-source",
  "git config --global --add safe.directory '*'",
] as const;

/** Prefix a single bash command with the safe.directory markers. */
export function withGeckoGitSafeDirectory(command: string): string {
  return [...GECKO_GIT_SAFE_DIRECTORY_COMMANDS, command].join(" && ");
}

/** Insert the markers after an optional `set -…` line, before the rest of a script. */
export function scriptWithGeckoGitSafeDirectory(lines: string[]): string {
  if (lines.length === 0) {
    return GECKO_GIT_SAFE_DIRECTORY_COMMANDS.join(" && ");
  }
  const [first, ...rest] = lines;
  if (first.startsWith("set ")) {
    return [first, ...GECKO_GIT_SAFE_DIRECTORY_COMMANDS, ...rest].join(" && ");
  }
  return [...GECKO_GIT_SAFE_DIRECTORY_COMMANDS, ...lines].join(" && ");
}
