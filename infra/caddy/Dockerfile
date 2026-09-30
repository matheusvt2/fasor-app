# Story 11.8: Caddy with the production Caddyfile baked in. The deploy script builds it
# for the instance's platform and pushes it to ECR as fasor/caddy.
FROM caddy:2.11.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
