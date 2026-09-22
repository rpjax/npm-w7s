# 0.2.0 — the local builder

**Status: decided.** This is the contract. The published-image design of `0.1.0` is gone.
Former docs `01`–`10` are folded into this file; those filenames no longer exist.

## What w7s is

> **w7s builds Gecko. That is its entire purpose.**
>
> The decision test: if it requires w7s to know something about how the product _works_, it
> is out of scope.

It is a **local builder**. It publishes nothing, pulls nothing, and depends on no registry.
Everything it needs, it either finds in the manifest or produces beside it.

## What 0.1.0 got wrong

`0.1.0` shipped a 7.3 GB toolchain image to a container registry, versioned in lockstep with
the npm package, with the Firefox tree baked inside it.

That machinery existed to solve a **coordination problem**: many machines, many consumers,
nobody allowed to diverge. **That problem does not exist here.** w7s has one consumer,
Speculum, and one operator. We paid the full cost of a distribution guarantee with nothing to
distribute:

- 7.3 GB built out of band, pushed by hand, pulled by every machine
- trying another ESR cost a full release cycle — image, push, digest, tag, publish
- registry visibility, digest pinning, tokens and CI guards, none of which build anything

That is the opposite of the reason this tool exists. The original pain was a process that was
ad hoc and slow to iterate. A design where an experiment costs a release has moved the pain,
not removed it.

**Everything about distribution is deleted.** What survives is the part that was always the
point: applying modifications deterministically and compiling.

## The shape

Everything happens under the directory that holds the manifest. There is no global state, no
shared cache outside it, and nothing written anywhere else.

```
<manifest root>/
  w7s.json              you write this
  modifications/        you write these — version controlled
  out/                  generated: the binaries, one subdirectory per version
    153.2.0/linux-x64/
  .w7s/                 generated: everything else
    lock.json           what was built, and from what
    state.json          artifact currency beside the repository
    Dockerfile          the toolchain, generated from the manifest
    gecko/153.2.0/      the materialized tree, with modifications applied
    build/153.2.0/      the object directory
```

`out/` and `.w7s/` are generated. `w7s gecko validate` fails if the repository does not ignore
both.

**One subdirectory per Gecko version, never overwritten.** Changing `gecko.version` in the
manifest materializes a new tree beside the old one and builds into a new output directory.
Switching back is a manifest edit, not a rebuild. Nothing is ever destroyed to make room.

## The manifest

Three keys. Unknown keys are errors.

```jsonc
{
  "gecko": {
    "version": "153.2.0",
    "repository": "https://github.com/mozilla-firefox/firefox.git",
    "commit": "feec67e62a5148b41fd017ccbbc463e8a6f9e83d",
  },

  "toolchain": {
    "target": "linux-x64",
    "baseImage": "ubuntu:24.04",
    "aptPackages": ["build-essential", "git", "python3", "curl"],
    "rustVersion": "1.90.0",
    "sccacheVersion": "0.17.0",
    "extraCommands": [],
    "mozconfigOptions": ["ac_add_options --enable-application=browser"],
  },

  "modifications": [
    {
      "name": "projection runtime",
      "description": "our C++ compiled inside Gecko",
      "type": "directory",
      "localPath": "./modifications/runtime",
      "geckoPath": ".",
      "replacesGeckoSource": false,
    },
  ],
}
```

### `gecko`

| field        | meaning                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| `version`    | the name of the subdirectory under `.w7s/gecko/` and `out/`. Your label.    |
| `repository` | where the tree is cloned from                                               |
| `commit`     | the exact commit. Verified after materializing, and on every later command. |

**A commit SHA is a content hash, so `git rev-parse HEAD == commit` is a proof, not a hope.**
This is why the tree no longer needs to be baked into a published image: baking was one way to
make it unforgeable, and verifying is another, equally strong, and far cheaper.

`version` is a label and is never parsed. It does not have to match the Firefox milestone, and
w7s never derives one from the other.

### `toolchain`

This describes **the contents of the build image**, and every field is stated by you.

| field              | meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `target`           | the compilation target name, used in `out/<version>/<target>/` |
| `baseImage`        | the image the toolchain is built on                            |
| `aptPackages`      | packages installed before anything else runs                   |
| `rustVersion`      | pinned exactly                                                 |
| `sccacheVersion`   | pinned exactly                                                 |
| `extraCommands`    | additional `RUN` lines, appended last, in order, verbatim      |
| `mozconfigOptions` | mozconfig lines, verbatim and in order. `MOZ_OBJDIR` is w7s's. |

