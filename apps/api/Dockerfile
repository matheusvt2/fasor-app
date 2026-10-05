# Pinned by digest (security review 2026-09-30, O-7/I-9); bump tag and digest together.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

ARG LIBREOFFICE_VERSION=26.2.6
# The sha256 sums The Document Foundation publishes beside each tarball (`<file>.sha256`); bump them with the version.
# TARGETARCH picks the x86-64 or aarch64 build, as in Dockerfile.prod, so the image also builds natively on
# Apple silicon; without BuildKit TARGETARCH is empty and the base image's own architecture decides.
ARG TARGETARCH
ARG LIBREOFFICE_SHA256_AMD64=fd0e8f8f2408dd2e5b90286e60f3f97cf566ba441cd48cfc5bcc68067303e0bc
ARG LIBREOFFICE_SHA256_ARM64=f8e8b1d30abde0d530d727ce1b26909ccbedc3d76bcf75d93b3dd5fcd5b8d278

# LibreOffice from The Document Foundation (Debian apt ships an older release) plus fonts, and
# poppler-utils for `pdftoppm` (section 11 rasterizes certificate PDFs with it).
RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
 && case "${arch}" in \
      amd64) lo_dir=x86_64; lo_file=x86-64; lo_sha256="${LIBREOFFICE_SHA256_AMD64}" ;; \
      arm64) lo_dir=aarch64; lo_file=aarch64; lo_sha256="${LIBREOFFICE_SHA256_ARM64}" ;; \
      *) echo "unsupported architecture '${arch}'" >&2; exit 1 ;; \
    esac \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
      fontconfig fonts-liberation fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea poppler-utils \
      libxinerama1 libfontconfig1 libdbus-1-3 libcairo2 libcups2 libglu1-mesa libsm6 libxrender1 libxext6 libglib2.0-0 libnss3 libnspr4 libxml2 libxslt1.1 libx11-6 libxt6 libgl1 libexpat1 libxcb1 \
 && mkdir /tmp/lo \
 && curl -fsSL -o /tmp/lo.tar.gz "https://download.documentfoundation.org/libreoffice/stable/${LIBREOFFICE_VERSION}/deb/${lo_dir}/LibreOffice_${LIBREOFFICE_VERSION}_Linux_${lo_file}_deb.tar.gz" \
 && echo "${lo_sha256}  /tmp/lo.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/lo.tar.gz -C /tmp/lo --strip-components=1 \
 && rm /tmp/lo.tar.gz \
 && apt-get install -y --no-install-recommends /tmp/lo/DEBS/*.deb \
 && ln -s "$(ls -d /opt/libreoffice*/program/soffice | head -n1)" /usr/local/bin/soffice \
 && rm -rf /tmp/lo \
 && apt-get clean

RUN corepack enable
WORKDIR /workspace

# Run as the host developer's uid (1000) so files written to the bind mount stay owned by them.
# Pre-creating the volume mount points hands them to that user.
RUN mkdir -p /pnpm-store /workspace/node_modules /workspace/packages/domain/node_modules \
      /workspace/apps/api/node_modules /workspace/apps/web/node_modules \
 && chown -R node:node /pnpm-store /workspace
USER node
ENV HOME=/home/node
# E7-A7/E8-A2: `corepack prepare` stores only pnpm 12's JavaScript wrapper; the wrapper
# downloads the native binary (`@pnpm/exe.linux-x64` from registry.npmjs.org) on its first
# run and keeps it beside itself as `pnpm-native`. Run it once here, as the runtime user and
# HOME, so the binary is baked into the image and no container start ever downloads it.
RUN corepack prepare pnpm@12.5.1 --activate \
 && pnpm --version \
 && test -f "$HOME/.cache/node/corepack/v1/pnpm/12.5.1/pnpm-native"
# And never fetch at run time: a gate start works with no network, and a pnpm version the
# image lacks fails at once (rebuild the image) instead of waiting on the registry.
ENV COREPACK_ENABLE_NETWORK=0
