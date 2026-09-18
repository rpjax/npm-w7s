# Concepts and vocabulary

Every term used by this tool is defined here, once. If a word is not in this table, it does
not appear in the manifest, in command output, or in the other documents.

## Artifacts

An **artifact** is a named, versioned thing the pipeline produces. Artifacts are what
commands take as arguments and what tests declare dependencies on.

| artifact | what it is | produced from |
|---|---|---|
| `gecko-source` | the Firefox tree with our modifications applied | the pristine tree in the toolchain image + `modifications` |
| `gecko-binary` | the compiled Firefox, our modifications included | `gecko-source` |
| `sidecar-package` | the deliverable: the Firefox archive, plus a record of what produced it | `gecko-binary` |

Names say what the thing is. There is no `src`, no `obj`, no `dist` and no `payload` in this
tool: those are compiler and packaging jargon that require the reader to already know which
one holds what.

## The toolchain image

One image, published by this package and versioned with it:

```
ghcr.io/rpjax/w7s-toolchain:<same version as @rodrigopjax/w7s>
```

It carries two things: the **pristine Gecko tree** at the pinned Firefox ESR, mounted
read-only at `/gecko-pristine`, and the **toolchain** — the Gecko build dependencies plus
the runners a release-gate test is allowed to name (see [05-tests.md](05-tests.md)).

Two consequences, and they are the reason the design is shaped this way:

**The Firefox version is a property of the w7s release, not of your repository.** There is
no pin to declare, no commit to verify, no clone that can be stale, and no possibility of
two machines holding different trees. Moving to another ESR means installing another version
of w7s.

**The pristine tree is readable at all times.** Deciding whether one of our files replaces a
Firefox file is a file comparison against `/gecko-pristine`, not a git query. The tool needs
no git at all to apply modifications.

A **toolchain container** is a container started from that image. Every command that
compiles, packages, or runs a test runs inside one. Nothing in this tool executes on the
host machine except the tool itself.

### The compilation target

One target per toolchain image, because the image carries one toolchain. The target's name —
`linux-x64` today — is a property of the image, printed by `w7s gecko paths` and written into
the package. It is not declared in the manifest, because declaring a value the tool would
have to override anyway is worse than reading it from the image that decides it.

## Where things live

| location | holds | lifetime |
|---|---|---|
| the repository, on the developer's machine | the manifest, the modifications, the tests, the host projects | versioned |
| `/gecko-pristine` in the toolchain image | the untouched Firefox tree | immutable, per w7s version |
| the `gecko-source` volume | the working tree: pristine plus modifications | disposable, rebuilt by copy |
| the `gecko-binary` volume | the build directory | disposable, rebuilt by compiling |
| the build cache volume | compiler cache | disposable, self-healing |
| `dist/` in the repository | the `sidecar-package`, one directory per target | generated, gitignored, visible |

The working tree is a volume rather than a container layer for one reason: a build directory
must survive between containers, or every compile starts from nothing. A volume initialized
by copying from `/gecko-pristine` is a local file copy — no network, no clone, no
verification step.

## Sources of truth

| question | answered by |
|---|---|
| which Firefox version | the installed w7s version |
| what we change in it | `modifications` in the manifest |
| what proves it works | `tests` in the manifest |
| what the running product is | the `speculum.gecko.modifications` label on the released image |

## Boundaries

**This tool never builds an image.** Its own toolchain image is built by its own CI and only
ever pulled. The product image — the one that ships — is built by dockup. See
[06-provider.md](06-provider.md).

**This tool never compiles on a host.** There is no native toolchain requirement beyond
Node and a container engine.

**This tool has no opinion about what a test is.** A test declares its runner, its entry
point and what it verifies; the command itself is opaque.

**This tool infers nothing.** Every path, every role, every dependency is written in the
manifest. Where a value could have had a convenient default, it is required instead: a
default that is not written down is a rule the reader has to discover by being surprised.