**w7s assembles; it does not choose.** The tool owns the _rules of building Gecko_ — the layer
order, where the cache mounts live, that `mach bootstrap` runs and with which flags, how the
object directory is wired. You own _what goes in the box_. w7s never adds a package you did
not name and never picks a version you did not state.

### `modifications`

Whole-file replacement, declared by directory or by file, `replacesGeckoSource` verified in
both directions per file, writes gated on content so a file whose bytes are already correct is
never rewritten.

| field                 | meaning                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `name`                | stable identity of the entry                                                                |
| `description`         | why it exists                                                                               |
| `type`                | `"directory"` or `"files"`                                                                  |
| `localPath`           | path in the consumer repository (directory root, or unused for `files` with explicit pairs) |
| `geckoPath`           | destination under the materialized tree                                                     |
| `replacesGeckoSource` | `true` if these files replace committed Gecko files; `false` if they are entirely ours      |

Two entries declaring the same destination path is a conflict, reported before anything is
written.

The pristine bytes for that comparison come from `git show <commit>:<path>` inside the
materialized tree. Not a snapshot taken at materialization time, and not whatever is on disk:
the commit is verified against the manifest, so the committed content cannot drift with the
working tree, needs nothing cached beside it, and is available for any path at any moment.
That is what replaced the read-only `/gecko-pristine` mount.

**Removed from the manifest:** the `tests` key. Running the product, and testing it, belong to
the Speculum repository.

## Applying modifications

`w7s gecko make gecko-source` brings the working tree up to date with the manifest. It is the
only operation that writes into that tree, and every other production step runs it first.

For every declared file, three contents are in play:

| name     | where it comes from                                         |
| -------- | ----------------------------------------------------------- |
| pristine | `git show <commit>:<geckoPath>` in the materialized tree    |
| declared | the file at `localPath` in the repository, normalized to LF |
| current  | `<geckoPath>` in the working tree                           |

```
current == declared   ->  nothing is written
current == pristine   ->  declared is written
otherwise             ->  the file was edited in the working tree
                          the step stops, exit 3, names the file
```

Writing a file that already has the right content would give it a new modification time; the
Gecko build system reads those times and would recompile needlessly. Declared content is
normalized to LF before comparison and write. Every write goes to a temporary file in the
destination directory and is then renamed.

```
w7s gecko capture --file dom/base/Document.cpp --into "runtime install points"
```

copies the file out of the working tree into the named modification, verifies
`replacesGeckoSource` against pristine, and re-runs the comparison so `declared` must equal
`current`.

```
fingerprint = sha256( w7s version || every (geckoPath, content hash), sorted )[0:12]
```

It identifies exactly one state of the modified tree and travels into `build.json` inside
`sidecar-package` and into `w7s gecko fingerprint`.

`reset` refuses while the working tree holds an edit that is not in the repository, and lists
what would be lost.

## Bootstrap, the object directory and the caches

Three things the build needs that are neither the tree nor the image.

**`mach bootstrap` cannot be a Dockerfile layer any more.** It requires a checkout, and the
tree now lives on the host. So it runs once into `.w7s/mozbuild/<toolchain tag>/`, mounted at
`MOZBUILD_STATE_PATH` on every later container. It is keyed by the same content-addressed tag
as the image, for the same reason: bootstrap fetches whatever Mozilla serves on the day it
runs and has no hash to check against, so it is re-run when the toolchain block changes and
never because time passed.

**The mozconfig is generated** into `.w7s/mozconfig/` and mounted read-only. `MOZ_OBJDIR` is
written by w7s and points at the mounted object directory, because where the object directory
lives is wiring, and pointing it elsewhere would silently break the artifact layout. Every
other line comes from `toolchain.mozconfigOptions`, verbatim and in order.

It is deliberately **not** written into the tree: the tree holds the verified commit and the
declared modifications, and nothing else may appear in it.

**sccache persists** in `.w7s/sccache/`, mounted into every build, so killing a container does
not cost a full rebuild.

**The archive is whatever `mach package` produced.** `make gecko-binary` runs `./mach build`
then `./mach package`; `make sidecar-package` copies that archive to
`out/<version>/<target>/firefox.tar.gz` and writes `build.json` beside it, with the milestone
read from the tree. If no archive is there, that is a failure that reports what it found — it
is never replaced with a placeholder, because a build that half-failed must not stamp a
finished artifact.

