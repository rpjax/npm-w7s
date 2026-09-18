# Manifest reference — `w7s.json`

One file at the root of the engine directory. It is found by walking up from the current
directory until a `w7s.json` or `<name>.w7s.json` appears, so a command works from anywhere
inside the engine directory. `--manifest` names one directly and skips the search.

The walk stops at the first match. Two candidate files in the same directory is an error
naming both, not a choice made silently.

Field names are camelCase, matching `dockup.json`.

Two keys. Nothing else is accepted — an unknown key is a validation error, not a warning.

```jsonc
{
  "modifications": [ ... ],
  "tests":         [ ... ]
}
```

There is no `schema`, no `kind` and no `id`: `w7s gecko` is the command family for the
Speculum Gecko engine, so it already knows what it is reading. There is no `source` and no
pin: the Firefox version belongs to the w7s release ([01-concepts.md](01-concepts.md)).

## `modifications`

An ordered list. Each entry is a unit of intent that declares how it installs itself.

Applied in declaration order when the working tree is produced. Order matters only when two entries write the same
`geckoPath`; the tool reports that as a conflict rather than letting the last one win.

### Common fields

Required on every entry, without exception.

| field                 | meaning                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `name`                | what this unit is, in words a reader recognizes                                                                |
| `description`         | why it exists; a unit nobody can justify is a unit nobody can delete safely                                    |
| `type`                | `"directory"` or `"files"` — how the file set is declared                                                      |
| `replacesGeckoSource` | `true` if these files replace files that exist in the pristine Firefox tree, `false` if they are entirely ours |

`replacesGeckoSource` is verified per file, in both directions:

- `true` and the target does **not** exist in `/gecko-pristine` → error
- `false` and the target **does** exist in `/gecko-pristine` → error

So the declaration cannot be wrong and cannot be silently wrong. Dropping a Firefox file
into a directory declared `false` fails the next production step, naming the file.

### `type: "directory"`

```jsonc
{
  "name": "projection runtime",
  "description": "our C++ compiled inside Gecko — producer, CSSOM, input, control ABI",
  "type": "directory",
  "localPath": "./modifications/runtime",
  "geckoPath": ".",
  "replacesGeckoSource": false,
}
```

Every file under `localPath` is written to the same relative path under `geckoPath`. The
directory structure in the repository is the destination structure — reading the repository
tells you exactly where each file lands.

`geckoPath` is always written out, including `"."` for the tree root. There is no implied
root.

There is no exclusion list. A directory entry must be true about its whole contents; if you
need a subset, declare a `files` entry.

### `type: "files"`

```jsonc
{
  "name": "producer headers",
  "description": "the portable C++ producer core, vendored into third_party",
  "type": "files",
  "files": [
    {
      "localPath": "./producer/include/speculum/Producer.h",
      "geckoPath": "third_party/speculum-producer/include/speculum/Producer.h",
    },
    {
      "localPath": "./producer/include/speculum/Wire.h",
      "geckoPath": "third_party/speculum-producer/include/speculum/Wire.h",
    },
  ],
  "replacesGeckoSource": false,
}
```

For the cases where the repository layout and the Gecko layout genuinely differ.

`localPath` and `geckoPath` name which side of the boundary each path belongs to. Neither is
called `source` or `target`: in a repository about a browser engine, "source" already means
something else, and "target" already means a compilation target.

### How a modification is installed

One mechanism: **write the file at `geckoPath`, replacing whatever is there.**

There is no patching, no anchoring and no hunk. A change to a Firefox file means holding the
whole file, which costs a copy and buys two things: the reader of the repository sees the
real code in context, and a Firefox upgrade produces a readable three-way merge instead of a
failed anchor.

A file is written only when its content differs from what is already at `geckoPath`. An
identical file is left untouched, mtime included, because a new mtime on a build input
invalidates work the compiler already did.

### Upgrade reports

When w7s is upgraded, the pristine tree changes. For every file declared
`replacesGeckoSource: true`, the tool compares the pristine version it was written against
with the new pristine version and reports the ones upstream touched, with the diff.

The merge is yours — you have the context. Being told is the tool's job.

## `tests`

Specified in [05-tests.md](05-tests.md), because it is the one section whose contents the
tool deliberately does not interpret.

## A complete manifest

```jsonc
{
  "modifications": [
    {
      "name": "projection runtime",
      "description": "our C++ compiled inside Gecko — producer, CSSOM, input, control ABI",
      "type": "directory",
      "localPath": "./modifications/runtime",
      "geckoPath": ".",
      "replacesGeckoSource": false,
    },

    {
      "name": "runtime install points",
      "description": "the Firefox files that call into the runtime — call sites, moz.build, IPDL",
      "type": "directory",
      "localPath": "./modifications/install",
      "geckoPath": ".",
      "replacesGeckoSource": true,
    },

    {
      "name": "fork build configuration",
      "description": "the Speculum application definition in the Gecko build system",
      "type": "directory",
      "localPath": "./modifications/build-configuration",
      "geckoPath": ".",
      "replacesGeckoSource": false,
    },

    {
      "name": "producer headers",
      "description": "the portable C++ producer core, vendored into third_party",
      "type": "directory",
      "localPath": "./producer/include",
      "geckoPath": "third_party/speculum-producer/include",
      "replacesGeckoSource": false,
    },
  ],

  "tests": [
    {
      "name": "producer core",
      "description": "hashing, encoding and the producer loop over a fake DOM",
      "entryPoint": "./tests/producer/run.sh",
      "runner": "bash",
      "workingDirectory": "./tests/producer",
      "classification": "release-gate",
      "dependsOn": [],
      "verifies": "build-output",
    },

    {
      "name": "control ABI golden",
      "description": "the control ABI has not changed without someone deciding to",
      "entryPoint": "./tests/abi/Abi.Tests.csproj",
      "runner": "dotnet test",
      "workingDirectory": "./tests/abi",
      "classification": "release-gate",
      "dependsOn": [],
      "verifies": "build-output",
    },

    {
      "name": "DOM projection parity",
      "description": "one-to-one projection against the compiled Firefox",
      "entryPoint": "./tests/parity/main.mjs",
      "runner": "node",
      "workingDirectory": "./tests/parity",
      "classification": "release-gate",
      "dependsOn": ["gecko-binary"],
      "verifies": "build-output",
    },

    {
      "name": "sidecar readiness",
      "description": "the released sidecar answers /ready and serves one session",
      "entryPoint": "./tests/readiness/check.mjs",
      "runner": "node",
      "workingDirectory": "./tests/readiness",
      "classification": "release-gate",
      "dependsOn": ["sidecar-package"],
      "verifies": "released-image",
    },

    {
      "name": "AVIF decode probe",
      "description": "theory: does AVIF decode land before the first frame is emitted?",
      "entryPoint": "./tests/avif/probe.py",
      "runner": "python3",
      "workingDirectory": "./tests/avif",
      "classification": "diagnostic",
      "dependsOn": ["gecko-binary"],
      "verifies": "build-output",
      "extraPackages": ["libavif-bin"],
    },
  ],
}
```

Forty-five files and five tests, in sixty lines, with nothing inferred.
