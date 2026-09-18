# Test contract

The tool has no opinion about how tests are organized. It does not know what a level, a
ladder or a suite hierarchy is, and it must not, because that changes and the tool cannot be
the thing that prevents the change.

What it does: runs declared tests in a toolchain container, in declaration order, gates on
their classification, and reports what ran and what did not.

## Declaration

Every field below is required. There are no defaults, including for the ones where a default
would be convenient — see the last section of [01-concepts.md](01-concepts.md).

| field              | meaning                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `name`             | what this test is                                                               |
| `description`      | what it proves; a test nobody can justify is a test nobody can delete safely    |
| `entryPoint`       | the file to execute, relative to the manifest                                   |
| `runner`           | the command that executes it — the entry point is appended as its last argument |
| `workingDirectory` | where the command runs from                                                     |
| `classification`   | `"release-gate"` or `"diagnostic"`                                              |
| `dependsOn`        | artifacts that must be current, by name; `[]` when none                         |
| `verifies`         | `"build-output"` or `"released-image"`                                          |

Optional, and meaningful only when present: `arguments`, `environment`, `extraPackages`,
`networkAccess`, `report`, `timeoutSeconds`, `tags`.

### `runner`

The program that executes the entry point, given as a command prefix:

```
"runner": "bash"           ->  bash ./tests/producer/run.sh
"runner": "node"           ->  node ./tests/parity/main.mjs
"runner": "python3"        ->  python3 ./tests/avif/probe.py
"runner": "dotnet test"    ->  dotnet test ./tests/abi/Abi.Tests.csproj
```

It is declared rather than derived from a shebang or a file extension. A shebang depends on
the executable bit, which does not survive a Windows working copy reaching a Linux
container; an extension mapping would be a table of rules the reader has to know.

Writing a test in a new language costs one line in the manifest and no change to this
package.

### `classification`

Two values, and the difference is what each is allowed to do to its own environment.

**`release-gate`** — may block a release. It may not declare `extraPackages` and may not
declare `networkAccess`. Its `runner` must be one the toolchain image provides. It therefore
runs the same way on every machine, today and in six months.

**`diagnostic`** — proves nothing about a release. It may install packages, use the network,
and generally do whatever a theory needs at three in the morning. It never gates anything,
and `--strict` refuses to count it as coverage.

These are enforced, not agreed: a `release-gate` entry declaring `extraPackages`,
`networkAccess`, or a `runner` outside the image's list is a **manifest error**. The
guarantee is structural — it does not depend on anyone remembering the rule.

### `verifies`

What the test is examining, which is the other half of the prod-parity question.

**`"build-output"`** — the test runs in a toolchain container with `gecko-source` and
`gecko-binary` mounted, and examines what we built. Correct for producer, table, ABI and
golden tests.

**`"released-image"`** — the sidecar is started from **the image dockup released**, on a
container network, and the test runs in a separate container talking to it over the wire. The
thing under test is exactly the artifact that ships.

That distinction is what stops a test from passing because the toolchain image happens to
carry something the shipped image does not.

A test that verifies the released image has a precondition the tool does not produce: the
image has to exist and to carry the current fingerprint. The tool checks the image label. If
the label disagrees with the fingerprint, the test is **blocked** — not failed — and the next
step names dockup:

```
  release-gate  sidecar readiness                blocked
                released image label is 7c2b1e09f8aa  ->  dockup deploy dev
```

That is the same blocked semantics `dependsOn` uses, applied to the one input that belongs to
another tool.

**A note on where this value sits relative to the scope clause.** Verifying a released image
stretches the boundary stated in [01-concepts.md](01-concepts.md): it is the one place where
this tool touches something it did not produce. It is kept because the check itself is worth
having and nothing else currently offers it.

The practice, however, is the opposite of relying on it: tests against the deployed output are
written against the deployed stack, with dockup or another tool, by the repository that owns
the product. If that practice holds — and it should — this value ends up unused, and removing
it at 1.0 costs nothing. It is here as an option, not as an invitation.

### `dependsOn`

Artifact names from [01-concepts.md](01-concepts.md): `gecko-source`, `gecko-binary`,
`sidecar-package`. Any other value is a manifest error.

This is about currency, not capability: it is how the tool distinguishes **failed** from
**could not run yet**. A test that needs the compiled Firefox and finds it two commits behind
is reported as blocked, with the command that fixes it — not as a red test.

## Selecting

| selector                                      | effect                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| (none)                                        | every test, in declaration order                                             |
| `--name <name>`                               | repeatable                                                                   |
| `--tag <tag>`                                 | repeatable                                                                   |
| `--classification release-gate`               | one classification                                                           |
| `--arguments <text>`                          | appended verbatim to the selected test's command                             |
| `--list`                                      | every test, its classification, its dependencies, and whether it can run now |
| `--stop-on-failure` / `--continue-on-failure` | one or the other, explicitly                                                 |
| `--strict`                                    | a blocked test counts as a failure; diagnostics are excluded from the count  |
| `--json`                                      | one object per test, plus the contents of `report` when declared             |

There is no `--retry`, no `--skip` and no `--allow-failure`. Not an opinion about testing —
an opinion about this tool's surface: there will be no flag whose only function is to hide a
failure. A test that genuinely needs a retry puts it inside its own command, where it is
visible and versioned.

## Reporting

```
$ w7s gecko test

  release-gate  producer core                    passed    1.2s
  release-gate  control ABI golden               passed     0.4s
  release-gate  DOM projection parity            FAILED     1.8s   exit 1
                .w7s/logs/dom-projection-parity-20260918-141203.log
  release-gate  sidecar readiness                blocked
                needs sidecar-package  ->  w7s gecko make sidecar-package
  diagnostic    AVIF decode probe                passed     3.1s

  2 passed · 1 failed · 1 blocked · 1 diagnostic not counted           exit 7
```

The tool never parses a test's output. It captures stdout and stderr to a log, prints the
tail on failure, and names the path. If a test writes structured results at its declared
`report` path, those are merged into `--json` as data — formatting _why_ something failed
belongs to whoever wrote the test, and the day that format changes the tool must not care.

**A run that did not execute every release-gate test is reported as incomplete, never as
passing.** The summary always states what did not run and why. Without that rule, declaring
dependencies and environments would be the shortest path to a green wall with a third of the
coverage missing.

## Composition

`w7s gecko make sidecar-package` runs the release-gate tests that depend on nothing before
packaging, and refuses to package over a failure. Tests that depend on `sidecar-package`
itself run after it exists, when asked.
