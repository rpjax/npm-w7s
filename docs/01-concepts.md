# Concepts and vocabulary

## Scope

**w7s builds Gecko. That is its entire purpose.**

It takes the modifications a repository declares, applies them to a pinned Firefox tree,
compiles, and produces a package. Every capability in this document exists to serve that one
sentence.

It is **not** the sidecar's build system, not its runtime, not its configuration, not its
test harness, and not its deployment tool. It knows nothing about sessions, the orchestrator,
the supervisor, the wire protocol, or how the product behaves — and it must never learn.

The test that decides whether a proposed change belongs here:

> If it requires w7s to know something about how the product _works_, it is out of scope.

That test has one deliberate exception, named in [04-cli.md](04-cli.md): `start` and `stop`
launch the compiled browser locally, so that "compile it and look at it" does not require
leaving the tool. They start a browser and stop it. They do not start the sidecar, they read
no product configuration, and they must stay that way — that pair is the door through which a
build tool quietly becomes a second implementation of the product.

---

Every term used by this tool is defined here, once. If a word is not in this table, it does
not appear in the manifest, in command output, or in the other documents.

## Artifacts

An **artifact** is a named, versioned thing the pipeline produces. Artifacts are what
commands take as arguments and what tests declare dependencies on.

| artifact          | what it is                                                              | produced from                                              |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `gecko-source`    | the Firefox tree with our modifications applied                         | the pristine tree in the toolchain image + `modifications` |
| `gecko-binary`    | the compiled Firefox, our modifications included                        | `gecko-source`                                             |
| `sidecar-package` | the deliverable: the Firefox archive, plus a record of what produced it | `gecko-binary`                                             |

Names say what the thing is. There is no `src`, no `obj`, no `dist` and no `payload` in this
tool: those are compiler and packaging jargon that require the reader to already know which
one holds what.

## The toolchain image

One image, published by this package and versioned with it:

```
ghcr.io/rpjax/w7s-toolchain:<same version as @rodrigopjax/w7s>
```

**It is pulled by digest, never by that tag.** `src/version.ts` states both references by
hand — the digest, which is the only one the container engine ever sees, and the tag, which is
printed for people to read. A tag is a mutable pointer, so it cannot carry a guarantee; the
digest can. See [09-release.md](09-release.md) for how the two are kept in step.

It carries two things: the **pristine Gecko tree** at the pinned Firefox ESR, mounted
read-only at `/gecko-pristine`, and the **toolchain** — the Gecko build dependencies plus
the runners a release-gate test is allowed to name (see [05-tests.md](05-tests.md)).

Two consequences, and they are the reason the design is shaped this way:

The pin lives in this package, in `toolchain/Dockerfile`, as the upstream remote
(`https://github.com/mozilla-firefox/firefox.git`), the tag and the commit. It is build
arguments of that image and appears nowhere else — not in a consumer's manifest and not in a
configuration file.

**The Firefox version is a property of the w7s release, not of your repository.** There is
no pin to declare, no commit to verify, no clone that can be stale, and no possibility of
two machines holding different trees. Moving to another ESR means installing another version
of w7s.

**The pristine tree is readable at all times.** Deciding whether one of our files replaces a
Firefox file is a file comparison against `/gecko-pristine`, not a git query. The tool needs
no git at all to apply modifications.

### What the image actually weighs

Measured on the first build of `0.1.0`:

| fact                            | value                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| image size                      | 7.3 GB                                                            |
| Firefox commit                  | `feec67e62a5148b41fd017ccbbc463e8a6f9e83d`                        |
| milestone reported by mach      | `153.2.0`                                                         |
| rust                            | `1.90.0`, with sccache `0.17.0`                                   |
| default user                    | `w7s` — non-root, because root ignores the `/gecko-pristine` mode |
| rebuild with a warm layer cache | ~3.5 minutes                                                      |

A cold build was not separately timed; it is dominated by the Firefox clone and
`mach bootstrap`, both of which are network-bound. Plan for it in tens of minutes, not
seconds — which is the whole reason the image is built out of band and never in a hosted CI
job (see [09-release.md](09-release.md)).

