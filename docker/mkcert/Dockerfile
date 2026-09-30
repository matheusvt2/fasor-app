# One-shot local certificate authority + leaf cert generator, container-only
# (never installed on the host). No `image:` tag in docker-compose.yml so
# each worktree's compose project builds its own, never colliding.
# Security review 2026-09-30 (I-9): the base by digest and mkcert v1.4.4 by checksum, never `latest`.
FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

RUN apk add --no-cache bash ca-certificates curl openssl \
 && case "$(uname -m)" in x86_64) ;; *) echo "mkcert: this image pins the linux-amd64 binary only" >&2; exit 1 ;; esac \
 && curl -fsSL -o /usr/local/bin/mkcert "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64" \
 && echo "6d31c65b03972c6dc4a14ab429f2928300518b26503f58723e532d1b0a3bbb52  /usr/local/bin/mkcert" | sha256sum -c - \
 && chmod +x /usr/local/bin/mkcert

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
