# CLI surface

Grammar: **`w7s <area> <verb> [options]`**. `gecko` is the first area; the manifest's
`kind` selects the driver, so a second area is a new driver and not a new tool.

The manifest is found by walking up from the current directory. `--manifest` points at one
directly.

## Global options

| option | effect |
|---|---|
| `--manifest <path>` | use this manifest instead of discovering one |
| `--target <id>` | compilation target; defaults to `defaultTarget` |
| `--run <name>` | execution target; defaults to `defaultRun` |
| `--json` | structured output, on **every** verb |
| `-q, --quiet` | errors and warnings only |
| `-v, --verbose` | debug logging |
| `--dry-run` | write nothing; print what would happen, on every verb that writes |
| `-y, --yes` | assume yes; required for destructive verbs outside a tty |
| `--no-color` | plain output |
| `--timeout <s>` | per-step timeout |
| `-V, --version` | print version |

## Verbs

| verb | options | what it does |
|---|---|---|
| `builder` | `--pull`, `--verify` | fetch the workshop image, verify tag and digest |
| `init` | `--force` | create volumes, clone Firefox at the pin, verify the commit |
| `sync` | `--strict`, `--adopt`, `--only <change>` | apply the graft (three states) |
| `build` | `--mode auto\|full\|binaries\|export`, `--jobs N`, `--no-sync` | run `mach` in the workshop |
| `artifact` | `--out <path>`, `--check`, `--path`, `--json` | package the browser and publish the host into `dist/<target>/` |
| `dist` | `--list`, `--pull <ref>`, `--verify` | inspect a payload, or fetch one built by CI |
| `run` | `--from obj\|dist`, `--port N`, `--detach` | start the payload on the execution target |
| `stop` | | tear down what `run` started |
| `shell` | `-- <cmd>` | open a shell in the workshop |
| `adopt` | `--path <p>`, `--as inject\|patch`, `--all` | workspace drift into `graft/hooks` |
| `test` | see [05-runner.md](05-runner.md) | run declared suites |
| `status` | `--json` | the chain and what is stale |
| `where` | `--what src\|obj\|dist\|bin` | every path, on both sides |
| `validate` | `--offline`, `--fix` | invariants, builder digest, VM memory |
| `lock` | `--check` | regenerate `graft.lock.json` |
| `pin` | `--set <tag>`, `--dry-run` | move the pin and print the rebase report |
| `delta` | | print the delta hash, for tags and labels |
| `reset` | `--volumes a,b`, `--all` | destroy volumes; lists them first |
| `ship` | `--to src\|obj\|dist` | run the chain, skipping whatever is fresh |

`doctor` is deliberately absent: in the Speculum repository that word already means
"diagnose a capture". Humans use `status`, machines use `validate`.

`promote` is **specified but not implemented**, and named here so nobody assumes it was
forgotten. It would convert the graft into real commits on `source.fork.branch`, which is
the day the overlay model ends: `sync` becomes `git am`, `adopt` becomes `git status`, and
the lock becomes unnecessary. The manifest already records the fork remote and branch so
that decision costs a verb and not a redesign. It stays deferred until after Speculum V1.

## `--mode auto`

The only inference the tool is allowed, and it is derived from what `sync` actually wrote,
never from a guess:

- wrote something matching `builder.exportTriggers` → `mach build pre-export export`, then `binaries`
- wrote only `.cpp` / `.h` → `binaries`
- the pin or the mozconfig changed, or the `obj` volume is empty → `mach build`

What to recompile remains `mach` plus `sccache`. Going further than mode selection would be
writing a second compiler, and a worse one.

## Staleness

Each stage stamps the delta that produced it. `status` compares stamps and names the next
step — including when the next step is not its own:

```
$ w7s gecko status

  graft      7 changes · 41 files                            a3f19c
  builder    speculum/gecko-builder:153.2.0esr-1             ok      digest matches
  src        FIREFOX_153_2_0esr @ feec67e                     ok      a3f19c
  obj        16 GB · built 2h ago                             BEHIND  2 files since
  dist       linux-x64 · 720 MB                               BEHIND  previous build
  image      speculum/gecko:dev                               BEHIND  label 7c2b1e
  stack dev  sidecar up · /ready ok                           running 7c2b1e

  next -> w7s gecko build
```

Stamps are written twice: in `.w7s/state.json` on the Windows side and inside the volume.
If Windows says "built" and the volume stamp is gone, the volume was destroyed out of band,
and the stage is reported cold rather than lying.

## Error phases

Every failure is raised with a phase, and the exit code is derived from the phase rather
than chosen at the throw site. This is dockup's `exitCodeForPhase` pattern, and it is what
makes a given class of failure always exit the same way.

| phase | meaning | exit |
|---|---|---|
| `CLI` | bad arguments | 2 |
| `MANIFEST` | manifest missing, unparseable, or schema-invalid | 2 |
| `GRAFT` | drift in the workspace | 3 |
| `INVARIANT` | a law was violated (`validate`, ambiguous anchor) | 6 |
| `ENGINE` | container engine or image unavailable, memory insufficient | 4 |
| `STALE` | a stage exists but is behind (only raised under `--check`) | 5 |
| `TEST` | a declared suite went red | 7 |
| `RUNTIME` | an invoked command failed, or an unexpected error | 1 |

## Exit codes

Stable, because dockup and CI consume them.

| code | meaning |
|---|---|
| 0 | ok |
| 1 | execution failure — an invoked command returned non-zero |
| 2 | invalid usage, or invalid manifest |
| 3 | **drift** — the workspace diverged from the graft |
| 4 | workshop or target unavailable — docker down, image missing, insufficient memory |
| 5 | **stale** — with `--check`: it exists but is behind |
| 6 | invariant violated (`validate`) |
| 7 | **test red** — distinct from 1, because the suite ran and failed |

As in dockup, codes are derived from an error phase rather than thrown ad hoc, so a given
class of failure always exits the same way.

Every failure prints, besides the cause, **one line saying what to do next**. An error that
does not name the next step is how a directory of 121 rescue scripts comes into existence.

## The `--json` contract

`--json` guarantees that stdout carries exactly one JSON document and nothing else.
Subprocess output is captured, never leaked onto stdout — the same guarantee dockup makes.

Success:

```jsonc
{
  "ok": true,
  "command": "gecko sync",
  "delta": "a3f19c",
  "elapsedSec": 1.4,
  "result":    { /* verb-specific; documented per verb */ },
  "report":    { /* the same data the human summary renders */ },
  "nextSteps": ["w7s gecko build"]
}
```

Failure:

```jsonc
{
  "ok": false,
  "command": "gecko sync",
  "phase": "GRAFT",
  "message": "3 files in the workspace diverge from the graft.",
  "hint": "w7s gecko adopt --all, then retry.",
  "detail": ["docshell/base/BrowsingContext.cpp", "…"],
  "cause": null,
  "elapsedSec": 0.6,
  "exitCode": 3
}
```

Two rules that make this usable as an API: `ok` is always present and always a boolean, and
`phase`/`exitCode` are always present on failure. A consumer can branch on `jq -e '.ok'`
without knowing which verb ran. `--with-logs` adds captured subprocess output under
`result.logs`, off by default so the document stays small.
