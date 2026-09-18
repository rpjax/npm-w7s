# w7s

**Websete Speculum toolkit.** One command surface for the Speculum Gecko engine: apply our
modifications to Firefox, compile, package, run and test — driven by a declarative
`w7s.json` with two keys.

W7S stands for Websete Speculum. The package is independent — its own repository, its own
version, installed globally — and it is _tailored_ to Speculum. It is not a generic build
orchestrator and does not pretend to be one.

```bash
npm install -g @rodrigopjax/w7s
```

## The model

The Firefox version is not something your repository declares. It ships inside the toolchain
image, versioned with this package:

```
@rodrigopjax/w7s@0.4.0   ⇄   ghcr.io/rpjax/w7s-toolchain:0.4.0   (Firefox 153.2.0esr)
```

Your repository declares two things: **what we change in Firefox**, and **what proves it
works**. Everything else the tool already knows.

Three artifacts, each named for what it is:

```
modifications ──▶ gecko-source ──▶ gecko-binary ──▶ sidecar-package ──▶ [dockup] released image
   (your repo)      (a volume)       (a volume)      (dist/<target>/)
```

Every command runs inside a container from that one image. Nothing compiles on the host, and
nothing about the host's installed toolchains affects the result.

## The manifest

```jsonc
{
  "modifications": [
    {
      "name": "projection runtime",
      "description": "our C++ compiled inside Gecko",
      "type": "directory",
      "localPath": "./modifications/runtime",
      "geckoPath": ".",
      "replacesGeckoSource": false,
    },

    {
      "name": "runtime install points",
      "description": "the Firefox files that call into the runtime",
      "type": "directory",
      "localPath": "./modifications/install",
      "geckoPath": ".",
      "replacesGeckoSource": true,
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
  ],
}
```

A file replacing a Firefox file is held whole — no patches, no anchors. It costs a copy and
buys two things: the reader sees the real code in context, and a Firefox upgrade produces a
readable merge instead of a broken hunk. `replacesGeckoSource` is verified in both
directions, per file, so the declaration cannot be silently wrong.

## Commands

```bash
cd gecko-engine                       # anywhere under it — w7s walks up to find w7s.json

w7s gecko toolchain --pull            # the image this version requires
w7s gecko make sidecar-package        # does whatever is needed, skips what is current
w7s gecko test                        # the declared tests
w7s gecko status                      # every artifact, and the next command to run
w7s gecko paths                       # where everything lives, both spellings
```

`make` is the only production verb — naming the artifact is the interface, and there is no
second way to do the same thing. `start` runs the sidecar locally for iteration; `shell`
opens a shell in the toolchain container.

## What this tool does not do

- **It does not build images.** dockup is the only image builder; w7s produces the package
  and exposes it as a provider — [docs/06-provider.md](docs/06-provider.md).
- **It does not reimplement incremental builds.** The build system and the compiler cache know
  what to recompile.
- **It has no opinion about how tests are organized.** A test declares its runner, its entry
  point and what it verifies; the command is opaque — [docs/05-tests.md](docs/05-tests.md).
- **It infers nothing.** No derived defaults, no folder-name conventions, no silent
  fallbacks. Where a default would be convenient the field is required instead.

## Documentation

| document                                    | covers                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| [01-concepts.md](docs/01-concepts.md)       | vocabulary, artifacts, the toolchain image, boundaries     |
| [02-manifest.md](docs/02-manifest.md)       | `w7s.json`, field by field                                 |
| [03-applying.md](docs/03-applying.md)       | how modifications are applied, and the guards              |
| [04-cli.md](docs/04-cli.md)                 | commands, options, error phases, exit codes, JSON contract |
| [05-tests.md](docs/05-tests.md)             | the test contract                                          |
| [06-provider.md](docs/06-provider.md)       | integration with dockup                                    |
| [07-guarantees.md](docs/07-guarantees.md)   | what is guaranteed, and by what mechanism                  |
| [08-testing-w7s.md](docs/08-testing-w7s.md) | how this package is tested                                 |
| [09-release.md](docs/09-release.md)         | versioning, the paired release, publishing                 |
| [10-ci.md](docs/10-ci.md)                   | using w7s from a pipeline                                  |

## License

MIT
