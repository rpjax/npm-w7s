# 0.2.0 — the local builder

**Status: decided.** This supersedes the published-image design of `0.1.0`. It is not a
proposal. Where this document and `01`–`10` disagree, this document wins, and those files are
folded into it as the implementation lands.

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

| field            | meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| `target`         | the compilation target name, used in `out/<version>/<target>/` |
| `baseImage`      | the image the toolchain is built on                            |
| `aptPackages`    | packages installed before anything else runs                   |
| `rustVersion`    | pinned exactly                                                 |
| `sccacheVersion` | pinned exactly                                                 |
| `extraCommands`  | additional `RUN` lines, appended last, in order, verbatim      |

**w7s assembles; it does not choose.** The tool owns the _rules of building Gecko_ — the layer
order, where the cache mounts live, that `mach bootstrap` runs and with which flags, how the
object directory is wired. You own _what goes in the box_. w7s never adds a package you did
not name and never picks a version you did not state.

### `modifications`

Unchanged from `0.1.0`. Whole-file replacement, declared by directory or by file,
`replacesGeckoSource` verified in both directions per file, writes gated on content so a file
whose bytes are already correct is never rewritten.

The pristine bytes for that comparison come from `git show <commit>:<path>` inside the
materialized tree. Not a snapshot taken at materialization time, and not whatever is on disk:
the commit is verified against the manifest, so the committed content cannot drift with the
working tree, needs nothing cached beside it, and is available for any path at any moment.
That is what replaced the read-only `/gecko-pristine` mount.

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

## Commands

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

`make` takes an artifact name, as before: `gecko-source`, `gecko-binary`, `sidecar-package`.

**Removed:** `test`, `start`, `stop`. Running the product, and testing it, belong to the
Speculum repository. They were the door through which the sidecar would have been rewritten
inside this tool.

## Distribution

w7s is consumed by Speculum as a development dependency, from git:

```
npm i -D github:rpjax/npm-w7s
```

There is no npm publish on the critical path, no registry credential, and no release ritual
pairing two artifacts. Publishing to npm later, for `npx` convenience, is a convenience
decision and nothing depends on it.

## What is deliberately absent

- a published image, a registry, a digest pin, a paired release
- a dependency graph of its own — the build system has one
- a build cache of its own — the compiler and the container engine have one
- patching by anchor or by hunk — a changed file is held whole
- any knowledge of how the product works
- any default that is not written in the manifest
- any flag whose purpose is to tolerate a failure
