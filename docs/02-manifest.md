# The manifest — `w7s.json`

One file per area. `w7s` walks up from the current directory to find it, exactly as
dockup finds `*.dockup.json`. The `kind` field selects the driver; `gecko-engine` is the
first and currently only one.

The manifest carries **only what is not a file path**. The file list is derived from the
tree (`graft/sources/**`, `graft/hooks/**`). A hand-maintained list diverges — in the
Speculum repository it diverged twice, in two different directions.

Validation is JSON Schema (`schema/w7s.schema.json`) evaluated with ajv. `w7s gecko
validate --offline` needs nothing but the repository.

## Skeleton

```jsonc
{
  "schema": 1,
  "kind": "gecko-engine",
  "id": "speculum-gecko",

  "source":   { /* the upstream pin */ },
  "graft":    { /* where our delta lives, if not the default */ },
  "vendor":   [ /* trees copied into the Gecko tree */ ],
  "changes":  [ /* logical units of our delta, with intent */ ],
  "targets":  { /* compilation targets */ },
  "builder":  { /* the workshop */ },
  "artifact": { /* how the payload is packaged */ },
  "run":      { /* execution targets */ },
  "tests":    { /* declared suites */ },
  "runtimeEnv": { /* env for the running sidecar, declared once */ },
  "health":   { /* readiness probe */ },
  "consumers":{ /* dockup and friends */ },
  "stateDir": ".w7s"
}
```

Every section except `schema`, `kind`, `id`, `source` and `targets` has a working default.
A minimal manifest is four fields and a target; everything else exists so that a decision
can be *moved out of the tool*, not so that it must be made.

## `source` — the pin

```jsonc
"source": {
  "remote":   "https://github.com/mozilla-firefox/firefox.git",
  "tag":      "FIREFOX_153_2_0esr_RELEASE",
  "commit":   "feec67e62a5148b41fd017ccbbc463e8a6f9e83d",
  "released": "2026-09-01",
  "fork":     { "remote": "https://github.com/rpjax/firefox.git",
                "branch": "speculum/153.2.0esr" }
}
```

`commit` is not redundant with `tag`: tags move. `init` clones the tag and aborts if
`HEAD` does not equal `commit`. `fork` is recorded for the day the delta is promoted to
real commits; nothing reads it yet.

How the clone is made is also declared, because "shallow, single branch" is a policy and
not a fact:

```jsonc
"source": { "clone": { "depth": 1, "singleBranch": true } }
```

Defaults are `depth: 1` and `singleBranch: true` — the measured clone was 266 s and 5.7 GB;
full history costs considerably more and nothing reads it. Set `depth: 0` for a full clone
when a bisect needs one.

Being JSON matters here. The predecessor was a shell file sourced with
`source <(sed 's/\r$//' UPSTREAM)` — a CRLF workaround that JSON does not need.

## `graft` — where our delta lives

```jsonc
"graft": { "root": "graft", "sources": "sources", "hooks": "hooks" }
```

Defaults are exactly those, so the section is normally absent. It exists because the
directory names are a convention of this project, not a property of the universe: a rename
must cost one line of manifest, never a change to the tool.

What the tool does *not* allow is collapsing `sources` and `hooks` into one directory. That
split is L3 made visible in the tree, and `validate` depends on it.

## `vendor` — trees copied in

```jsonc
"vendor": [
  { "from": "producer", "to": "third_party/speculum-producer",
    "include": ["include/speculum/*.h"] }
]
```

`from` is relative to the manifest; `to` is relative to the Gecko tree root. Vendored
content obeys L2 like everything else: identical bytes are not rewritten.

## `changes` — the delta, with intent

Each entry is a logical unit, not a file. `sources` and `hooks` are globs resolved
against `graft/sources/` and `graft/hooks/`.

```jsonc
"changes": [
  { "id": "cssom",
    "why": "per-rule notification — see docs/gecko-engine/02-costura §4",
    "sources": ["dom/base/SpeculumCssom.*"],
    "hooks":   ["dom/base/Document.cpp#cssom-*",
                "dom/base/ShadowRoot.cpp#rule-added"] },

  { "id": "control-abi",
    "why": "control bridge — see docs/gecko-engine/18-abi-controle",
    "sources": ["dom/ipc/SpeculumControlAbi.*"],
    "hooks":   ["dom/ipc/PContent.ipdl#*"],
    "ipc": { "syncMessages": [
      { "name": "PContent::SpeculumClaimGeneration",
        "description": "one claim per Document attach; the producer writes generation" }
    ] } }
]
```

Three deliberate choices:

**`why` is required.** The manifest is the answer to "what do we change in Gecko and what
for?". Before this file, that answer existed in no single place.

**`ipc.syncMessages` is data, not a script.** Gecko's IPDL refuses `export` unless a sync
message is registered in `ipc/ipdl/sync-messages.ini`. The predecessor was a Python
rewriter whose entire body was a list of tuples; the tuples belong here.

**`#anchor-id` in a hook glob** refers to an edit `id` inside an inject file, so a change
can claim specific edits of a shared file. Two changes touching the same file is normal
(`Document.cpp` is touched by three); edits apply in manifest order, always from BASE.

