export interface GlobalOptions {
  manifest?: string;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  dryRun: boolean;
  yes: boolean;
  noColor: boolean;
  timeout?: number;
}

export interface CommanderGlobalOpts {
  manifest?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  noColor?: boolean;
  timeout?: string;
}

export function globalFromCommander(opts: CommanderGlobalOpts): GlobalOptions {
  return {
    manifest: opts.manifest,
    json: Boolean(opts.json),
    quiet: Boolean(opts.quiet),
    verbose: Boolean(opts.verbose),
    dryRun: Boolean(opts.dryRun),
    yes: Boolean(opts.yes),
    noColor: Boolean(opts.noColor),
    timeout: opts.timeout !== undefined ? Number(opts.timeout) : undefined,
  };
}

export function mergeCommanderGlobal(
  root: CommanderGlobalOpts,
  local: CommanderGlobalOpts,
): CommanderGlobalOpts {
  return {
    manifest: local.manifest ?? root.manifest,
    json: Boolean(local.json || root.json),
    quiet: Boolean(local.quiet || root.quiet),
    verbose: Boolean(local.verbose || root.verbose),
    dryRun: Boolean(local.dryRun || root.dryRun),
    yes: Boolean(local.yes || root.yes),
    noColor: Boolean(local.noColor || root.noColor),
    timeout: local.timeout ?? root.timeout,
  };
}
