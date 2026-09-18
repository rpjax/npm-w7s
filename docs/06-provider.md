# Provider contract — how dockup consumes w7s

**dockup is the only image builder** (L5). w7s produces the artifact and exposes it; it
never issues `docker build`, not for the product image and not for the workshop image.
Fragmenting image generation would decentralize deployment, which is the opposite of the
goal.

## The four commands dockup needs

```bash
w7s gecko ship --to dist        # ensure a fresh payload; non-zero aborts the deploy
w7s gecko artifact --path       # absolute path to the tarball
w7s gecko artifact --json       # { path, sha256, bytes, delta, pin, target, stale }
w7s gecko delta                 # "a3f19c" — for tags and labels
```

That is the whole surface. Everything else about w7s is irrelevant to dockup.

## On the dockup side

```jsonc
{ "id": "sidecar",
  "context": "gecko-engine",
  "dockerfile": "gecko-engine/image/Dockerfile",

  "prepare": ["w7s gecko ship --to dist"],
  "labels":  { "speculum.gecko.delta": "$(w7s gecko delta)" } }
```

Because w7s runs on Windows, the payload is already on Windows at
`gecko-engine/dist/<target>/`, inside the build context. The Dockerfile's `COPY` stays as
it is; no BuildKit `--build-context` is needed.

Three things this replaces:

- **A paragraph of prose.** The deploy README previously instructed a human to run
  `wsl -d Ubuntu -e bash gecko-engine/scripts/pack-gecko-dist.sh` *before* `dockup deploy`.
  If they forgot, the stack came up with yesterday's Firefox and said nothing. As a
  `prepare` step, forgetting is impossible and failing stops the deploy.
- **3.2 GB of generated files inside the source tree** — a raw `dist/bin` copy full of
  dangling symlinks pointing into an objdir that only existed inside WSL. Now: one payload
  directory per target.
- **An unanswerable question in production.** With the delta label, you can inspect a
  running container and know exactly which set of Gecko changes it carries.

## What dockup needs to gain

One feature: `prepare`, a list of commands run before a container's build, where a non-zero
exit aborts. Command substitution in `labels` is desirable and optional.

dockup also gains the workshop image as a build target that is never deployed.

## Observing without producing

`w7s gecko status` reports the image and the stack, by reading the image label and the
container's readiness probe. It produces neither. Observing is not fragmenting — and it is
what allows the status output to end with a next step that belongs to another tool:

```
  next -> dockup deploy dev
```

## Payload layout

```
dist/linux-x64/
  firefox-dist.tar.gz      the browser carrying our delta
  host/                    orchestrator + supervisor, self-contained linux-x64
  build.json               delta, pin, target, timestamp, sha256 per piece
```

`host/` is published **from Windows** with `dotnet publish -r linux-x64 --self-contained`.
That needs no workshop at all, because .NET is managed and the target runtime pack ships
prebuilt. Only the browser needs a Linux userland.
