# syntax=docker/dockerfile:1.7
#
# w7s toolchain image — pristine Firefox ESR + build deps + release-gate runners.
# Nothing else. Each extra package is something a release-gate test can use undeclared.
#
#   docker build -t ghcr.io/rpjax/w7s-toolchain:0.1.0 .

ARG FIREFOX_VERSION=153.2.0esr
ARG FIREFOX_REMOTE=https://github.com/mozilla-firefox/firefox.git
ARG FIREFOX_TAG=FIREFOX_153_2_0esr_RELEASE
ARG FIREFOX_COMMIT=feec67e62a5148b41fd017ccbbc463e8a6f9e83d
ARG W7S_VERSION=0.1.0

FROM ubuntu:24.04

ARG FIREFOX_VERSION
ARG FIREFOX_REMOTE
ARG FIREFOX_TAG
ARG FIREFOX_COMMIT
ARG W7S_VERSION

LABEL org.opencontainers.image.title="w7s-toolchain" \
      org.opencontainers.image.description="Pristine Gecko tree + toolchain for @rodrigopjax/w7s" \
      org.opencontainers.image.vendor="rpjax" \
      w7s.firefox.version="${FIREFOX_VERSION}" \
      w7s.firefox.remote="${FIREFOX_REMOTE}" \
      w7s.firefox.tag="${FIREFOX_TAG}" \
      w7s.firefox.commit="${FIREFOX_COMMIT}" \
      w7s.version="${W7S_VERSION}"

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Host packages needed before bootstrap / runners.
# apt lists stay until after bootstrap — mach installs more packages itself.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      python3 \
      python3-pip \
      python3-venv \
      build-essential \
      clang \
      g++ \
      cmake \
      jq \
      pkg-config \
      libssl-dev \
      unzip

# --- 1. Pristine tree at /gecko-pristine ---
# Shallow clone on the pin tag, then prove HEAD is the pinned commit (tags can move).
RUN git clone --depth 1 --branch "${FIREFOX_TAG}" "${FIREFOX_REMOTE}" /gecko-pristine \
 && test "$(git -C /gecko-pristine rev-parse HEAD)" = "${FIREFOX_COMMIT}" \
 && test -f /gecko-pristine/mach

WORKDIR /gecko-pristine

# --- 2. mach bootstrap (needs the tree) ---
RUN ./mach --no-interactive bootstrap --application-choice browser \
 && rm -rf /var/lib/apt/lists/*

# --- 3. Rust pin 1.90.0 (bootstrap installs 1.98+; ESR 153 configure breaks on x86_64-pc-linux-gnu) ---
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain 1.90.0 \
 && rustup default 1.90.0 \
 && rustc --version | grep -q '1.90.0'

# --- 4. sccache (0.18+ needs rustc 1.91; stay on 0.17 with the 1.90.0 pin) ---
RUN cargo install sccache --version 0.17.0 --locked \
 && sccache --version
# --- 5. Release-gate runners only: bash, python3, node 22, dotnet SDK 9, clang, g++, cmake, jq ---
# bash, python3, clang, g++, cmake, jq already present from base.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get update && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && node --version

RUN curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
 && bash /tmp/dotnet-install.sh --channel 9.0 --install-dir /usr/share/dotnet \
 && ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
 && rm /tmp/dotnet-install.sh \
 && dotnet --list-sdks

# --- 6. Lock the pristine tree read-only (.git kept — mach may consult VCS) ---
# Root ignores mode bits (CAP_DAC_OVERRIDE); the default user must be non-root
# so chmod a-w actually stops writes (GATE 2: touch /gecko-pristine/teste).
RUN chmod -R a-w /gecko-pristine

RUN useradd -m -u 1000 -s /bin/bash w7s \
 && if [ -d /root/.mozbuild ]; then mv /root/.mozbuild /home/w7s/.mozbuild; \
    else mkdir -p /home/w7s/.mozbuild; fi \
 && chown -R w7s:w7s /home/w7s \
 && mkdir -p /workspace && chown w7s:w7s /workspace

ENV HOME=/home/w7s \
    MOZBUILD_STATE_PATH=/home/w7s/.mozbuild

USER w7s
WORKDIR /workspace
CMD ["bash"]
