# Testing w7s

This document is about testing **the tool**. [05-runner.md](05-runner.md) is about the tool
running *Speculum's* tests. They are different things and the words are easy to confuse.

## The constraint that shapes everything

> The entire suite runs with **no container engine, no Gecko clone, no network**, on Linux
> and on Windows.

A test suite that needs Docker and 5.7 GB of Firefox is a suite nobody runs, which means
regressions land. So the constraint is not a convenience — it decides the architecture.

Two consequences:

1. Everything the tool cannot fake must sit behind a seam.
2. Everything the tool *can* do for real in a temp directory must be tested for real, not
   mocked. Mocking the part most likely to be wrong is how a green suite hides a bug.

## Seams

Five ports, each with a fake in `test/helpers/`. Production code receives them; it never
reaches for a global.

| port | wraps | why it is a seam |
|---|---|---|
| `Engine` | `docker` / `podman` CLI | not available in CI, and we assert on the argv we would have run |
| `Git` | `git` CLI | available in CI, but a 5.7 GB clone is not — the fake serves BASE blobs from a fixture |
| `Clock` | `Date.now` | stamps and elapsed times must be deterministic in assertions |
| `Env` | `process.env`, platform | Windows vs Linux path behaviour is a tested axis, not a runtime surprise |
| `Console` | stdout / stderr | the `--json` single-document guarantee is asserted by capturing, not by eyeballing |

`Fs` is deliberately **not** a seam. File operations are tested against real temp
directories, because atomic rename, line-ending normalization and mtime preservation are
exactly the behaviours a fake would paper over.

## The real-git fixture

`test/fixtures/gecko-tiny/` is a script that builds, in a temp directory, an actual git
repository with a dozen files that mimic the shapes that matter: a file with an anchor that
appears once, one with an anchor that appears twice, a `moz.build`, a `.ipdl`, a file with
CRLF, and a deep path. It is committed and tagged so `BASE` is a real commit.

Everything about the graft — the three states, injection, the lock, `adopt` — is tested
against that repository with the real `git`. No mocks. It builds in well under a second.

## Layers

**`test/unit/`** — pure functions, no filesystem unless it is a temp dir.

| file | covers |
|---|---|
| `schema.test.ts` | ajv validation: a valid manifest, and one rejection per required field and per wrong type |
| `discovery.test.ts` | walking up from a nested cwd; `--manifest` precedence; `kind` mismatch; two candidate manifests |
| `interpolate.test.ts` | `${objdir}`, `${target.dist}`, `${id}`, unknown token, recursive token |
| `inject.test.ts` | `after` / `before` / `replace`; zero matches; two matches; edit ordering across changes on one file |
| `resolve.test.ts` | the three states, including `have == want` returning "no write" |
| `eol.test.ts` | CRLF input producing LF `want`; a file already LF being left untouched |
| `delta.test.ts` | hash determinism across key order and platform; changing one byte changes the hash |
| `lock.test.ts` | generation, `--check` detecting staleness, a moved BASE blob being reported |
| `mode.test.ts` | `--mode auto` from a written-file set: export trigger, sources only, empty objdir, mozconfig change |
| `stale.test.ts` | staleness from stamps, including the double-stamp mismatch |
| `exit-codes.test.ts` | every phase maps to its documented code |
| `json-contract.test.ts` | success and failure payload shapes; `ok` always boolean |
| `suites.test.ts` | runner selection by id and tag, `needs` gating, declared order, bail vs no-bail, `--strict` |
| `next-steps.test.ts` | every failure phase yields a non-empty next step |
| `version.test.ts` | the reported version matches `package.json` |

**`test/integration/`** — real temp filesystem, real git, faked engine.

| file | covers |
|---|---|
| `sync.test.ts` | apply onto `gecko-tiny`; re-run writes nothing; mtimes preserved on the untouched; drift detected and exit 3 |
| `adopt.test.ts` | round trip — hand-edit a fixture file, `adopt`, then recompute `want` and assert byte equality |
| `validate.test.ts` | a file under `sources/` that exists at BASE is rejected (L3); ambiguous anchor rejected (L4); schema failures |
| `artifact.test.ts` | excludes applied, symlinks resolved, asserts failing the package when `application.ini` is a symlink |
| `guards.test.ts` | `reset` and `pin --set` refusing a dirty workspace, and the exact list they print |
| `cli.test.ts` | argument parsing end to end, global flag precedence, `--dry-run` writing nothing |

**`test/e2e/`** — the whole chain against the fake engine.

| file | covers |
|---|---|
| `chain.test.ts` | `ship --to dist` running stages in order, skipping fresh ones, and stopping at the first failure |
| `status.test.ts` | the rendered table and the `--json` equivalent for every combination of fresh/behind/cold |
| `provider.test.ts` | the four commands dockup calls, including exit codes and the `artifact --json` fields |

## Every law has a test

If a law can be broken without a test going red, the law is decoration.

| law | test that fails |
|---|---|
| L1 — Windows is the only source | `guards.test.ts`: destroying a dirty workspace without `--force` |
| L2 — never rewrite correct content | `sync.test.ts`: second run writes zero files and preserves mtimes |
| L3 — no whole-file copy of upstream | `validate.test.ts`: a `sources/` file present at BASE is an invariant error |
| L4 — anchors match exactly once | `inject.test.ts` zero and two matches; `validate.test.ts` end to end |
| L5 — w7s never builds an image | `provider.test.ts`: the fake engine asserts no `build` argv is ever issued |
| L6 — nothing generated in the tree | `artifact.test.ts`: output paths resolve under `dist/` or `stateDir` and nowhere else |
| L7 — no compilation on run targets | `chain.test.ts`: the `run` stage issues no build command |

The L5 test is worth naming twice: the fake `Engine` fails the test if it ever receives
`build`. That is the difference between a boundary written in a document and a boundary that
holds.

## Policy, inherited from Speculum

- **Effect asserts, not smoke.** Exit code 0 never proves a verb worked. `sync` is asserted
  by the resulting bytes, `artifact` by the archive contents, `status` by the parsed report.
- **A missing field is a failure, never a skip.** No `if (x) assert(...)`.
- **No test is softened, skipped or retried to go green.** A flake is a bug in the test or
  in the code, and it is fixed, not tolerated. This is why the tool itself offers no
  `--retry`.
- **No `sleep` as a synchronizer.** The fake clock advances explicitly.

## CI

The same four jobs as dockup, and for the same reasons:

| job | runs |
|---|---|
| `lint` | `npm run lint` and `npm run format:check` |
| `test-unit` | `test:unit` and `test:integration` on Linux |
| `test-e2e` | `test:e2e` on Linux |
| `test-windows` | `test:unit` and `test:integration` on Windows |

`test-windows` is not ceremony. w7s runs on Windows by design (L1), it composes Windows
paths with container paths, and it normalizes line endings crossing that boundary. Those are
precisely the bugs a Linux-only suite does not see.

`publish` runs only on a `v*.*.*` tag and only after all four are green. See
[09-release.md](09-release.md).

## What is not covered, and is said so on purpose

Real `mach`, a real Gecko clone, and a real container build are **not** exercised by this
suite. They cannot be, in a runner with no Docker and a few minutes.

They are covered instead by the Speculum repository's own ladder, invoked through
`w7s gecko test` on a machine that has a workshop. Two levels of testing, with an honest
boundary between them, beats one level that pretends.
