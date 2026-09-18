# Command reference

Grammar: **`w7s <area> <command> [arguments]`**. `gecko` is the area for the Speculum Gecko
engine; the manifest tells the tool nothing about which area it is, because the command line
already said.

## Options

Every option is spelled out. There are no positional surprises and no inferred defaults.

| option                | effect                                                        |
| --------------------- | ------------------------------------------------------------- |
| `--manifest <path>`   | use this manifest instead of discovering one                  |
| `--json`              | machine-readable output, on every command                     |
| `-q, --quiet`         | errors and warnings only                                      |
| `-v, --verbose`       | debug logging                                                 |
| `--dry-run`           | write nothing; print what would happen                        |
| `-y, --yes`           | assume yes; required for refusing commands outside a terminal |
| `--no-color`          | plain output                                                  |
| `--timeout <seconds>` | per-step timeout                                              |
| `-V, --version`       | print the w7s version and the toolchain image tag it requires |

## Commands

### Producing

| command                     | what it does                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `w7s gecko make <artifact>` | produces the named artifact, doing whatever it needs and skipping what is already current |

One verb. Naming the artifact you want is the whole interface:

```
w7s gecko make gecko-source      # apply the modifications, nothing more
w7s gecko make gecko-binary      # applies, then compiles
w7s gecko make sidecar-package   # applies, compiles, then packages
```

There are no separate `apply`, `compile` and `package` commands. Two ways to do one thing is
a defect in a command line: it forces every reader to learn which one a script used and why.
The chain is fixed, printed by `w7s gecko status`, and not inferred per run.

`--only` restricts a `make` to the named artifact's own step, failing instead of producing
what it depends on:

```
w7s gecko make gecko-binary --only    # fails if gecko-source is not current
```

### Inspecting

| command                               | what it does                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `w7s gecko status`                    | every artifact, whether it is current, the production chain, and the next command to run |
| `w7s gecko status --upgrades`         | the files upstream changed since our replacements were written, with diffs               |
| `w7s gecko paths [--artifact <name>]` | where each artifact lives, in both Windows and container spelling                        |
| `w7s gecko fingerprint`               | the fingerprint of the modified tree                                                     |
| `w7s gecko validate`                  | the manifest against the schema, the modifications against the pristine tree             |

### Running

| command                        | what it does                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `w7s gecko start`              | starts the sidecar from `gecko-binary` for local iteration |
| `w7s gecko stop`               | stops what `start` started                                 |
| `w7s gecko test [selectors]`   | runs declared tests — [05-tests.md](05-tests.md)           |
| `w7s gecko shell [-- command]` | a shell in a toolchain container, with the tree mounted    |

### Maintaining

The toolchain image's digest is verified by **every** command that starts a container, not
only by `toolchain`. That is a guarantee, not a flag.

| command                      | what it does                                                               |
| ---------------------------- | -------------------------------------------------------------------------- |
| `w7s gecko toolchain --pull` | pulls the toolchain image this w7s version requires                        |
| `w7s gecko capture`          | a working-tree edit into a modification — [03-applying.md](03-applying.md) |
| `w7s gecko reset <artifact>` | discards an artifact so the next `make` rebuilds it                        |

There is no `doctor`: `status` is for a person, `validate` is for a pipeline, and in the
Speculum repository "doctor" already means diagnosing a capture.

There is no `init`. `make gecko-source` creates the working tree if it does not exist; a
separate command for the first run is a state the user has to remember.

There is no `artifacts` command: the production chain is part of `status`, where the reader is
already looking.

Twelve commands. Every one of them names its object, and none of them does what another
one does.

## Error phases

Failures carry a phase, and the exit code is derived from it rather than chosen at the throw
site. One class of failure always exits the same way.

| phase         | meaning                                                              | exit |
| ------------- | -------------------------------------------------------------------- | ---- |
| `Cli`         | bad arguments                                                        | 2    |
| `Manifest`    | missing, unparseable, or schema-invalid                              | 2    |
| `WorkingTree` | a file was edited in the working tree                                | 3    |
| `Declaration` | a modification contradicts the pristine tree, or two entries collide | 6    |
| `Toolchain`   | container engine unavailable, image missing, memory insufficient     | 4    |
| `NotCurrent`  | an artifact exists but is behind (raised only under `--check`)       | 5    |
| `Test`        | a release-gate test failed                                           | 7    |
| `Execution`   | an invoked command failed, or an unexpected error                    | 1    |

## Exit codes

Stable, because dockup and pipelines branch on them.

| code | meaning                                   |
| ---- | ----------------------------------------- |
| 0    | success                                   |
| 1    | an invoked command failed                 |
| 2    | bad arguments or bad manifest             |
| 3    | the working tree holds an uncaptured edit |
| 4    | the toolchain is unavailable here         |
| 5    | an artifact is not current (`--check`)    |
| 6    | a declaration is wrong                    |
| 7    | a release-gate test failed                |

Every failure prints the cause and, on the next line, the command that addresses it.

## Status output

```
$ w7s gecko status

  toolchain         ghcr.io/rpjax/w7s-toolchain:0.4.0        ok        digest verified
  gecko-source      Firefox 153.2.0esr + 45 files            current   a3f19c7b21d4
  gecko-binary      built 2 hours ago                        behind    2 files since
  sidecar-package   dist/linux-x64, 720 MB                   behind    previous binary
  released image    speculum/gecko:dev                       behind    label 7c2b1e09f8aa

  next -> w7s gecko make sidecar-package
```

`released image` is observed, not produced: the tool reads the label and the readiness probe.
Its "next" line can name a dockup command, because the boundary is real.

Currency is recorded twice — once in `.w7s/state.json` beside the repository and once inside
the volume. If the repository says an artifact is current and the volume's record is gone,
the volume was destroyed out of band and the artifact is reported missing rather than
current.

## The `--json` contract

Exactly one JSON document on stdout. Subprocess output is captured, never interleaved.

Success:

```jsonc
{
  "ok": true,
  "command": "gecko make gecko-source",
  "fingerprint": "a3f19c7b21d4",
  "elapsedSeconds": 1.4,
  "result": { "filesWritten": 2, "filesUnchanged": 43 },
  "nextSteps": ["w7s gecko make gecko-binary"],
}
```

Failure:

```jsonc
{
  "ok": false,
  "command": "gecko make gecko-source",
  "phase": "WorkingTree",
  "message": "3 files in the working tree differ from the manifest.",
  "hint": "w7s gecko capture --all --into <modification>",
  "detail": ["docshell/base/BrowsingContext.cpp", "dom/base/Document.cpp", "dom/base/Document.h"],
  "elapsedSeconds": 0.6,
  "exitCode": 3,
}
```

`ok` is always present and always boolean; `phase` and `exitCode` are always present on
failure. A consumer can branch on `ok` without knowing which command ran.
