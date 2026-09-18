# Release process

The same shape as `@rodrigopjax/dockup`. Two packages with two different rituals is one
ritual too many.

## What a release contains

Two artifacts, released together and never independently:

| artifact | published to |
|---|---|
| `@rodrigopjax/w7s` | npm |
| `ghcr.io/rpjax/w7s-toolchain:<version>` | the container registry |

They carry the same version because the tool and its toolchain — including the pinned Firefox
tree — must agree. A tool that could meet a toolchain it was not tested against reintroduces
exactly the divergence this design removes.

The CLI verifies this: it requires the toolchain tag matching its own version and refuses
anything else. There is no override.

## Versioning

Semantic versioning, read against the surface this tool actually exposes.

| change | bump |
|---|---|
| a new command, a new optional manifest field, a new option | minor |
| a Firefox ESR patch release in the toolchain, with no surface change | minor |
| a renamed option, a newly required manifest field, a changed exit code or JSON key | **major** |
| **a Firefox ESR series change** | **major** |
| a fix with no surface change | patch |

A Firefox series change is major because every file declared `replacesGeckoSource` was written
against the old tree and must be reviewed against the new one. The upgrade report names them,
but the work is real, so the version number says so.

Exit codes and `--json` keys are the API: dockup calls them in `prepare` steps and pipelines
branch on them.

## Changelog

Keep a Changelog. Every entry names the user-visible effect, not the commit. A Firefox
toolchain change is always an entry, with the ESR version in it.

While the version is `0.x`, minor may break, and each entry says so.

## Cutting a release

```bash
npm run lint && npm test
npm run test:engine                # the tier CI cannot run — needs a container engine
# move [Unreleased] to [x.y.z] - YYYY-MM-DD in CHANGELOG.md
npm version <major|minor|patch>
git push --follow-tags
```

The tag is what triggers publication.

## What CI does with the tag

`lint`, `test-unit`, `test-e2e` and `test-windows` run on every push and pull request. The
publishing job is gated:

```yaml
publish:
  if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
  needs: [lint, test-unit, test-e2e, test-windows]
```

A tag on red never ships. The job builds and pushes the toolchain image first, then publishes
the package — in that order, so a published CLI never points at a tag that does not exist.

```yaml
- run: npm ci
- run: npm run build
- run: docker build -t ghcr.io/rpjax/w7s-toolchain:${{ steps.version.outputs.value }} ./toolchain
- run: docker push ghcr.io/rpjax/w7s-toolchain:${{ steps.version.outputs.value }}
- run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Three details:

- **`--provenance`** attaches a signed attestation linking the tarball to this commit and this
  workflow run. It needs `permissions: id-token: write` at the workflow level.
- **`--access public`** is explicit even though `publishConfig` says the same, because a
  scoped package defaults to restricted and the failure mode is a silent private publish.
- **`prepublishOnly`** runs build, test and lint again, so a manual publish from a laptop
  cannot skip the gates.

Note that this repository builds its own toolchain image, which is not a contradiction of the
boundary in [06-provider.md](06-provider.md): that boundary is about images in a *consumer's*
repository. A package building the image it ships is a package building its own artifact.

## Secrets

| secret | what it is |
|---|---|
| `NPM_TOKEN` | an npm automation token with publish rights on the `@rodrigopjax` scope — a classic token with enforced 2FA fails in CI |
| registry write | the workflow's own token, via `permissions: packages: write` |

## Branch protection

`main` requires the four checks and a linear history. Releases are cut from `main`.

## Published contents

`files` limits the npm tarball to `dist`, `schema`, `examples`, `docs`, plus `LICENSE`,
`README.md` and `CHANGELOG.md`. Sources and tests are not shipped; the schema is, because a
consumer validating a manifest offline needs it.
