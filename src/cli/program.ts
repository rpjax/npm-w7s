import { Command } from "commander";
import { basename } from "node:path";
import { W7sError } from "../errors/index.js";
import { Logger } from "../logger/index.js";
import { EXIT, exitCodeForPhase, type ExitCode } from "./exit-codes.js";
import {
  globalFromCommander,
  mergeCommanderGlobal,
  type CommanderGlobalOpts,
  type GlobalOptions,
} from "./options.js";
import { createRunContext, type RunContext } from "./run-context.js";
import { createSystemPorts, type Ports } from "../ports/index.js";
import { DockerEngine } from "../engine/docker.js";
import { getVersion, TOOLCHAIN_IMAGE_TAG } from "../version.js";
import { printErrorPanel, failurePayload } from "../ux/error-panel.js";
import { printSessionHeader } from "../ux/session.js";
import { nextStepsForPhase } from "../ux/next-steps.js";
import { runMake } from "./commands/make.js";
import { runStatus } from "./commands/status.js";
import { runPaths } from "./commands/paths.js";
import { runFingerprint } from "./commands/fingerprint.js";
import { runValidate } from "./commands/validate.js";
import { runShell } from "./commands/shell.js";
import { runToolchain } from "./commands/toolchain.js";
import { runCapture } from "./commands/capture.js";
import { runReset } from "./commands/reset.js";

export interface AppDeps {
  ports?: Ports;
}

interface AppRunContext {
  global: CommanderGlobalOpts;
  run: RunContext;
  ports: Ports;
}

function createLogger(global: GlobalOptions, ports: Ports): Logger {
  return new Logger({
    json: global.json,
    quiet: global.quiet,
    verbose: global.verbose,
    output: ports.output,
    color: !global.noColor && !global.json,
  });
}

function createAppRunContext(deps: AppDeps = {}): AppRunContext {
  const ports = deps.ports ?? createSystemPorts(new DockerEngine());
  const global: CommanderGlobalOpts = {};
  const options = globalFromCommander(global);
  const log = createLogger(options, ports);
  return {
    global,
    ports,
    run: createRunContext(options, ports, log, "gecko"),
  };
}

function addGlobalOptions(command: Command): Command {
  return command
    .option("--manifest <path>", "use this manifest instead of discovering one")
    .option("--json", "machine-readable output")
    .option("-q, --quiet", "errors and warnings only")
    .option("-v, --verbose", "debug logging")
    .option("--dry-run", "write nothing; print what would happen")
    .option("-y, --yes", "assume yes; required for refusing commands outside a terminal")
    .option("--no-color", "plain output")
    .option("--timeout <seconds>", "per-step timeout");
}

export function handleFatal(err: unknown, run: RunContext, json: boolean): ExitCode {
  if (err instanceof W7sError) {
    const werr =
      err.hint !== undefined
        ? err
        : new W7sError(err.phase, err.message, {
            hint: nextStepsForPhase(err.phase)[0],
            detail: err.detail,
            cause: err.causeText,
          });
    if (json) {
      run.ports.output.writeStdout(
        `${JSON.stringify(failurePayload(werr, run.command, run.startedAt))}\n`,
      );
    } else {
      printErrorPanel({
        err: werr,
        startedAt: run.startedAt,
        output: run.ports.output,
        color: !run.options.noColor,
      });
    }
    return exitCodeForPhase(werr.phase);
  }

  const message = err instanceof Error ? err.message : String(err);
  const runtimeErr = new W7sError("Execution", "Unexpected error.", {
    detail:
      err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 6).join("\n") : undefined,
    cause: message,
    hint: nextStepsForPhase("Execution")[0],
  });

  if (json) {
    run.ports.output.writeStdout(
      `${JSON.stringify(failurePayload(runtimeErr, run.command, run.startedAt))}\n`,
    );
  } else {
    printErrorPanel({
      err: runtimeErr,
      startedAt: run.startedAt,
      output: run.ports.output,
    });
  }
  return EXIT.Execution;
}

function printHeader(run: RunContext, command: string, manifestPath?: string): void {
  if (run.log.isJson || run.log.isQuiet) {
    return;
  }
  printSessionHeader({
    version: getVersion(),
    command,
    manifestBasename: manifestPath ? basename(manifestPath) : undefined,
    output: run.ports.output,
    color: !run.options.noColor,
  });
}

