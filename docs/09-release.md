# Release process

Same shape as `@rodrigopjax/dockup`, on purpose: two packages with different release rituals
is one ritual too many.

## Versioning

[Semantic Versioning](https://semver.org/spec/v2.0.0.html). For a tool whose surface is a
CLI and a manifest, that means:

| change | bump |
|---|---|
| a new verb, a new optional manifest field, a new flag | minor |
| a renamed or removed flag, a required manifest field, a changed exit code or JSON key | **major** |
| a bug fix with no surface change | patch |
| `schema` in the manifest increments | **major** |

Exit codes and `--json` keys are the API. dockup calls them in `prepare` steps and CI
branches on them, so changing one silently breaks a pipeline that has no way to notice.

While the version is `0.x`, minor may break — and the CHANGELOG says so explicitly for each
one. `1.0.0` is when the manifest schema and the exit codes are considered settled.

## CHANGELOG

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Every entry names the user-visible
effect, not the commit. `## [Unreleased]` accumulates during development and is renamed to
the version with a date at release time.

Entries under `### Added` / `### Changed` / `### Fixed` / `### Removed`. A release with no
CHANGELOG entry is a release nobody can adopt safely.

## Cutting a release

```bash
npm run lint && npm test          # same gates CI will run
# move [Unreleased] to [x.y.z] - YYYY-MM-DD in CHANGELOG.md
npm version <major|minor|patch>   # bumps package.json and creates the commit + tag
git push --follow-tags
```

`npm version` creates the `vx.y.z` tag. Pushing it is what triggers publication.

## What CI does with the tag

`.github/workflows/ci.yml` runs `lint`, `test-unit`, `test-e2e` and `test-windows` on every
push and pull request to `main`. The `publish` job is gated:

```yaml
publish:
  if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
  needs: [lint, test-unit, test-e2e, test-windows]
```

So a tag on red never ships. The job then:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    registry-url: https://registry.npmjs.org
- run: npm ci
- run: npm run build
- run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Three details that matter:

- **`--provenance`** attaches a signed attestation linking the published tarball to this
  commit and this workflow run. It requires `permissions: id-token: write` at the workflow
  level, which is already set.
- **`--access public`** is explicit even though `publishConfig.access` says the same, because
  a scoped package defaults to restricted and the failure mode is a silent private publish.
- **`prepublishOnly`** runs `build && test && lint` again locally, so a manual `npm publish`
  from a laptop cannot skip the gates either.

## Secrets

One: `NPM_TOKEN`, an npm **automation** token with publish rights on the `@rodrigopjax`
scope, stored as a repository secret. Automation tokens bypass 2FA prompts, which is what a
non-interactive publish needs; a classic token with 2FA enforced will fail in CI.

## Branch protection

`main` requires the four checks to pass and a linear history — the same configuration as
npm-dockup. Releases are cut from `main`, never from a branch.

## Published contents

`package.json` `files` limits the tarball to `dist`, `schema`, `examples`, `docs`, plus
`LICENSE`, `README.md` and `CHANGELOG.md`. `src` and `test` are not shipped; `schema` and
`docs` are, because a consumer validating a manifest offline needs the schema, and because
`w7s --help` should not be the only documentation a user can reach.
