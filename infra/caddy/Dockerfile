# Story 11.8: Caddy with the production Caddyfile baked in. The deploy script builds it
# for the instance's platform and pushes it to ECR as fasor/caddy.
FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
COPY Caddyfile /etc/caddy/Caddyfile
