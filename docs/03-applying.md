# Applying modifications

`w7s gecko make gecko-source` brings the working tree up to date with the manifest. It is the
only operation that writes into that tree, and every other production step runs it first.

"Apply" is the word used below for what that step does to one file. It is not a second
command: there is one production verb, `make` — see [04-cli.md](04-cli.md).

## The comparison

For every file a modification declares, three contents are in play:

| name | where it comes from |
|---|---|
| pristine | `/gecko-pristine/<geckoPath>` in the toolchain image, read-only |
| declared | the file at `localPath` in the repository, normalized to LF |
| current | `<geckoPath>` in the working tree |

And three outcomes:

```
current == declared   ->  nothing is written
current == pristine   ->  declared is written
otherwise             ->  the file was edited in the working tree
                          the step stops, exit 3, names the file
```

The third outcome is the one that matters. A tool that overwrites it loses work silently; a
tool that ignores it builds something the repository cannot reproduce. Stopping is the only
honest option, and `w7s gecko capture` is the way out (below).

## Why identical files are not rewritten

Writing a file that already has the right content gives it a new modification time. The
Gecko build system reads modification times: a touched `.ipdl` regenerates its headers and
everything that includes them, and a touched `moz.build` re-runs the build backend. Even
when the compiler cache returns the same objects, the object files are newer and the final
link runs again — and the link is the dominant cost.

This is not a micro-optimization. It is the difference between a fifteen-second incremental
build and one that recompiles half the tree.

## Line endings

`declared` is normalized to LF before comparison and before writing. The repository lives on
Windows and the tree is consumed by a Linux toolchain; without normalization, every file
authored on Windows would differ from its pristine counterpart forever, so the step would
rewrite it on every run and the previous section would be moot.

The repository carries `.gitattributes` with `text eol=lf` for the same reason.

## Writes are atomic

Every write goes to a temporary file in the destination directory and is then renamed. An
interrupted `apply` leaves either the old content or the new one — never half a file, which
on the next run would look like a hand edit and stop the pipeline for the wrong reason.

## Conflicts between modifications

Two entries declaring the same `geckoPath` is a manifest error, reported before anything is
written, naming both entries. Last-one-wins would make the order of a list carry meaning
that nobody reading it would notice.

## Capturing a working-tree edit

Experimenting directly in the engine is legitimate, and `w7s gecko shell` exists for it.
What may not happen is the result staying there.

```
w7s gecko capture --file dom/base/Document.cpp --into "runtime install points"
```

The tool copies the file out of the working tree into the named modification's `localPath`,
verifies that `replacesGeckoSource` agrees with the pristine tree, and then re-runs the
comparison: `declared` must now equal `current`, byte for byte. If it does not, the capture
was incomplete and the difference is printed.

The verifier is the same code that runs on every production step. The mechanism used daily is the
mechanism that proves a migration correct.

## The fingerprint

```
fingerprint = sha256( w7s version || every (geckoPath, content hash), sorted )[0:12]
```

It identifies exactly one state of the modified tree. It travels into `build.json` inside the
`sidecar-package`, into the `speculum.gecko.modifications` label on the released image, and
into `w7s gecko fingerprint`.

It includes the w7s version because the same modifications on a different pristine tree are a
different tree. That is what makes the label on a running container answerable: it identifies
the Firefox version and our changes together.

## Guards against losing work

`w7s gecko reset gecko-source` and any upgrade that replaces the pristine tree refuse to run
while the working tree holds an edit that is not in the repository:

```
$ w7s gecko reset gecko-source

  REFUSED  3 files in the working tree differ from the manifest.
           Resetting now discards the only copy.

    docshell/base/BrowsingContext.cpp
    dom/base/Document.cpp
    dom/base/Document.h

  w7s gecko capture --all --into <modification>   keep them, then reset
  w7s gecko reset gecko-source --force            discard them          exit 3
```