## The toolchain image

Generated, built locally, never published.

1. w7s renders `.w7s/Dockerfile` from the `toolchain` block. Rendering is deterministic: the
   same block always produces byte-identical output.
2. The image is tagged `w7s-toolchain:local-<first 16 hex of sha256(Dockerfile)>`.
3. If an image with that tag already exists, **nothing is built.** The tag is the cache key.
4. The resulting image id is recorded in `.w7s/lock.json`.

So the image is rebuilt when — and only when — you change the `toolchain` block. It is not
rebuilt because time passed.

### Why this keeps the guarantee that matters

`mach bootstrap` fetches whatever Mozilla is serving on the day it runs. It is **not
verifiable — only freezable**: there is no hash to check it against, because a third party
decides its content at call time. In `0.1.0` the published image froze it.

Here, the content-addressed local tag freezes it instead. The bootstrap layer is built once
and reused until the manifest changes it. `lock.json` records the image id that produced each
build, so you can always answer "what compiled this."

What is lost, honestly: **two different machines can end up with two different images from the
same manifest**, if they first build on different days. That is the coordination guarantee, and
we are deliberately not paying for it, because there is one machine. If that ever stops being
true, the answer is to publish the image again — not to bolt a weaker check onto this design.

### Who may call `build`

Only `src/toolchain/` may call `ContainerEngine.build`, and only for the Dockerfile w7s
rendered itself. That is the 0.2.0 replacement for the old "the tool never builds an image"
rule. The product image remains dockup's job.

### Windows NTFS workspaces

Docker Desktop bind-mounts from a Windows drive letter into a Linux container go through a
userspace file share. A full Gecko tree makes that path unusable — `mach bootstrap` hangs on
`git`. On NTFS, w7s therefore keeps a marker directory under `.w7s/` and stores the real tree,
object directory, mozbuild state and sccache cache in Docker **named volumes** (Linux VM
filesystem). WSL paths (`\\wsl$\…`) keep using bind mounts. Modifications still require a
bind-mounted tree today — put the manifest on a WSL filesystem if you apply host-side edits.

### Measured smoke (empty `modifications`, Firefox 153.2.0, this machine)

| quantity                                              | measured                                      |
| ----------------------------------------------------- | --------------------------------------------- |
| Local toolchain image (`w7s-toolchain:local-…`)       | **3.93 GB**                                   |
| Object directory (Docker volume)                      | **16 GB**                                     |
| First toolchain image build                           | **11.1 min**                                  |
| First `gecko-binary` attempt (until Docker Desktop EOF near link) | **115.3 min**                     |
| Resume to green after Docker restart (warm objects)   | **96.9 min**                                  |
| Incremental `gecko-binary` (stamp cleared, objects warm) | **3.7 min**                                |
| Packaged archive (`firefox.tar.gz` from `.tar.xz`)    | **79.7 MB**                                   |

The cold compile is dominated by a full browser build. A Docker Desktop crash near the end of
the first attempt forced a resume; a continuous cold run on this host is on the order of two
hours. Incremental re-package after a warm objdir is minutes.

## Commands

Commander powers argument parsing and built-in help. Use `--help` on the root command or any
subcommand:

```bash
w7s --help
w7s gecko --help
w7s gecko make --help
w7s --version
```

Grammar: **`w7s gecko <command> [arguments]`**.

| command       | does                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| `make`        | materialize → verify commit → apply modifications → build image → compile → package |
| `status`      | what exists, what is current, what would change                                     |
| `paths`       | every path it would read or write, for the declared version                         |
| `fingerprint` | the hash of the declared modifications                                              |
| `validate`    | manifest, declarations, and that `out/` and `.w7s/` are ignored                     |
| `toolchain`   | render the Dockerfile and build the local image, nothing else                       |
| `shell`       | a shell in the toolchain container, for debugging a build                           |
| `capture`     | write the current tree's divergence back into `modifications/`                      |
| `reset`       | discard the materialized tree for a version, refusing while it differs              |

`make` takes an artifact name: `gecko-source`, `gecko-binary`, `sidecar-package`.

```
w7s gecko make gecko-source      # materialize, verify, apply — nothing more
w7s gecko make gecko-binary      # then compile
w7s gecko make sidecar-package   # then package into out/<version>/<target>/
```

`--only` restricts a `make` to the named artifact's own step, failing instead of producing
what it depends on.

