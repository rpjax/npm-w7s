# Testing this package

This document is about testing **the tool**. [05-tests.md](05-tests.md) is the contract for
the tool running _Speculum's_ tests. Different things, easy to confuse, so the words stay
distinct: this package has **tiers**, the Speculum manifest has **tests**.

## The constraint that shapes the architecture

> The portable tiers run with no container engine, no Gecko tree and no network, on Linux and
> on Windows.

A suite that needs a 10 GB image is a suite nobody runs, so regressions land. The constraint
decides the design, not the other way round.

Two consequences:

1. Whatever the tool cannot fake sits behind a seam.
2. Whatever it _can_ do for real in a temporary directory is done for real. Faking the part
   most likely to be wrong is how a green suite hides a bug.

## Seams

Four ports, each with a fake in `test/helpers/`. Production code receives them and never
reaches for a global.

| port              | wraps                           | why                                                                                 |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `ContainerEngine` | the engine CLI                  | absent in CI, and the tests assert on the argument list that would have been issued |
| `Clock`           | the system clock                | timestamps and durations must be deterministic in assertions                        |
| `Host`            | platform, environment variables | Windows and Linux path behaviour is a tested axis, not a runtime surprise           |
| `Output`          | stdout and stderr               | the single-JSON-document guarantee is asserted by capturing, not by reading         |

The filesystem is deliberately **not** a seam. Atomic rename, LF normalization and
modification-time preservation are exactly what a fake would paper over, so they are
exercised against real temporary directories.

## The pristine-tree fixture

`test/fixtures/pristine-tiny` builds a directory that stands in for `/gecko-pristine`: a
dozen files covering the shapes that matter — a file we replace, a file that is ours alone, a
`moz.build`, an `.ipdl`, a file stored with CRLF, and a deep path. It builds in well under a
second.

Every claim in [03-applying.md](03-applying.md) is tested against it with real files.

## Tiers

**`test/unit`** — pure logic and temporary directories.

| file                             | covers                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `manifest-schema.test.ts`        | one rejection per required field, per wrong type, and for an unknown key                    |
| `manifest-discovery.test.ts`     | walking up, `--manifest` precedence, two candidate files                                    |
| `modification-directory.test.ts` | a directory entry expanded into destination paths                                           |
| `modification-files.test.ts`     | an explicit file list, including differing local and Gecko layouts                          |
| `replaces-declaration.test.ts`   | both directions of the `replacesGeckoSource` check                                          |
| `path-conflict.test.ts`          | two modifications claiming one destination                                                  |
| `comparison.test.ts`             | the three outcomes, including "nothing is written"                                          |
| `line-endings.test.ts`           | CRLF input producing LF; an LF file left untouched                                          |
| `fingerprint.test.ts`            | determinism across key order and platform; one byte changes it                              |
| `currency.test.ts`               | currency from records, including the two-record disagreement                                |
| `error-phases.test.ts`           | every phase maps to its documented exit code                                                |
| `json-contract.test.ts`          | success and failure shapes; `ok` always boolean                                             |
| `test-selection.test.ts`         | selection by name, tag and classification; dependency gating; ordering                      |
| `test-classification.test.ts`    | a release-gate entry with extra packages, network access, or an unlisted runner is rejected |
| `next-steps.test.ts`             | every phase yields a non-empty next command                                                 |
| `version.test.ts`                | the reported version and required toolchain tag match `package.json`                        |

**`test/integration`** — real temporary filesystem, faked engine.

| file               | covers                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `apply.test.ts`    | applying onto the fixture; the second run writes nothing and preserves modification times; a hand edit is detected and exits 3 |
| `capture.test.ts`  | round trip — edit a file, capture it, recompute and assert byte equality                                                       |
| `validate.test.ts` | contradicted declarations, path conflicts, schema failures                                                                     |
| `package.test.ts`  | the package layout, its `build.json`, and refusal when a required file is missing                                              |
| `guards.test.ts`   | `reset` refusing a dirty tree, and the exact list it prints                                                                    |
| `cli.test.ts`      | option parsing, precedence, and `--dry-run` writing nothing                                                                    |

**`test/e2e`** — the whole chain against the faked engine.

| file               | covers                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `make.test.ts`     | `make sidecar-package` running steps in order, skipping current ones, stopping at the first failure |
| `status.test.ts`   | the rendered table and its `--json` equivalent for every currency combination                       |
| `provider.test.ts` | the four commands dockup calls, their exit codes and their JSON fields                              |

**`test/engine`** — declared, not attempted. Run by `npm run test:engine`.

Three things cannot be proven against a fake: that a real engine accepts the arguments we
build, that a named volume mounts where we believe, and that a file written inside a container
is readable outside it. A fake that agrees with our assumptions proves only self-consistency.

This tier asserts its preconditions first and exits 4 with the reason when they are absent —
the same code the CLI uses. It never compiles Gecko and never pulls the real toolchain image;
it uses a minimal image and the `pristine-tiny` fixture, so a full pass is seconds.

It is not part of `npm test`, which names the three portable tiers explicitly rather than
globbing `test/**` — so a new tier can never silently join the default run. It is in the
release checklist ([09-release.md](09-release.md)).

## Every guarantee has a test

If a guarantee can break without a test going red, it is decoration.

| guarantee                                         | test that fails                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| identical content is never rewritten              | `apply.test.ts`: second run writes zero files, modification times unchanged     |
| a working-tree edit is never overwritten          | `apply.test.ts` and `guards.test.ts`                                            |
| `replacesGeckoSource` cannot be wrong             | `replaces-declaration.test.ts`, both directions                                 |
| two modifications cannot collide silently         | `path-conflict.test.ts`                                                         |
| LF normalization                                  | `line-endings.test.ts`                                                          |
| the tool builds no image                          | `provider.test.ts`: the faked engine fails the test if it ever receives a build |
| nothing generated outside `dist/` and `.w7s/`     | `package.test.ts` asserts every written path                                    |
| a release-gate test cannot mutate its environment | `test-classification.test.ts`                                                   |
| an incomplete run is never reported as passing    | `make.test.ts`                                                                  |

The image guarantee is worth naming twice: the fake engine treats a build invocation as a
test failure. That is the difference between a boundary in a document and a boundary that
holds.

## Policy

- **Assert effects, never exit codes alone.** the apply step is asserted by resulting bytes,
  `package` by archive contents, `status` by the parsed report.
- **A missing field is a failure, never a skip.** No conditional assertions.
- **No test is softened, skipped or retried to go green.** A flake is a bug, in the test or in
  the code, and it is fixed. This is why the tool itself offers no retry flag.
- **No sleeping as a synchronizer.** The fake clock advances explicitly.

## CI

| job            | runs                                          |
| -------------- | --------------------------------------------- |
| `lint`         | `npm run lint` and `npm run format:check`     |
| `test-unit`    | `test:unit` and `test:integration` on Linux   |
| `test-e2e`     | `test:e2e` on Linux                           |
| `test-windows` | `test:unit` and `test:integration` on Windows |

`test-windows` is not ceremony. The tool runs on Windows by design, composes Windows paths
with container paths, and normalizes line endings across that boundary. Those are precisely
the defects a Linux-only suite does not see.

Every run states which tiers executed. A summary that omitted a tier is labelled incomplete —
the hosted jobs are honest about excluding the engine tier.
