# One-shot local certificate authority + leaf cert generator, container-only
# (never installed on the host). No `image:` tag in docker-compose.yml so
# each worktree's compose project builds its own, never colliding.
# Security review 2026-09-30 (I-9): the base by digest and mkcert v1.4.4 by checksum, never `latest`.
FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

# The release binary for the build's own architecture, each by its published checksum.
RUN apk add --no-cache bash ca-certificates curl openssl \
 && case "$(uname -m)" in \
      x86_64) mk_arch=amd64; mk_sha256=6d31c65b03972c6dc4a14ab429f2928300518b26503f58723e532d1b0a3bbb52 ;; \
      aarch64) mk_arch=arm64; mk_sha256=b98f2cc69fd9147fe4d405d859c57504571adec0d3611c3eefd04107c7ac00d0 ;; \
      *) echo "mkcert: no pinned binary for $(uname -m)" >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /usr/local/bin/mkcert "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-${mk_arch}" \
 && echo "${mk_sha256}  /usr/local/bin/mkcert" | sha256sum -c - \
 && chmod +x /usr/local/bin/mkcert

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
