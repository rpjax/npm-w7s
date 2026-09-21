# w7s

**Websete Speculum toolkit.** A local builder for the Speculum Gecko engine: materialize a
pinned Firefox commit, apply declared modifications, compile inside a locally built toolchain
image, and package the result — driven by a declarative `w7s.json` with three keys.

W7S stands for Websete Speculum. The package is independent — its own repository, its own
version — and it is _tailored_ to Speculum. It is not a generic build orchestrator and does
not pretend to be one.

```bash
npm i -D github:rpjax/npm-w7s
```

There is no published toolchain image and no registry on the critical path. Everything lives
beside the manifest.

## The model

Your repository declares three things: **which Gecko commit**, **what goes in the build
image**, and **what we change in the tree**. w7s clones, verifies, applies, builds the image
locally when needed, compiles, and packages.

```
modifications ──▶ gecko-source ──▶ gecko-binary ──▶ sidecar-package ──▶ [dockup] product image
   (your repo)   .w7s/gecko/<ver>  .w7s/build/<ver>   out/<ver>/<target>/
```

The toolchain Dockerfile is rendered from the manifest into `.w7s/Dockerfile` and tagged
`w7s-toolchain:local-<hash>`. If that tag already exists, nothing is rebuilt.

## The manifest

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

A file replacing a Firefox file is held whole — no patches, no anchors. Pristine bytes come
from `git show <commit>:<path>` after the declared commit is verified. `replacesGeckoSource`
is checked in both directions per file.

Ignore `out/` and `.w7s/` in the consumer repository; `validate` fails if they are not.

## Commands

```bash
cd gecko-engine                       # anywhere under it — w7s walks up to find w7s.json

w7s gecko toolchain                   # render + build the local image if missing
w7s gecko make sidecar-package        # does whatever is needed, skips what is current
w7s gecko status                      # every artifact, and the next command to run
w7s gecko paths                       # where everything lives
w7s gecko validate                    # schema, declarations, ignore rules
```

`make` is the only production verb — naming the artifact is the interface. `shell` opens a
shell in the toolchain container for debugging a build. There is no `test`, `start`, or
`stop`: those belong to Speculum.

## What this tool does not do

- **It does not publish or pull a toolchain image.** The image is built locally from the
  manifest and cached by content-addressed tag.
- **It does not build the product image.** dockup is the only product image builder; w7s
  produces `sidecar-package` — [docs/11-design-0.2.0.md](docs/11-design-0.2.0.md).
- **It does not reimplement incremental builds.** The build system and the compiler cache know
  what to recompile.
- **It infers nothing.** No derived defaults, no folder-name conventions, no silent fallbacks.
  Where a default would be convenient the field is required instead.

## Documentation

The contract is a single document: [docs/11-design-0.2.0.md](docs/11-design-0.2.0.md).

## License

MIT
