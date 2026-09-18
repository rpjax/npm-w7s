# w7s

**Websete Speculum toolkit.** One command surface for the Gecko engine of Speculum:
pin the upstream Firefox, apply our changes, build, package, run, and report — all
driven by a declarative `w7s.json`.

W7S stands for Websete Speculum. The package is independent — its own repository,
its own version, installed globally — but it is *tailored* to Speculum. It does not
pretend to be a generic build orchestrator.

```bash
npm install -g @rodrigopjax/w7s
```

## The mental model

Four places. Source is authored in exactly one of them.

```
┌─ 1 ─ Windows ───────────────┐   our source. THE only one.
│  gecko-engine/graft/        │   ~45 files, versioned. Where you write.
└──────────────┬──────────────┘
               │ sync  (one direction, always)
┌─ 2 ─ container ─────────────┐   the workshop. Disposable cache.
│  gecko-builder image        │   Firefox at the pin + our source + objdir.
│  volumes src / obj / cache  │   Runs on your machine. Nobody edits here.
└──────────────┬──────────────┘
               │ artifact
┌─ 3 ─ Windows ───────────────┐   the product.
│  gecko-engine/dist/<target>/│   firefox tarball + host/ + build.json
└──────────────┬──────────────┘
               │ copy
┌─ 4 ─ docker or WSL ─────────┐   execution. ZERO build.
│  receives the payload, runs │   No compiler, no source, no mach.
└─────────────────────────────┘
```

Two sentences carry the whole design:

> **Firefox's source is not our source.** It is a download identified by a commit —
> like `node_modules`. Not versioned, not edited, not kept: if it disappears, fetch it
> again. Our source is the ~45 files in box 1.

> **The workshop exists because the target is Linux.** Windows→Linux cross-compilation
> is not in Mozilla's tested matrix, so it would mean a hand-maintained sysroot and
> toolchain. The workshop runs on *your* machine — your CPU, your RAM, your disk; only
> the userland is Linux, because the output is Linux.

## Quick start

```bash
cd gecko-engine            # anywhere under it; w7s walks up to find w7s.json

w7s gecko builder --pull   # fetch the pinned workshop image
w7s gecko init             # create volumes, clone Firefox at the pin
w7s gecko sync             # apply graft/ into the source volume
w7s gecko build            # mach, in the workshop
w7s gecko artifact         # package into dist/<target>/
w7s gecko run --from obj   # fast dev loop, straight from the objdir

w7s gecko status           # where everything is and what is stale
w7s gecko where            # every path, on both sides
w7s gecko test             # the declared test suites
```

`w7s gecko ship --to dist` runs the chain and skips whatever is already fresh.

## What this tool does not do

- **It does not build images.** dockup is the only image builder; w7s produces the
  artifact and exposes it as a provider. See [docs/06-provider.md](docs/06-provider.md).
- **It does not reimplement incremental builds.** `mach` and `sccache` know what to
  recompile. w7s only decides *which mode* to invoke.
- **It has no opinion about how tests are organized.** Suites are declared in the
  manifest; their commands are opaque. See [docs/05-runner.md](docs/05-runner.md).
- **It never stores authored work outside box 1.** A workspace that diverges is drift,
  and drift is an error, not a state.

## Documentation

| doc | what it covers |
|---|---|
| [01-design.md](docs/01-design.md) | the four boxes, the seven laws, boundaries |
| [02-manifest.md](docs/02-manifest.md) | `w7s.json` field by field |
| [03-graft.md](docs/03-graft.md) | the three change kinds, the three states, the lock, the delta hash |
| [04-cli.md](docs/04-cli.md) | verbs, arguments, exit codes |
| [05-runner.md](docs/05-runner.md) | the test runner contract |
| [06-provider.md](docs/06-provider.md) | how dockup consumes w7s |
| [07-resilience.md](docs/07-resilience.md) | guarantees, locks, atomicity, line endings |
| [08-testing.md](docs/08-testing.md) | how the tool itself is tested, and the law-to-test map |
| [09-release.md](docs/09-release.md) | versioning, CHANGELOG, tag to npm |
| [10-ci.md](docs/10-ci.md) | using w7s from a pipeline |

## License

MIT
