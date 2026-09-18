# Integration with dockup

**dockup is the only image builder.** w7s produces `sidecar-package` and exposes it; it never
issues a build. Splitting image generation across two tools would decentralize deployment,
which is the opposite of the intent.

The toolchain image is not an exception: it belongs to this package, is built by this
package's own CI, and is only ever pulled.

## What dockup calls

```bash
w7s gecko make sidecar-package                      # ensure it is current; non-zero aborts the deploy
w7s gecko paths --artifact sidecar-package          # absolute path to the package directory
w7s gecko paths --artifact sidecar-package --json   # { path, sizeBytes, sha256, fingerprint, w7sVersion, target }
w7s gecko fingerprint                               # "a3f19c7b21d4" — for the image label
```

Four commands. Nothing else about w7s is dockup's concern.

## What dockup declares

```jsonc
{
  "id": "sidecar",
  "context": "gecko-engine",
  "dockerfile": "gecko-engine/image/Dockerfile",

  "prepare": ["w7s gecko make sidecar-package"],
  "labels": { "speculum.gecko.modifications": "$(w7s gecko fingerprint)" },
}
```

The package already sits in `dist/<target>/` inside the build context, so the Dockerfile's
`COPY` needs nothing special.

Three things this replaces:

- **A paragraph of prose.** The deploy README used to instruct a human to run a packaging
  script before deploying. Forgetting meant shipping yesterday's Firefox, silently. As a
  `prepare` step, forgetting is impossible and failing stops the deploy.
- **Generated files inside the source tree.** Previously a raw copy of the build output, with
  dangling symlinks pointing into a build directory that existed only inside WSL.
- **An unanswerable question in production.** With the label, a running container states
  which Firefox version and which modifications it carries.

## What dockup needs to support

One feature: `prepare`, a list of commands run before a container's build, where a non-zero
exit aborts. Command substitution in `labels` is desirable and optional.

## Package layout

```
dist/linux-x64/
  firefox.tar.gz    the browser carrying our modifications
  build.json        fingerprint, w7s version, Firefox version, target, timestamp, hashes
```

Two files, and nothing else. The managed host binaries are **not** part of the package: the
product Dockerfile already builds them in its own stage, which is where a managed build
belongs — it needs no Gecko toolchain and no pristine tree. Adding them here would mean w7s
holding a list of the repository's project files, which is knowledge it has no reason to own
and one more thing to keep in step.

So the boundary is: w7s owns the browser, dockup owns the image and everything managed in
it.

## Observation without production

`w7s gecko status` reports the released image and the running stack by reading the image
label and the readiness probe. It produces neither, and it says so by naming a dockup command
as the next step when the next step is dockup's.
