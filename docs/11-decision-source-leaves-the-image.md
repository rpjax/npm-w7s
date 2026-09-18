# Decision: the Gecko source leaves the image in 0.2.0

**Status: decided.** This is not a proposal and not an idea to revisit. `0.2.0` is built this
way. `0.1.0` shipped with the source baked into the toolchain image, and that half of the
design is reversed on purpose, for the reasons below.

Read this before changing anything in [01-concepts.md](01-concepts.md) about where the
pristine tree lives.

## What changes

|                          | 0.1.0                                                | 0.2.0                                                        |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------ |
| the Firefox tree         | baked into the image at `/gecko-pristine`, read-only | declared in the manifest by commit, materialized on the host |
| the compiler toolchain   | in the image                                         | **stays in the image**                                       |
| changing Firefox version | a new image, a new npm release                       | a manifest edit                                              |
| versions side by side    | one per image                                        | one subdirectory per version, never overwritten              |
| `test`, `start`          | commands of this tool                                | **removed**                                                  |

## Why the source leaves

Baking the tree existed to solve a **coordination problem**: many machines, many consumers,
nobody allowed to diverge. That problem does not exist here. **w7s has exactly one consumer,
Speculum**, and one person operating it. We paid the full price of a distribution guarantee
for a situation that has nothing to distribute.

The price was not theoretical:

- **7.3 GB per version bump**, built out of band, pushed by hand, pulled by every machine.
- **Trying another ESR required a full w7s release cycle** — build the image, push it, record
  the digest, tag, publish. To answer a question as small as "does 154 compile."
- That is the exact opposite of the reason this tool was built. The original pain was that
  the process was ad hoc and slow to iterate. A design that makes an experiment cost a
  release has reintroduced the pain somewhere else.

**Determinism is not what we give up.** A commit SHA _is_ a content hash, so
`git rev-parse HEAD == declared` is a **proof**, not a hope. This is the same argument that
made us clone rather than unpack a tarball when building the image. The guarantee moves from
_baked_ to _verified_, and verified is equally strong.

## Why the toolchain does NOT leave

This is the part that must not be lost when someone simplifies further.

**`mach bootstrap` is not verifiable. It is only freezable.** It fetches whatever Mozilla is
serving on the day it runs. The same command in January and in June produces different
compilers, and nothing in its output tells you that happened. There is no hash to check it
against, because the thing you would be hashing is decided by a third party at call time.

So the rule is:

> **Anything verifiable by content is declared. Anything not verifiable is frozen in the
> image.**

The Firefox tree is verifiable — it is declared. The compiler, rust, sccache and the
bootstrap output are not — they stay in the image. That is what the image was actually
protecting. The source was along for the ride.

The image drops to roughly 2–3 GB and stops being republished when the ESR changes.

## Why this passes the manifest test

The manifest holds **only what w7s cannot know**. Under 0.1.0 the Firefox version was w7s's
own property, so it correctly stayed out. Under 0.2.0 it is the operator's choice, and a
mutable one. It belongs in the manifest by the same rule that kept it out before. The rule
did not change; the fact did.

## Consequences accepted with open eyes

- **w7s stops guaranteeing you are on the right Firefox.** That discipline moves to the
  Speculum repository, alongside the discipline already living there for tests against
  deployed output. w7s guarantees the build, not the choice.
- **A Firefox ESR series change is no longer a major bump of w7s.** It is a manifest change
  in Speculum. [09-release.md](09-release.md) must be updated when 0.2.0 lands.
- **The first build of each version costs a clone and a materialization** instead of a
  `docker pull`. Comparable bytes, different origin. The per-version subdirectory means it is
  paid once per version, not once per build.
- **`test` and `start` are removed.** They were the trap: the door through which the sidecar
  would have been rewritten inside this tool. The categorical statement stands — **w7s builds
  Gecko, full stop.** Anything that requires w7s to know how the product _works_ is out of
  scope, and running the product is knowing how it works.

## Why 0.1.0 shipped anyway

Because the tool had never been used for anything. The 45 Speculum files were not yet
migrated, so no evidence existed about where the design actually hurts. Shipping a working
baseline costs nothing at `0.x` — where minor is allowed to break — and buys a real
comparison. Redesigning on a hunch before the first real use is how tools get
over-engineered, which is the failure this decision is correcting.
