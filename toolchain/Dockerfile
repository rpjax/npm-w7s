# syntax=docker/dockerfile:1.7

# w7s toolchain image — pristine Firefox ESR + build deps + release-gate runners.
# Nothing else. Each extra package is something a release-gate test can use undeclared.
#
# Build (script chooses the pristine source — never hidden in the image):
#   docker build --build-arg PRISTINE_SOURCE=tarball \
#     -t ghcr.io/rpjax/w7s-toolchain:0.1.0 .
#
# ARG PRISTINE_SOURCE=tarball  → ADD firefox-pristine.tar.gz
# ARG PRISTINE_SOURCE=clone    → git clone at the pin (for the next ESR without a local checkout)

ARG PRISTINE_SOURCE=tarball
ARG FIREFOX_VERSION=153.2.0esr
ARG FIREFOX_REMOTE=https://github.com/mozilla-firefox/firefox.git
ARG FIREFOX_TAG=FIREFOX_153_2_0esr_RELEASE
ARG FIREFOX_COMMIT=feec67e62a5148b41fd017ccbbc463e8a6f9e83d
ARG PRISTINE_SHA256=
ARG W7S_VERSION=0.1.0

FROM ubuntu:24.04 AS base

ARG FIREFOX_VERSION
ARG FIREFOX_REMOTE
ARG FIREFOX_TAG
ARG FIREFOX_COMMIT
ARG PRISTINE_SHA256
ARG W7S_VERSION

LABEL org.opencontainers.image.title="w7s-toolchain" \
      org.opencontainers.image.description="Pristine Gecko tree + toolchain for @rodrigopjax/w7s" \
      org.opencontainers.image.vendor="rpjax" \
      w7s.firefox.version="${FIREFOX_VERSION}" \
      w7s.firefox.remote="${FIREFOX_REMOTE}" \
      w7s.firefox.tag="${FIREFOX_TAG}" \
      w7s.firefox.commit="${FIREFOX_COMMIT}" \
      w7s.pristine.sha256="${PRISTINE_SHA256}" \
      w7s.version="${W7S_VERSION}"

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Host packages needed before bootstrap / runners.
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
    && rm -rf /var/lib/apt/lists/*

# --- 1. Pristine tree at /gecko-pristine (read-only) ---
# Chosen by PRISTINE_SOURCE at build time (see stages below).

FROM base AS pristine-tarball
COPY firefox-pristine.tar.gz /tmp/firefox-pristine.tar.gz
RUN mkdir -p /gecko-pristine \
 && tar -xzf /tmp/firefox-pristine.tar.gz -C /gecko-pristine \
 && rm /tmp/firefox-pristine.tar.gz \
 && test -f /gecko-pristine/mach

FROM base AS pristine-clone
ARG FIREFOX_REMOTE
ARG FIREFOX_TAG
ARG FIREFOX_COMMIT
RUN git clone --filter=blob:none "${FIREFOX_REMOTE}" /gecko-pristine \
 && git -C /gecko-pristine fetch --tags \
 && git -C /gecko-pristine checkout "${FIREFOX_COMMIT}" \
 && test "$(git -C /gecko-pristine rev-parse HEAD)" = "${FIREFOX_COMMIT}" \
 && test -f /gecko-pristine/mach

ARG PRISTINE_SOURCE=tarball
FROM pristine-${PRISTINE_SOURCE} AS pristine

FROM pristine AS toolchain

WORKDIR /gecko-pristine

# --- 2. mach bootstrap (needs the tree) ---
RUN ./mach --no-interactive bootstrap --application-choice browser

# --- 3. Rust pin 1.90.0 (bootstrap installs 1.98+; ESR 153 configure breaks on x86_64-pc-linux-gnu) ---
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain 1.90.0 \
 && rustup default 1.90.0 \
 && rustc --version | grep -q '1.90.0'

# --- 4. sccache ---
RUN cargo install sccache --locked \
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

# --- 6. Lock the pristine tree read-only ---
RUN chmod -R a-w /gecko-pristine

WORKDIR /workspace
CMD ["bash"]
