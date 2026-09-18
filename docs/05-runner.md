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
      "needs":  ["obj"],                 // optional — a stage that must be fresh
      "tags":   ["<free>"],              // optional — cross-cutting selection
      "report": ".w7s/logs/${id}.json"   // optional — machine-readable summary
    }
  ]
}
```

Two boundary choices, and why each:

**`needs` uses the tool's own vocabulary** (`src`, `obj`, `dist`). That is not an opinion
about testing: it is the one thing the tool knows better than the suite, and it is what
separates **failed** from **could not run**. Without it, a suite that requires a built
binary produces a tool error dressed up as a red test.

**`report` is the only information channel besides the exit code.** If a suite writes a
summary at that path, the tool merges it into `--json`. Otherwise it captures stdout and
stderr into a log, shows the tail, and prints the path. **The tool never interprets a
suite's output** — formatting why something failed belongs to whoever wrote the test, and
the day the suite changes format the tool must not care.

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
| `--strict` | a blocked suite counts as a failure — the CI mode |

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
