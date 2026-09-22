FROM node:24-bookworm-slim

ARG LIBREOFFICE_VERSION=26.2.6

# LibreOffice from The Document Foundation (Debian apt ships an older release) plus fonts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
      fontconfig fonts-liberation fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea \
      libxinerama1 libfontconfig1 libdbus-1-3 libcairo2 libcups2 libglu1-mesa libsm6 libxrender1 libxext6 libglib2.0-0 libnss3 libnspr4 libxml2 libxslt1.1 libx11-6 libxt6 libgl1 libexpat1 libxcb1 \
 && mkdir /tmp/lo \
 && curl -fsSL "https://download.documentfoundation.org/libreoffice/stable/${LIBREOFFICE_VERSION}/deb/x86_64/LibreOffice_${LIBREOFFICE_VERSION}_Linux_x86-64_deb.tar.gz" \
    | tar -xz -C /tmp/lo --strip-components=1 \
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
RUN corepack prepare pnpm@12.5.1 --activate
