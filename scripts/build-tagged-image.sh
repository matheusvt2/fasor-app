#!/usr/bin/env bash
# Local, docker-compose-only build+tag script. There is no CI in the MVP
# (AGENTS.md, 2026-09-21); this stands in for "image tagged with the commit"
# by gating on the merge gate and tagging the api image with the commit SHA,
# locally only -- no registry push.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Running the merge gate (pnpm verify) before tagging..."
docker compose run --rm tools pnpm verify

commit_sha="$(git rev-parse HEAD)"
tag="app-api:${commit_sha}"

echo "==> verify passed. Building the api image..."
docker compose build api

echo "==> Tagging app-api:latest as ${tag}"
docker tag app-api:latest "${tag}"

echo "==> Built and tagged ${tag} locally. No registry push."
