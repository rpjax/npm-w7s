# Resilience

Guarantees the tool owes its user, and the mechanism behind each. None of them depend on
anyone remembering anything.

| risk | mechanism |
|---|---|
| two commands at once | lock held by a named container; `--timeout` bounds the wait |
| `sync` interrupted midway | atomic writes — temp file in the same directory, then rename. Never a half-written file that later looks like drift |
| CRLF from the Windows checkout | the graft is normalized to LF **on write**; the repository carries `.gitattributes` with `text eol=lf` |
| a manifest from the future | `schema` in both manifest and lock; the CLI refuses a version it does not know |
| docker down, image missing | exit 4 with its own sentence; never degrade to "try again" |
| OOM on a cold build | `validate` checks `builder.memoryRequired` against the VM limit before starting |
| toolchain drifting | the workshop image is pinned by tag **and** verified by digest |
| accidental destruction | `reset` lists what it would delete and requires `--yes` outside a tty |
| destroying unsaved work | `reset` and `pin --set` refuse a workspace with drift unless `--force`, and print what would be lost |
| re-entrancy | every verb is idempotent; running it twice does nothing and says why |
| orphaned state | stamps written on both sides — Windows and inside the volume |
| an ambiguous anchor | L4: exactly one match, or exit 6 naming the edit `id` |
| a moved upstream tag | `init` verifies `HEAD == source.commit` and aborts otherwise |

## The destruction guard, in full

This is the mechanism that would have prevented the incident that motivated this tool:

```
$ w7s gecko reset --volumes src

  ABORT: the src volume has 3 files diverging from the graft.
  Destroying it now loses the only copy of them.

    docshell/base/BrowsingContext.cpp     +11 -0
    docshell/base/BrowsingContext.h       +2 -0
    dom/base/Document.cpp                 +7 -0

  w7s gecko adopt --all      move them into graft/hooks, then reset
  w7s gecko reset --force    destroy anyway                          exit 3
```

`pin --set` carries the same guard, because moving the pin also discards the workspace.

## What is deliberately absent

- a dependency graph of its own
- a build cache of its own
- a second deployment path
- `docker build`
- any mechanism that writes authored state outside box 1
- any flag whose purpose is to hide a failure

Each of these was considered and rejected. A tool that grows a second-rate version of
`mach`, `sccache`, `docker` or dockup becomes the thing it was built to replace.
