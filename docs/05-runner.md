# The test runner

The tool has **no opinion about how tests are organized** — and must not, because that
changes, and the tool cannot be the thing that prevents the change.

It does not know what a level, a rung, a ladder or a layer is. What it knows:

- there is a set of runnable things declared in the manifest;
- each has a command, and the command is opaque;
- each may declare a prerequisite in terms the tool already understands (its own stages);
- it runs a selection, in declared order, aggregates verdicts, and returns an exit code.

Any structure — naming, grouping, ordering, depth, internal granularity — is **data in the
manifest**, never a concept in the tool.

## Declaration

```jsonc
"tests": {
  "bail": true,                          // stop at the first red — declared policy, not law
  "suites": [
    { "id":     "<free id>",
      "run":    "<any command>",         // opaque to the tool
      "in":     "host",                  // where it executes — see below
      "needs":  ["obj"],                 // stage freshness
      "requires": { "platform": ["linux"], "tools": ["dotnet"], "engine": true },
      "tags":   ["<free>"],              // cross-cutting selection
      "report": "${stateDir}/logs/${id}.json"
    }
  ]
}
```

### `in` — where the command runs

The tool runs on Windows (L1) but most of what it orchestrates is Linux. A suite therefore
has to say where its command belongs; guessing would be an opinion, and a wrong one.

| `in` | executes | working directory |
|---|---|---|
| `host` (default) | the machine w7s runs on | the manifest's directory |
| `workshop` | inside the builder container, with `src`, `obj` and `cache` mounted | the source volume root |
| `target` | inside the execution target started by `run` | that target's payload root |

This is not a convenience. A C++ suite that links against Gecko headers cannot run on the
Windows host at all; a `dotnet test` of the managed host runs there perfectly well and
paying for a container would be silly; a suite that drives the running sidecar needs to be
where the sidecar is. Three genuinely different places, declared per suite.

For `in: workshop` and `in: target`, `report` is written under `stateDir`, which the tool
bind-mounts into the container. That is how a report crosses back without the suite knowing
it is in a container.

### `requires` — what the environment must provide

`needs` is about *freshness* of a stage. `requires` is about *capability* of the machine,
and it is what lets the tool say **"could not run here"** instead of producing a confusing
failure.

| key | checked how |
|---|---|
| `platform` | a list of `linux` / `windows` / `darwin`; the current platform must be in it |
| `tools` | each name must resolve on `PATH` in the place named by `in` |
| `engine` | the container engine answers and the pinned image is present |
| `memory` | the engine's VM limit is at least this much |

A suite whose `requires` are not met is reported **NOT SELECTED**, with the reason. It is
not "skipped" — nothing was passed over silently — and it is not "failed" either, because
nothing ran. This is the same distinction `needs` makes, applied to the machine instead of
to the pipeline.

### Partial runs are never reported as green

This is the rule that makes the previous section safe:

> If any suite was not selected, the summary is **PARTIAL**, never `ok`, and it names what
> did not run and why.

A run where a third of the suites never executed must not look like a run where everything
passed. `--strict` turns NOT SELECTED into a failure, which is what CI uses so that a
misconfigured runner fails loudly instead of reporting a green partial.

## Output

Generic by construction:

```
$ w7s gecko test

  <id>                                     ok         1.2s
  <id>                                     ok         4.8s
  <id>                                     FAILED     1.8s   exit 1
        .w7s/logs/<id>-20260918-141203.log  (last 20 lines above)
  <id>                                     BLOCKED
        needs: obj — behind the graft  ->  w7s gecko build

  2 ok · 1 failed · 1 blocked · stopped at first red (bail)             exit 7
```

## Options

| option | effect |
|---|---|
| (none) | everything the prerequisites allow, in declared order |
| `--suite <id>` | repeatable |
| `--tag <t>` | repeatable |
| `--filter <pattern>` | passed **verbatim** to the suite's command |
| `--list` | what exists, prerequisites, and what is blocked and why |
| `--bail` / `--no-bail` | override the manifest policy |
| `--json` | one object per suite, plus `report` when present |
| `--in <where>` | only suites declared to run there |
| `--strict` | BLOCKED or NOT SELECTED counts as a failure — the CI mode |

## What it deliberately does not offer

No `--retry`, no `--skip`, no `--allow-failure`.

That is not an opinion about tests; it is an opinion about this tool's own surface. There
will not be a flag whose only function is to hide a red. Speculum's own assert policy
states that a hardened assert is never softened and that a flake is a bug; a retry flag is
the shortest path to violating that without anyone noticing. Whoever needs a retry puts it
inside the suite's command, where it is visible and versioned.

`--all` exists to **see** everything in a CI report, never to **tolerate** anything: if any
suite went red, the exit code is 7.

## Composition

`test` is an ordinary stage of the chain. `ship --to dist` runs the suites with no
prerequisite before packaging, and never packages on top of a red.
