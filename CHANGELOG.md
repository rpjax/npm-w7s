# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is `0.x`, a minor release may break; every entry that breaks says so.

## [Unreleased]

## [0.2.0] - 2026-09-21

**Breaking, and a reversal.** w7s is a local builder. It publishes nothing, pulls nothing and
depends on no registry. The contract is `docs/11-design-0.2.0.md`.

### Removed

- **The published toolchain image**, the container registry, the pinned digest and the paired
  release. That machinery solved a coordination problem this tool does not have — one
  consumer, one operator — and it cost 7.3 GB per version bump plus a full release cycle to
  try another ESR, which is the opposite of the iteration speed it exists for.
- **`test`, `start` and `stop`.** Running and testing the product belong to the Speculum
  repository. They were the door through which the sidecar would have been rewritten here.
- **Publishing from CI.** Speculum consumes this from git.

### Added

- **Three manifest keys** — `gecko`, `toolchain`, `modifications`.
- **`gecko` declared by repository and full commit**, verified with `rev-parse`. A commit SHA
  is a content hash, so verifying is a proof — which is what makes baking the tree into an
  image unnecessary rather than merely expensive. Cloned with `--filter=blob:none`.
- **One never-overwritten directory per declared version**, for both the tree and the output,
  so moving between Firefox versions is a manifest edit rather than a rebuild.
- **A generated toolchain image**: the Dockerfile is rendered from the manifest and tagged
  with the sha256 of its own bytes, so the tag is the cache key and the image is rebuilt when
  the manifest changes rather than because time passed.
- **`mach bootstrap` cached under that same tag.** It needs a checkout, so it can no longer be
  a Dockerfile layer; its state directory is keyed by the toolchain tag and mounted on every
  later container. Bootstrap fetches whatever Mozilla serves that day and has no hash to check
  against — it is not verifiable, only freezable, and this is what freezes it.
- **A generated mozconfig.** `MOZ_OBJDIR` is w7s's, because where the object directory lives
  is wiring; everything else comes from `toolchain.mozconfigOptions`, verbatim and in order.
- **A persistent sccache directory**, mounted into every build.
- **Real packaging.** `mach package` runs, and its archive is what lands in
  `out/<version>/<target>/`.

### Fixed

- **Nothing is fabricated any more.** When the real archive was absent, 0.1.0 wrote a
  placeholder file in its place and stamped the artifact as finished — a path whose only
  effect was to lie about success. A missing archive is now a failure that reports what it
  found instead.

### Distribution

Installed from git: `npm i -D github:rpjax/npm-w7s`. A `prepare` script builds on install,
since `dist/` is not committed.

## [0.1.0] - 2026-09-18

Never published. The published-image design, superseded by 0.2.0.

[unreleased]: https://github.com/rpjax/npm-w7s/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/rpjax/npm-w7s/releases/tag/v0.2.0
[0.1.0]: https://github.com/rpjax/npm-w7s/releases/tag/v0.1.0
