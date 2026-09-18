# Design and boundaries

## What this tool is

A thin orchestrator. It owns invocation, sequencing, prerequisites, staleness and
reporting. It owns no build graph, no compiler, no image builder, no test framework.

The value it adds is not doing work — it is knowing **which work is needed, in which
order, and whether the result is current**. Everything that does actual work is an
external command declared in the manifest or a well-known tool (`git`, `docker`, `mach`).

## The seven laws

Everything in this specification is a consequence of these.

**L1 — Windows is the only source. Linux compiles and executes, never authors.**
Editing inside the workshop is as wrong as editing inside a running container.

**L2 — `sync` never writes a file whose content is already correct.**
Not an optimization — the spine. Preserved mtimes are what give incremental builds back.

**L3 — an upstream file is never a whole-file copy.**
If it exists at BASE, the change is an `inject` or a `patch`, never an `add`. This is what
makes an ESR bump conflict instead of silently overwriting.

**L4 — every injection matches exactly once.**
Zero or two occurrences is a hard error. Never fuzz, never "apply wherever it fits".

**L5 — dockup is the only image builder; w7s only runs containers.**
No `docker build` is ever issued by w7s — not for the product image, not for the workshop.

**L6 — nothing generated lives inside the versioned tree.**
`dist/` and `.w7s/` are gitignored, but visible: burying the binary in a dot-folder
recreates the confusion this tool exists to remove.

**L7 — zero compilation on execution targets.**
An execution target receives a finished payload. No `mach`, no clang, no bootstrap.

## The four boxes

| box | where | what | lifetime |
|---|---|---|---|
| 1 | Windows, `gecko-engine/graft/` | our source, ~45 files | versioned forever |
| 2 | container | the workshop: Firefox at the pin + our source + objdir | disposable cache |
| 3 | Windows, `gecko-engine/dist/<target>/` | the product payload | regenerated per delta |
| 4 | docker or WSL | execution | ephemeral |

Four arrows, and only four:

- 1 → 2 (`sync`), one direction, always
- 2 → 3 (`artifact`)
- 3 → 4 (`run`)
- 2 → 1 (`adopt`) — the sanctioned escape hatch, explained below

Nobody ever edits inside box 2 or box 4.

### Why box 2 cannot be on Windows

The product image is `debian:bookworm-slim` linking `libgtk-3-0`, `libnss3`,
`libdbus-glib`. What runs there is an ELF against glibc and GTK.

Cross-compilation is normal and the host does not, in general, determine the target —
but it requires (a) the target's sysroot and (b) a build system that supports that
host→target pair. Gecko's build system supports cross-compilation only for the pairs
Mozilla tests: Linux→Windows, Linux→macOS, Linux→Android. **Windows→Linux is not in that
matrix**, which means no bootstrap toolchain bundle, POSIX tooling assumptions throughout,
and a case-sensitivity mismatch against NTFS. It is not impossible; it is unsupported, and
maintaining it would be exactly the magic this project refuses.

Useful contrast: `dotnet publish -r linux-x64` **does** work from Windows, and the .NET
host is published exactly that way. It works because .NET is managed and Microsoft ships
the target runtime pack — no native toolchain, no sysroot, no linking against system
libraries. Gecko is ~30 million lines of C++ that need the target's headers and libraries.
Different categories.

### Why box 2 being a container matters

The workshop is not a maintained Linux distribution. It is an image plus three named
volumes:

| volume | content | rebuilt by |
|---|---|---|
| `src` | Firefox at the pin + graft applied | `w7s gecko init` |
| `obj` | mach objdir | `w7s gecko build --mode full` |
| `cache` | sccache | itself |

`docker volume ls` lists them, `docker volume rm` destroys them, `w7s gecko where`
explains them. That is the whole difference between a cache and a black box: being
declared, holding no authored work, and being destroyable.

Honest about the plumbing: on Windows, Docker Desktop is itself backed by WSL2. The fast
filesystem is still a Linux VM. What changes is that no distribution is maintained — no
path, no home, no bootstrap, nothing to know.

## The escape hatch

Experimenting directly in the engine to find the right anchor is legitimate and will
happen. What may not happen is the result staying there. `w7s gecko adopt` converts a
divergent file in the workspace into a `graft/hooks` entry on the Windows side, so the
knowledge always ends up where it is visible and versioned.

Three mechanisms keep drift from surviving, none of which depend on anyone remembering:

1. `sync` reports divergence as exit 3, the same day it appears.
2. `validate` fails in CI when the workspace diverges from the graft.
3. `reset` and `pin --set` refuse to destroy a workspace that has drift without `--force`,
   and list exactly what would be lost.

## Where opinions are allowed

The tool is tailored to Speculum, so it is free to have opinions about Speculum's
identity — the `gecko-engine` driver, the notion of a graft, the four boxes.

It is *not* allowed opinions about things that change: how tests are organized, the shape
of the test ladder, the internal layout of the Gecko tree, what a build step prints. Those
are declared in the manifest or left opaque.

That distinction is what separates flexibility from indecision.
