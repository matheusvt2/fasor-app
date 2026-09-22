# Reaching the local stack from a tablet over HTTPS

This is a local-network dev setup: a Caddy reverse proxy in front of the
`api` container terminates TLS with a certificate issued by a locally-run
[mkcert](https://github.com/FiloSottile/mkcert) certificate authority, so an
iPad or Android tablet on the same network gets a secure-context origin
(needed for the service worker, camera and geolocation). Nothing here is
installed on the host -- `mkcert` and `caddy` only ever run inside
containers.

## 1. Set `TABLET_HOST`

Find this machine's LAN IP (or a hostname that resolves to it):

- **Linux/macOS:** `ip addr show` (look for the LAN interface's `inet` address, e.g. `192.168.1.42`)
- **Windows:** `ipconfig` (look for "IPv4 Address" under the active adapter)

Then create or edit `.env` at the repo root:

```
TABLET_HOST=192.168.1.42
```

If `TABLET_HOST` is left unset it defaults to `localhost`, which only works
from the same machine.

`caddy`'s host ports (`CADDY_HTTP_PORT`/`CADDY_HTTPS_PORT`, default `80`/`443`)
and the `prod` profile's `api-prod` port (`API_PROD_PORT`, default `3001`) are
also set through `.env`, the same pattern as the other services. Running more
than one checkout or worktree of this stack on one machine at the same time
requires giving each its own values for these three variables (and the other
already-parameterized ports), or the second one to start fails with "address
already in use".

## 2. Start the stack

```
docker compose up
```

This starts `web`, `api`, `postgres`, `minio`, plus the new `mkcert`
(one-shot, generates the CA and a leaf certificate under `./certs`) and
`caddy` (always-on, listens on `80`/`443`) services. `mkcert` exits 0 once
the certificate is ready; `caddy` starts once it has.

## 3. Extract and install the root CA on each tablet

The CA mkcert generated lives on the host at:

```
./certs/ca/rootCA.pem
```

Copy that file to each tablet (AirDrop, a USB cable, a file share -- any
transfer works) and install it as a trusted root:

- **iPadOS:** open the file, `Settings > General > VPN & Device Management`
  and install the profile, then `Settings > General > About > Certificate
  Trust Settings` and enable full trust for the mkcert root.
- **Android:** open the file (or copy it into `Settings > Security > Encryption
  & credentials > Install a certificate > CA certificate`) and confirm the
  security warning.
- **Desktop (Linux/macOS/Windows):** import `./certs/ca/rootCA.pem` into the OS
  trust store so a desktop browser also opens `https://$TABLET_HOST` with no
  warning -- on Linux, most distributions add it with `sudo cp certs/ca/rootCA.pem
  /usr/local/share/ca-certificates/fasor-mkcert.crt && sudo update-ca-certificates`
  (browsers that keep their own store, such as Firefox, also need it imported
  there); on macOS, open the file in Keychain Access and set it to "Always
  Trust"; on Windows, open the file and install it into "Trusted Root
  Certification Authorities" for the current user.

This is a one-time step per device.

## 4. Open the app

On each tablet, open `https://$TABLET_HOST` (the value set in step 1) in the
browser. It should load with no certificate warning, on one origin serving
both the web app and `/api/*` -- no CORS involved.

## 5. Manual sign-in check (Matheus)

On both an iPad and an Android device:

1. Open `https://$TABLET_HOST`.
2. Sign in with a seeded user.
3. Confirm Home loads and the page's language tag is `lang="pt-BR"`.

This check is manual and has not been run as part of this change -- it
requires physical devices on the same network as the machine running the
stack.

## Running the `prod` profile locally

The `prod` profile approximates the future cloud image: one container
serves the built web bundle and `/api/*`, migrations run forward-only
before it starts, and logs are JSON lines on stdout.

```
docker compose --profile tools run --rm tools pnpm --filter @app/web build
docker compose --profile prod up migrate
docker compose --profile prod up -d
```

`curl http://localhost:3001/api/health` should return the health JSON, and
`docker compose logs api-prod` should show JSON log lines.