## `targets` — compilation targets

```jsonc
"targets": {
  "linux-x64": { "mozconfig": "mozconfig",
                 "objdir":    "obj-x86_64-pc-linux-gnu",
                 "hostRid":   "linux-x64",
                 "dist":      "dist/linux-x64" }
},
"defaultTarget": "linux-x64"
```

Indexing workspaces and payloads by target is what lets a second target exist later
without reorganizing anything. `hostRid` is the .NET runtime identifier used to publish
the managed host alongside the browser.

## `builder` — the workshop

```jsonc
"builder": {
  "engine":     "docker",
  "image":      "speculum/gecko-builder:153.2.0esr-1",
  "dockerfile": "image/builder.Dockerfile",
  "volumes": { "src":   "speculum-gecko-src",
               "obj":   "speculum-gecko-obj",
               "cache": "speculum-gecko-cache" },
  "jobs": 6,
  "memoryRequired": "20g",
  "exportTriggers": ["**/*.ipdl", "ipc/ipdl/sync-messages.ini", "**/moz.build"]
}
```

`engine` is declared, not assumed: `docker` is the default and `podman` is accepted, and
anything else that speaks the same CLI can be named there. The tool shells out to it; it has
no library dependency on either.

`image` is pinned by tag and verified by digest. `dockerfile` is a reference for whoever
builds the image — **w7s never builds it** (L5); dockup does, and `builder --pull` only
fetches and verifies.

The build commands themselves are data:

```jsonc
"builder": {
  "commands": {
    "full":     "./mach build",
    "binaries": "./mach build binaries",
    "export":   "./mach build pre-export export"
  }
}
```

Those are the defaults. They are declared for the same reason the test suites are: `mach` is
today's build system, and the tool must not be the thing that prevents it from changing.
`--mode` selects a declared command by name; it does not know what `mach` is. A mode whose
command is absent is a manifest error, not a fallback.

`memoryRequired` is a precondition, not a hint. A cold Gecko build was measured at 19.6 GB
peak RSS; `validate` checks the VM limit before letting a cold build start, because
discovering this as an OOM forty minutes in is the worst possible way.

`exportTriggers` are the paths whose modification forces an IPDL/build-backend export pass
before compiling. See [04-cli.md](04-cli.md) for how `--mode auto` uses them.

## `artifact` — packaging

```jsonc
"artifact": {
  "from": "${objdir}/dist/bin",
  "out":  "${target.dist}/firefox-dist.tar.gz",
  "resolveSymlinks": true,
  "exclude": ["Test*", "*Server", "*.so-gdb.py", ".lldbinit", ".mkdir.done",
              ".parentlock", "lock"],
  "assert": ["application.ini:regular-file", "firefox:executable"]
}
```

The archive format is inferred from the `out` extension — `.tar.gz` and `.tar.zst` are
supported — so changing it is changing one string.

Every entry here is knowledge paid for once and previously buried in a shell script:
`dist/bin` is full of relative symlinks into the objdir, so without `resolveSymlinks` the
image gets a broken `application.ini` and Firefox dies on XPCOM; the excludes drop test
servers whose names Docker on Windows refuses; the asserts fail the package instead of
shipping something that cannot start.

## `run` — execution targets

```jsonc
"run": {
  "docker": { "kind": "docker", "image": "speculum/gecko:dev" },
  "wsl":    { "kind": "wsl", "distro": "Ubuntu", "dir": "~/.w7s/run" }
},
"defaultRun": "docker"
```

Same shape for both, because they are the same category of thing: a place that receives a
payload and runs it. Neither compiles (L7).

## `runtimeEnv` and `health`

```jsonc
"runtimeEnv": {
  "SPECULUM_ORCHESTRATOR_PORT": "4100",
  "SPECULUM_ORCHESTRATOR_MAX_PAIRS": "8",
  "MOZ_DISABLE_CONTENT_SANDBOX": "1"
},
"health": { "url": "http://127.0.0.1:${SPECULUM_ORCHESTRATOR_PORT}/ready" }
```

Declared once and consumed three ways: `run` exports it into the process, the product image
receives it at build time, and dockup stops repeating it. Before this, the same four
variables lived in both the Dockerfile and `dockup.json`.

## `tests`

Declared suites, their commands, where each one runs and what each one requires. The shape
is specified in [05-runner.md](05-runner.md) rather than here, because it is the one section
whose content the tool deliberately does not understand.

## `consumers`

```jsonc
"consumers": { "dockup": { "root": "../deploy", "service": "sidecar" } }
```

Used only for reporting: it is how `status` can inspect the image label and the running
container it does not produce. See [06-provider.md](06-provider.md).

## Machine state is not here

The manifest is repository content: versioned, identical on every machine. Anything
machine-specific lives in `<stateDir>/state.json`, gitignored — last sync, last build,
stamps, resolved workspace paths. A manifest that needed editing per machine would not be a
manifest.

`stateDir` defaults to `.w7s`. It is configurable for the same reason `graft.root` is, and
for one more: a repository that already uses that name for something else should not have to
argue with the tool.