A **toolchain container** is a container started from that image. Every command that
compiles, packages, or runs a test runs inside one. Nothing in this tool executes on the
host machine except the tool itself.

### The compilation target

One target per toolchain image, because the image carries one toolchain. The target's name —
`linux-x64` today — is a property of the image, printed by `w7s gecko paths` and written into
the package. It is not declared in the manifest, because declaring a value the tool would
have to override anyway is worse than reading it from the image that decides it.

## Where things live

| location                                   | holds                                                         | lifetime                         |
| ------------------------------------------ | ------------------------------------------------------------- | -------------------------------- |
| the repository, on the developer's machine | the manifest, the modifications, the tests, the host projects | versioned                        |
| `/gecko-pristine` in the toolchain image   | the untouched Firefox tree                                    | immutable, per w7s version       |
| the `gecko-source` volume                  | the working tree: pristine plus modifications                 | disposable, rebuilt by copy      |
| the `gecko-binary` volume                  | the build directory                                           | disposable, rebuilt by compiling |
| the build cache volume                     | compiler cache                                                | disposable, self-healing         |
| `dist/` in the repository                  | the `sidecar-package`, one directory per target               | generated, gitignored, visible   |

The working tree is a volume rather than a container layer for one reason: a build directory
must survive between containers, or every compile starts from nothing. A volume initialized
by copying from `/gecko-pristine` is a local file copy — no network, no clone, no
verification step.

## The life of the binary

The single most common misunderstanding of this design is thinking the compiled browser comes
from the toolchain image. It does not. **What the image carries is source code — text files.**
The binary is created on the developer's machine, by compiling, and it is never rebuilt after
that.

In order:

1. **The image is built, once per w7s release.** Firefox's source at the pinned version goes
   in, together with the compiler. No binary goes in.
2. **`toolchain --pull`** brings that image to the machine.
3. **`make gecko-source`** copies the source out of the image into a volume and writes the
   declared modifications over it. Still only text.
4. **`make gecko-binary`** runs the compiler, inside a container from that image, over that
   volume. **This is where the binary is born**, and the build directory persists in a volume
   so the next compile is incremental.
5. **`start`** runs it. Steps 3 to 5 are the daily loop.

Then, only when delivering:

6. **`make sidecar-package`** copies the binary out of the volume into
   `dist/<target>/firefox.tar.gz`. A copy, compressed — not a second build. This step exists
   for one dull reason: a container engine cannot copy out of a volume into an image build, so
   the bytes have to become an ordinary file first.
7. **dockup** builds the product image, copying that archive in and expanding it.

So the binary is compiled once and copied twice. There is no path in this design where
production and development compile from different sources, because there is only one act of
compiling.

## Sources of truth

| question                    | answered by                                                    |
| --------------------------- | -------------------------------------------------------------- |
| which Firefox version       | the installed w7s version                                      |
| what we change in it        | `modifications` in the manifest                                |
| what proves it works        | `tests` in the manifest                                        |
| what the running product is | the `speculum.gecko.modifications` label on the released image |

## Boundaries

**This tool never builds an image.** Its own toolchain image is built by its own CI and only
ever pulled. The product image — the one that ships — is built by dockup. See
[06-provider.md](06-provider.md).

A known simplification lives here, deliberately unbuilt: `sidecar-package` could be the
product image itself, produced by this tool and merely referenced by dockup, which would
remove the archive step entirely. It is not done for two reasons. dockup has no way today to
consume an image produced by a provider. And more importantly, producing that image would
require this tool to know the product's base image, its library list, its entrypoint and its
environment — which are deployment concerns that belong with the deployment configuration.
The archive is the boundary: **this tool delivers the browser, dockup decides what wraps
it.**

**This tool never compiles on a host.** There is no native toolchain requirement beyond
Node and a container engine.

**This tool has no opinion about what a test is.** A test declares its runner, its entry
point and what it verifies; the command itself is opaque.

**This tool infers nothing.** Every path, every role, every dependency is written in the
manifest. Where a value could have had a convenient default, it is required instead: a
default that is not written down is a rule the reader has to discover by being surprised.
