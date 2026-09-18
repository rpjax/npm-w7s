# Guarantees

What the tool owes its user, and the mechanism behind each. None of these depend on anyone
remembering anything.

| risk                                       | mechanism                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| two commands running at once               | a lock held by a named container; `--timeout` bounds the wait                                |
| an interrupted write                       | temporary file in the destination directory, then rename — never half a file                 |
| Windows line endings reaching a Linux tree | declared content is normalized to LF on write; the repository carries `text eol=lf`          |
| an unknown manifest key                    | validation error, not a warning — a typo in a field name is not a silent no-op               |
| the container engine being absent          | exit 4 with its own message; never a degraded partial result                                 |
| a cold build exhausting memory             | the required amount is checked against the engine's limit before the build starts            |
| the toolchain drifting from the tool       | the image is pulled by digest, stated in the package — the version cannot select other bytes |
| the toolchain tag being overwritten        | nothing reads the tag; rewriting `:0.1.0` in the registry cannot change what runs            |
| losing an uncaptured edit                  | `reset` and upgrades refuse while the working tree differs, and list what would be lost      |
| running a command twice                    | every command is idempotent; the second run does nothing and says why                        |
| an artifact recorded as current but gone   | currency is recorded beside the repository and inside the volume; disagreement means missing |
| a modification contradicting the tree      | `replacesGeckoSource` is verified in both directions, per file                               |
| two modifications writing the same path    | reported as a conflict before anything is written                                            |
| upstream changing a file we replace        | the upgrade report names it and shows the diff                                               |
| generated files reaching version control   | `validate` fails if `dist/` and `.w7s/` are not ignored by the consumer's repository         |
| a green run with missing coverage          | a run that skipped a release-gate test is reported incomplete, never passing                 |

## What is deliberately absent

- a dependency graph of its own — the build system has one
- a build cache of its own — the compiler has one
- a second deployment path — dockup is the only one
- `docker build` — no image is built by this tool
- pulling the toolchain by tag — a tag is a mutable pointer, so it names nothing
- patching by anchor or by hunk — a changed file is held whole
- git, for applying modifications — the pristine tree is a directory
- any flag whose purpose is to tolerate a failure
- any default that is not written in the manifest
- any knowledge of how the product works — sessions, orchestrator, supervisor, wire protocol,
  product configuration. `start` launches a browser and stops there, on purpose

Each of these was considered and rejected. A tool that grows a second-rate version of the
build system, the compiler cache, the container engine or the deployer becomes the thing it
was built to replace.
