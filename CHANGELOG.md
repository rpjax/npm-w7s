# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version is `0.x`, a minor release may break; every entry that breaks says so.

## [Unreleased]

### Decided, not yet implemented

- **The Gecko source leaves the toolchain image in 0.2.0** and becomes a manifest
  declaration, verified by commit. The compiler toolchain stays in the image, because
  `mach bootstrap` is not verifiable — only freezable. `test` and `start` are removed. The
  reasoning is recorded in `docs/11-decision-source-leaves-the-image.md`; this is a decision,
  not a proposal.

## [0.1.0] - 2026-09-18

First release. `w7s` builds the Speculum Gecko engine, and that is its entire purpose.

### Added

- **`w7s gecko` — twelve commands**: `make`, `status`, `paths`, `fingerprint`, `validate`,
  `start`, `stop`, `test`, `shell`, `toolchain`, `capture`, `reset`. Error phases map to
  stable exit codes, and every command has a documented `--json` contract.
- **Three named artifacts**: `gecko-source` and `gecko-binary` as volumes, `sidecar-package`
  as `dist/<target>/`.
- **A manifest with two keys**, `modifications` and `tests`, validated against
  `schema/w7s.schema.json`. An unknown key is an error, not a warning.
- **The toolchain image** `ghcr.io/rpjax/w7s-toolchain`, carrying the pinned Firefox tree
  read-only at `/gecko-pristine` plus the build dependencies and the runners a release-gate
  test may name. This release pins Firefox `feec67e6`, milestone `153.2.0`, with rust
  `1.90.0` and sccache `0.17.0`.
- **dockup integration**: a `prepare` hook and the `speculum.gecko.modifications` image label.
- Specification under `docs/`, which is the contract the implementation follows.

### Design decisions recorded

- **The Firefox version belongs to the release, not to the consumer.** The pinned tree ships
  inside the toolchain image, versioned with the package. No pin to declare, no clone that
  can be stale, and no way for two machines to disagree.
- **The image is pulled by digest, never by tag.** `src/version.ts` states both references by
  hand; only the digest reaches the container engine. A tag is a mutable pointer, so it
  cannot carry the guarantee. Overwriting `:0.1.0` in the registry cannot change what runs.
- **One image.** Compiling, testing and running all happen in containers from it, configured
  differently. Nothing compiles on the host.
- **One installation mechanism.** A modification writes a whole file at a declared path. No
  patching by anchor or hunk, and `replacesGeckoSource` is verified in both directions, per
  file, against the pristine tree.
- **Writes are content-gated.** A file whose bytes are already correct is not rewritten, so
  mtimes survive and an iterative build stays iterative.
- **Nothing inferred.** No derived defaults, no folder-name conventions, no silent fallbacks.
- Release-gate tests may not install packages, use the network, or name a runner the image
  does not provide — enforced by manifest validation, not by convention.
- The tool knows nothing about how the product works. `start` launches a browser and stops
  there, on purpose.

[unreleased]: https://github.com/rpjax/npm-w7s/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rpjax/npm-w7s/releases/tag/v0.1.0
