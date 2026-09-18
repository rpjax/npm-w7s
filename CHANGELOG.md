# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository scaffold, conventions inherited from `@rodrigopjax/dockup`.
- Specification under `docs/`: concepts and vocabulary, manifest reference, how modifications
  are applied, command reference, test contract, dockup integration, guarantees, this
  package's own test plan, the release process, and pipeline usage.

### Design decisions recorded

- **The Firefox version belongs to the release, not to the consumer.** The pinned tree ships
  inside `ghcr.io/rpjax/w7s-toolchain`, versioned with the package. No pin, no clone, no
  commit verification, and no way for two machines to disagree.
- **One image.** Compiling, testing and running all happen in containers from that image,
  configured differently. Nothing compiles on the host.
- **One installation mechanism.** A modification writes a whole file at a declared path.
  No patching by anchor or hunk; a changed Firefox file is held whole, and
  `replacesGeckoSource` is verified in both directions per file.
- **Two manifest keys**: `modifications` and `tests`. No schema version, no kind, no id, no
  source, no environments, no state directory — the command family already knows what it is.
- **Nothing inferred.** No derived defaults, no folder-name conventions, no silent fallbacks;
  unknown manifest keys are errors.
- Artifacts are named for what they are: `gecko-source`, `gecko-binary`, `sidecar-package`.
- Error phases mapped to stable exit codes, and a documented `--json` contract.
- Release-gate tests may not install packages, use the network, or name a runner the image
  does not provide — enforced by manifest validation, not by convention.

Nothing is implemented yet. `docs/` is the contract; `src/` follows it.
