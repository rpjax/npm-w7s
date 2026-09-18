# w7s toolchain image

Image: `ghcr.io/rpjax/w7s-toolchain:<same version as @rodrigopjax/w7s>`

Carries the pristine Firefox ESR tree at `/gecko-pristine` (read-only) and the toolchain
a release-gate test may name: bash, python3, node 22, dotnet SDK 9, clang, g++, cmake, jq,
plus sccache and Rust 1.90.0.

The tree is cloned from the pinned remote/tag/commit (build-args in the Dockerfile). A clone
lets the build **prove** `git rev-parse HEAD` equals `FIREFOX_COMMIT`; a tarball would only
be trusted. That clone is the last one this project does for this ESR — Docker caches it on
later rebuilds.

## Build

```bash
cd toolchain
docker build -t ghcr.io/rpjax/w7s-toolchain:0.1.0 .
```

## Verify

```bash
docker run --rm ghcr.io/rpjax/w7s-toolchain:0.1.0 bash -lc '
  test -f /gecko-pristine/mach && echo "mach ok"
  cat /gecko-pristine/config/milestone.txt 2>/dev/null
  for r in bash python3 node dotnet clang g++ cmake jq sccache; do
    printf "%-10s %s\n" "$r" "$(command -v $r || echo AUSENTE)"; done
  rustc --version
  touch /gecko-pristine/teste 2>&1 | head -1
'
```

The last command must fail — `/gecko-pristine` is read-only.