**Removed:** `test`, `start`, `stop`, and `toolchain --pull`. Running the product, and testing
it, belong to Speculum. There is no registry image to pull.

### Global options

| option                | effect                                       |
| --------------------- | -------------------------------------------- |
| `--manifest <path>`   | use this manifest instead of discovering one |
| `--json`              | machine-readable output, on every command    |
| `-q, --quiet`         | errors and warnings only                     |
| `-v, --verbose`       | debug logging                                |
| `--dry-run`           | write nothing; print what would happen       |
| `-y, --yes`           | assume yes outside a terminal                |
| `--no-color`          | plain output                                 |
| `--timeout <seconds>` | per-step timeout                             |
| `-V, --version`       | print version                                |
| `-h, --help`          | display help for command                     |

### Error phases and exit codes

Failures carry a phase; the exit code is derived from it, never chosen at the throw site.

| phase         | meaning                                                          | exit |
| ------------- | ---------------------------------------------------------------- | ---- |
| `Cli`         | bad arguments                                                    | 2    |
| `Manifest`    | missing, unparseable, or schema-invalid                          | 2    |
| `WorkingTree` | a file was edited in the working tree                            | 3    |
| `Declaration` | a modification contradicts pristine, or two entries collide      | 6    |
| `Toolchain`   | container engine unavailable, image missing, memory insufficient | 4    |
| `NotCurrent`  | an artifact exists but is behind (raised only under `--check`)   | 5    |
| `Test`        | reserved; Speculum owns product tests now                        | 7    |
| `Execution`   | an invoked command failed, or an unexpected error                | 1    |

| code | meaning                                   |
| ---- | ----------------------------------------- |
| 0    | success                                   |
| 1    | an invoked command failed                 |
| 2    | bad arguments or bad manifest             |
| 3    | the working tree holds an uncaptured edit |
| 4    | the toolchain is unavailable here         |
| 5    | an artifact is not current (`--check`)    |
| 6    | a declaration is wrong                    |
| 7    | reserved (was release-gate test failure)  |

Every failure prints the cause and, on the next line, the command that addresses it.

### The `--json` contract

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
  "detail": ["docshell/base/BrowsingContext.cpp", "dom/base/Document.cpp"],
  "elapsedSeconds": 0.6,
  "exitCode": 3,
}
```

`ok` is always present and always boolean; `phase` and `exitCode` are always present on
failure.

## Artifacts

| name              | what it is                                              | produced from                           |
| ----------------- | ------------------------------------------------------- | --------------------------------------- |
| `gecko-source`    | the Firefox tree with modifications applied             | clone + commit verify + `modifications` |
| `gecko-binary`    | the compiled browser under the object directory         | `gecko-source` + local toolchain image  |
| `sidecar-package` | `out/<version>/<target>/` with archive and `build.json` | `gecko-binary`                          |

Currency is recorded in `.w7s/state.json` and beside each artifact. Disagreement means missing,
not current.

Package layout:

```
out/<version>/<target>/
  firefox.tar.gz
  build.json        fingerprint, w7s version, Firefox version, target, timestamp, hashes
