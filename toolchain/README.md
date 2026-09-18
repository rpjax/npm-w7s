# w7s toolchain image

Image: `ghcr.io/rpjax/w7s-toolchain:<same version as @rodrigopjax/w7s>`

Carries the pristine Firefox ESR tree at `/gecko-pristine` (read-only) and the toolchain
a release-gate test may name: bash, python3, node 22, dotnet SDK 9, clang, g++, cmake, jq,
plus sccache and Rust 1.90.0.

## Build

The pristine source is chosen by the **build script**, not hidden in the image:

```bash
# From an existing checkout at the BASE pin (this release):
GECKO=/root/speculum-gecko/checkout
BASE=feec67e62a5148b41fd017ccbbc463e8a6f9e83d
OUT=/root/w7s-toolchain-build

mkdir -p "$OUT"
git -C "$GECKO" cat-file -e "$BASE^{commit}" || { echo "ABORT: BASE ausente"; exit 1; }
git -C "$GECKO" archive --format=tar.gz -o "$OUT/firefox-pristine.tar.gz" "$BASE"
sha256sum "$OUT/firefox-pristine.tar.gz" | tee "$OUT/firefox-pristine.sha256"
du -h "$OUT/firefox-pristine.tar.gz"

cp "$OUT/firefox-pristine.tar.gz" ./firefox-pristine.tar.gz
PRISTINE_SHA256=$(cut -d' ' -f1 "$OUT/firefox-pristine.sha256")

docker build --build-arg PRISTINE_SOURCE=tarball \
  --build-arg PRISTINE_SHA256="$PRISTINE_SHA256" \
  -t ghcr.io/rpjax/w7s-toolchain:0.1.0 .
```

For a future ESR without a local checkout:

```bash
docker build --build-arg PRISTINE_SOURCE=clone \
  -t ghcr.io/rpjax/w7s-toolchain:<version> .
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
