# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository scaffold, conventions inherited from `@rodrigopjax/dockup`.
- Specification under `docs/`: design and boundaries, manifest schema, graft model,
  CLI surface, test runner contract, provider contract for dockup, resilience rules,
  the tool's own test plan, the release process, and CI usage.
- Error phases mapped to stable exit codes, and a documented `--json` contract.
- Declared-not-hardcoded: build commands, container engine, clone policy, graft directory
  names, archive format, state directory.

Nothing is implemented yet. `docs/` is the contract; `src/` follows it.