```

## Integration with dockup

**dockup builds the product image.** w7s produces `sidecar-package` and exposes it. The only
image w7s builds is the local toolchain Dockerfile it rendered — never the product image.

```bash
w7s gecko make sidecar-package
w7s gecko paths --artifact sidecar-package
w7s gecko paths --artifact sidecar-package --json
w7s gecko fingerprint
```

```jsonc
{
  "id": "sidecar",
  "context": "gecko-engine",
  "dockerfile": "gecko-engine/image/Dockerfile",
  "prepare": ["w7s gecko make sidecar-package"],
  "labels": { "speculum.gecko.modifications": "$(w7s gecko fingerprint)" },
}
```

The package sits under `out/<version>/<target>/` inside the build context. Managed host
binaries are not part of the package — that knowledge belongs to the product Dockerfile.

## Guarantees

| risk                                       | mechanism                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| two commands running at once               | a lock held by a named container; `--timeout` bounds the wait                          |
| an interrupted write                       | temporary file then rename — never half a file                                         |
| Windows line endings reaching a Linux tree | declared content normalized to LF; repository carries `text eol=lf`                    |
| an unknown manifest key                    | validation error, not a warning                                                        |
| the container engine being absent          | exit 4; never a degraded partial result                                                |
| a cold build exhausting memory             | required amount checked against the engine's limit before the build starts             |
| the toolchain drifting silently            | content-addressed local tag from the Dockerfile hash; `lock.json` records the image id |
| the declared commit being forged           | `git rev-parse HEAD` must equal `gecko.commit` after materialize and on later commands |
| pristine bytes drifting with the tree      | `git show <commit>:<path>`, not the working tree and not a side cache                  |
| losing an uncaptured edit                  | `reset` refuses while the working tree differs, and lists what would be lost           |
| running a command twice                    | every command is idempotent; the second run does nothing and says why                  |
| an artifact recorded as current but gone   | currency beside the repository and beside the artifact; disagreement means missing     |
| a modification contradicting the tree      | `replacesGeckoSource` verified in both directions, per file                            |
| two modifications writing the same path    | conflict before anything is written                                                    |
| upstream changing a file we replace        | `status --upgrades` names it and shows the diff                                        |
| generated files reaching version control   | `validate` fails if `out/` and `.w7s/` are not ignored                                 |
| the product image being built here         | only `src/toolchain/` may call `engine.build`; enforced by unit test                   |

## Distribution

w7s is consumed as a development dependency from npm (or from git):

```
npm i -D @rodrigopjax/w7s
# or: npm i -D github:rpjax/npm-w7s
```

The critical path does not depend on a registry for the toolchain image — there is none.
Publishing the CLI to npm is for install convenience (`npx`, versioned deps); nothing in the
build pipeline pairs two artifacts or waits on a digest.

Version bumps follow semantic versioning for the CLI contract: renamed options, newly required
manifest fields, changed exit codes or `--json` keys are **major**. A new Gecko commit or
toolchain pin in the consumer's manifest is their change, not a w7s release.

## Testing this package

> The portable tiers run with no container engine, no Gecko tree and no network, on Linux and
> on Windows.

Whatever the tool cannot fake sits behind a seam. Whatever it can do for real in a temporary
directory is done for real.

| port              | wraps                           | why                                                                         |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `ContainerEngine` | the engine CLI                  | absent in CI; tests assert on the argument list that would have been issued |
| `GitPort`         | git                             | materialize, commit verify, and pristine `show` without a real clone        |
| `Clock`           | the system clock                | timestamps and durations must be deterministic                              |
| `Host`            | platform, environment variables | Windows and Linux path behaviour is a tested axis                           |
| `Output`          | stdout and stderr               | the single-JSON-document guarantee is asserted by capturing                 |

The filesystem is deliberately **not** a seam. Atomic rename, LF normalization and
modification-time preservation are exercised against real temporary directories.

`test/fixtures/pristine-tiny` stands in for a tiny committed tree. Every apply claim is tested
against it with real files and FakeGit.

| tier               | script             | role                                                      |
| ------------------ | ------------------ | --------------------------------------------------------- |
| `test/unit`        | `test:unit`        | schema, apply logic, ports, CLI contracts, build boundary |
| `test/integration` | `test:integration` | real temp dirs, FakeEngine + FakeGit                      |
| `test/e2e`         | `test:e2e`         | full command chain against fakes                          |
| `test/engine`      | `test:engine`      | real engine, minimal image; not part of `npm test`        |

The build-boundary unit test fails if anything outside `src/toolchain/` calls
`engine.build` / `ContainerEngine.build`.

Policy: assert effects, never exit codes alone; a missing field is a failure, never a skip;
no softened, skipped or retried tests; no sleeping as a synchronizer.

## Using w7s in a pipeline

Parts need no container engine. The parts that do fail loudly rather than degrading.

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes github:rpjax/npm-w7s gecko validate --json
```

`make` and `shell` without an engine exit 4 naming what is missing. A cold Gecko build belongs
on a self-hosted runner or a scheduled job that publishes `out/` as a build artifact — not on
a tiny hosted runner.

```bash
w7s gecko validate --json | jq -e '.ok'
w7s gecko status --json | jq -r '.result.artifacts[] | select(.current == false) | .name'
```

The deploy gate is dockup's `prepare`: `["w7s gecko make sidecar-package"]`.

## What is deliberately absent

- a published image, a registry, a digest pin, a paired release
- a dependency graph of its own — the build system has one
- a build cache of its own — the compiler and the container engine have one
- patching by anchor or by hunk — a changed file is held whole
- any knowledge of how the product works
- any default that is not written in the manifest
- any flag whose purpose is to tolerate a failure
- `test` / `start` / `stop` — Speculum owns those
- pulling a toolchain by tag — there is no published tag to pull