export function createProgram(deps: AppDeps = {}): Command {
  const app = createAppRunContext(deps);

  const program = addGlobalOptions(
    new Command()
      .name("w7s")
      .description("Websete Speculum toolkit — apply, compile, package and test Speculum Gecko")
      .version(
        `${getVersion()} (toolchain ${TOOLCHAIN_IMAGE_TAG})`,
        "-V, --version",
        "print the w7s version and the toolchain image tag it requires",
      )
      .enablePositionalOptions(),
  );

  program.hook("preAction", (_thisCommand, actionCommand) => {
    app.global = mergeCommanderGlobal(
      program.opts() as CommanderGlobalOpts,
      actionCommand.opts() as CommanderGlobalOpts,
    );
    const options = globalFromCommander(app.global);
    const log = createLogger(options, app.ports);
    const parts: string[] = [];
    let current: Command | null = actionCommand;
    while (current && current.name() !== "w7s") {
      parts.unshift(current.name());
      current = current.parent;
    }
    const command = parts.join(" ");
    app.run = createRunContext(options, app.ports, log, command);
  });

  const gecko = addGlobalOptions(
    program.command("gecko").description("Speculum Gecko engine commands"),
  );

  addGlobalOptions(
    gecko
      .command("make")
      .description("produce the named artifact")
      .argument("<artifact>", "gecko-source | gecko-binary | sidecar-package")
      .option("--only", "restrict to the artifact's own step"),
  ).action(async (artifact: string, localOpts: { only?: boolean }) => {
    try {
      printHeader(app.run, `gecko make ${artifact}`);
      await runMake(artifact, { only: localOpts.only }, app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko
      .command("status")
      .description("artifact currency and the next command to run")
      .option("--upgrades", "show upstream diffs for replaced files"),
  ).action(async (localOpts: { upgrades?: boolean }) => {
    try {
      printHeader(app.run, "gecko status");
      await runStatus({ upgrades: localOpts.upgrades }, app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko
      .command("paths")
      .description("where each artifact lives")
      .option("--artifact <name>", "a single artifact"),
  ).action(async (localOpts: { artifact?: string }) => {
    try {
      printHeader(app.run, "gecko paths");
      await runPaths({ artifact: localOpts.artifact }, app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko.command("fingerprint").description("fingerprint of the modified tree"),
  ).action(async () => {
    try {
      // Provider contract: stdout is exactly the fingerprint (or one JSON document).
      if (!app.run.options.json) {
        // skip session header — dockup parses the bare fingerprint
      } else {
        printHeader(app.run, "gecko fingerprint");
      }
      await runFingerprint(app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko.command("validate").description("validate the manifest and declarations"),
  ).action(async () => {
    try {
      printHeader(app.run, "gecko validate");
      await runValidate(app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko
      .command("shell")
      .description("a shell in the toolchain container, for debugging")
      .argument("[command...]", "command to run instead of bash"),
  ).action(async (command: string[]) => {
    try {
      printHeader(app.run, "gecko shell");
      await runShell(command, app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko
      .command("toolchain")
      .description("toolchain image maintenance")
      .option("--pull", "pull the toolchain image this w7s version requires"),
  ).action(async (localOpts: { pull?: boolean }) => {
    try {
      printHeader(app.run, "gecko toolchain");
      await runToolchain({ pull: localOpts.pull }, app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko
      .command("capture")
      .description("capture a working-tree edit into a modification")
      .option("--file <geckoPath>", "file to capture")
      .option("--into <modification>", "modification name")
      .option("--all", "capture every dirty file"),
  ).action(async (localOpts: { file?: string; into?: string; all?: boolean }) => {
    try {
      printHeader(app.run, "gecko capture");
      await runCapture(localOpts, app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  addGlobalOptions(
    gecko
      .command("reset")
      .description("discard an artifact so the next make rebuilds it")
      .argument("<artifact>", "artifact to reset")
      .option("--force", "discard uncaptured working-tree edits"),
  ).action(async (artifact: string, localOpts: { force?: boolean }) => {
    try {
      printHeader(app.run, `gecko reset ${artifact}`);
      await runReset(artifact, { force: localOpts.force }, app.run);
    } catch (err) {
      process.exitCode = handleFatal(err, app.run, Boolean(app.global.json));
    }
  });

  return program;
}

export async function runCli(argv: string[], deps: AppDeps = {}): Promise<void> {
  const program = createProgram(deps);
  const appPorts = deps.ports ?? createSystemPorts(new DockerEngine());
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    const options = globalFromCommander({});
    const log = createLogger(options, appPorts);
    const run = createRunContext(options, appPorts, log, "gecko");
    process.exitCode = handleFatal(err, run, false);
  }
}

export { exitCodeForPhase, EXIT };
