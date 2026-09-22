# One-shot local certificate authority + leaf cert generator, container-only
# (never installed on the host). No `image:` tag in docker-compose.yml so
# each worktree's compose project builds its own, never colliding.
FROM alpine:3.22

RUN apk add --no-cache bash ca-certificates curl openssl \
 && curl -fsSL -o /usr/local/bin/mkcert "https://dl.filippo.io/mkcert/latest?for=linux/amd64" \
 && chmod +x /usr/local/bin/mkcert

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
