# Release process

The same shape as `@rodrigopjax/dockup`. Two packages with two different rituals is one
ritual too many.

## What a release contains

Two artifacts, released together and never independently:

| artifact                                | published to           |
| --------------------------------------- | ---------------------- |
| `@rodrigopjax/w7s`                      | npm                    |
| `ghcr.io/rpjax/w7s-toolchain:<version>` | the container registry |

They carry the same version because the tool and its toolchain — including the pinned Firefox
tree — must agree. A tool that could meet a toolchain it was not tested against reintroduces
exactly the divergence this design removes.

### How the two are bound

`src/version.ts` states the image twice, by hand, and derives neither from the package
version:

```ts
export const TOOLCHAIN_IMAGE_DIGEST = "ghcr.io/rpjax/w7s-toolchain@sha256:ae738bf9…";
export const TOOLCHAIN_IMAGE_TAG = "ghcr.io/rpjax/w7s-toolchain:0.1.0";
```

**Only the digest reaches the container engine.** The tag is printed by `w7s --version` and
`w7s gecko toolchain --pull` so a person can read it, and nothing pulls or runs it.

This is not the same guarantee as checking a tag. A tag is a mutable pointer: whoever can push
to the registry can make `:0.1.0` mean other bytes, and a tool that pulled by tag would compile
a different Firefox without saying so. Pulling by digest does not detect that — it makes it
unrepresentable. The registry has no way to return anything but those bytes.

The price is that the digest exists only after the image is pushed, so a release is not one
step. That order is below, and it is not negotiable.

## Versioning

Semantic versioning, read against the surface this tool actually exposes.

| change                                                                             | bump      |
| ---------------------------------------------------------------------------------- | --------- |
| a new command, a new optional manifest field, a new option                         | minor     |
| a Firefox ESR patch release in the toolchain, with no surface change               | minor     |
| a renamed option, a newly required manifest field, a changed exit code or JSON key | **major** |
| **a Firefox ESR series change**                                                    | **major** |
| a fix with no surface change                                                       | patch     |

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

The version number is decided first, the image is built second, and the digest it produces is
written into the package third. Nothing here can be reordered.

```bash
# 1. set the version being released
#    (edit package.json directly, or `npm version --no-git-tag-version <major|minor|patch>`)

# 2. build and push the toolchain image for exactly that version
cd toolchain
docker build -t ghcr.io/rpjax/w7s-toolchain:0.1.0 .
docker push ghcr.io/rpjax/w7s-toolchain:0.1.0        # prints: digest: sha256:…

# 3. record what the push printed, in src/version.ts
#    TOOLCHAIN_IMAGE_DIGEST → ghcr.io/rpjax/w7s-toolchain@sha256:<that digest>
#    TOOLCHAIN_IMAGE_TAG    → ghcr.io/rpjax/w7s-toolchain:0.1.0

# 4. prove the whole thing locally
npm run lint && npm test
npm run test:engine                # the tier CI cannot run — needs a container engine

# 5. move [Unreleased] to [x.y.z] - YYYY-MM-DD in CHANGELOG.md, then ship
git commit -am "release: 0.1.0"
git tag -a v0.1.0 -m "0.1.0"
git push --follow-tags
```

`npm version` is not used to create the tag: it bumps the version, and by step 5 the version is
already set and already baked into a pushed image.

The tag triggers publication. The image must already be in the registry when it does.

## What CI does with the tag

`lint`, `test-unit`, `test-e2e` and `test-windows` run on every push and pull request. The
publishing job is gated:

```yaml
publish:
  if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
  needs: [lint, test-unit, test-e2e, test-windows]
```

A tag on red never ships.

The two artifacts are produced in **different places**, and on purpose:

| artifact            | built where                                                                 | why                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| the toolchain image | a machine with the engine and the time — by hand or on a self-hosted runner | it is 7.3 GB as measured on `0.1.0`, and a cold build clones Firefox and runs `mach bootstrap`; a hosted runner would pay that on every release |
| the npm package     | the hosted `publish` job                                                    | seconds                                                                                                                                         |

So the order of a release is: **build and push the image first, then tag.** The publish job
does not build the image — it _verifies the image exists_ for the version being published,
and fails if it does not:

```yaml
- name: the git tag must name the version being published
- name: log in to the container registry # GITHUB_TOKEN, packages: read
- name: the toolchain image this release runs must exist
- run: npm publish --provenance --access public
```

The image check reads `TOOLCHAIN_IMAGE_DIGEST` out of the built `dist/` and runs
`docker manifest inspect` on it, which proves those exact bytes are in the registry. It then
resolves `TOOLCHAIN_IMAGE_TAG` and requires it to point at the same digest — the tag is only a
label, but at release time a label that disagrees means it was overwritten or a constant was
mistyped, and either is a reason to stop.

Those checks are what make the pairing real rather than a promise: the package cannot reach npm
before the image it runs exists.

Building the image:

```bash
cd toolchain
docker build -t ghcr.io/rpjax/w7s-toolchain:<version> .
docker push ghcr.io/rpjax/w7s-toolchain:<version>
```

Three details:

- **`--provenance`** attaches a signed attestation linking the tarball to this commit and this
  workflow run. It needs `permissions: id-token: write` at the workflow level.
- **`--access public`** is explicit even though `publishConfig` says the same, because a
  scoped package defaults to restricted and the failure mode is a silent private publish.
- **`prepublishOnly`** runs build, test and lint again, so a manual publish from a laptop
  cannot skip the gates.

This repository building its own toolchain image is not a contradiction of the boundary in
[06-provider.md](06-provider.md): that boundary is about images in a _consumer's_ repository.
A package building the image it ships is building its own artifact.

## Secrets

| secret         | what it is                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NPM_TOKEN`    | an npm automation token with publish rights on the `@rodrigopjax` scope — a classic token with enforced 2FA fails in CI |
| registry write | the workflow's own token, via `permissions: packages: write`                                                            |

## Branch protection

`main` requires the four checks and a linear history. Releases are cut from `main`.

## Published contents

`files` limits the npm tarball to `dist`, `schema`, `examples`, `docs`, plus `LICENSE`,
`README.md` and `CHANGELOG.md`. Sources and tests are not shipped; the schema is, because a
consumer validating a manifest offline needs it.
