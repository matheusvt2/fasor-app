#!/usr/bin/env bash
set -euo pipefail

# TABLET_HOST is developer-set via .env (never auto-detected from inside the
# container); default localhost keeps `docker compose up` working with no
# configuration at all.
TABLET_HOST="${TABLET_HOST:-localhost}"

export CAROOT=/certs/ca
mkdir -p "$CAROOT" /certs/leaf

# Installs the root CA into this container's trust store (irrelevant here)
# and, more importantly, generates the CA files under $CAROOT -- the same
# files Matheus copies out of ./certs to trust on a tablet.
mkcert -install

mkcert \
  -cert-file /certs/leaf/cert.pem \
  -key-file /certs/leaf/key.pem \
  "$TABLET_HOST" localhost 127.0.0.1

echo "mkcert: CA ready at $CAROOT, leaf cert for $TABLET_HOST/localhost/127.0.0.1 at /certs/leaf"
