# Offline proof — manual device script (PRD Q0, FR-54, TC-12)

**Status: PENDING — not executed; run by Matheus.**
No automated test and no pull request may claim this check has run. Until a dated result
file exists beside this script, the outcome of every step below is unknown.

**Repeats.** This script is run once now (Story 1.8, the gate for Epic 5 and Epic 6) and
again at the close of every epic that touches capture or sync — Epics 5, 6 and 8
(decision 7 of 2026-09-21, TC-12).

**Why by hand.** WebKit on the desktop is the only automated proxy for iPadOS Safari, and
the two things that matter most here cannot be automated at all: the browser evicting the
origin's storage on its own schedule, and the camera. The automated suite
(`pnpm test:e2e:matrix`) covers the shell precache, the draft, the refused write, the
eviction-recovery screen and the 5-day banner on desktop Chrome, Android Chrome emulation
and WebKit; this script covers what a real device does.

---

## Preconditions

1. **Story 1.7's HTTPS origin is up.** `docker compose up` on the developer machine, with
   `TABLET_HOST` set in `.env` to the machine's LAN hostname or IP. The tablets reach
   `https://⟨TABLET_HOST⟩` (or `:⟨CADDY_HTTPS_PORT⟩`) on the office Wi-Fi.
2. **The local root CA is installed on both devices.** Copy `certs/ca/rootCA.pem` to the
   iPad and to the Android tablet and trust it (iPadOS: Settings › General › VPN & Device
   Management to install, then Settings › General › About › Certificate Trust Settings to
   enable full trust). Without this the origin is not a secure context and the service
   worker, the camera and Geolocation are all unavailable.
3. **A seeded user exists**: `docker compose run --rm tools pnpm seed:users -- --email …`.
4. **The bundle is built and served.** The service worker only precaches a real build, so
   `apps/web/dist` must exist before the tablets open the origin:

   ```bash
   docker compose run --rm tools pnpm --filter @app/web run build:e2e
   ```

   **Use `build:e2e`, not `build`, until Epic 5 exists.** Steps 3 and 4 need a field that
   writes an op and registers a draft source, and the only one before Epic 5 is the
   dev-only fixture at **`/__fixture/field`**, which a production build deliberately
   leaves out. `build:e2e` is the same bundle — hashed assets, a stamped `sw.js`, the same
   service worker — built in development mode so the fixture route is in it. From Epic 5
   on, run `pnpm --filter @app/web build` instead and use a real sheet; note in the result
   file which build and which surface you used.
5. **Devices**: one iPad running iPadOS Safari, one Android tablet running Chrome. Record
   the exact OS and browser versions.

Copy `ipad-YYYY-MM-DD.template.md` to `ipad-⟨today⟩.md` and fill it in as you go: **one
file per run**, holding both devices (TC-12 fixes this filename, and the template has a
step table per device). Steps 1-4 and 6-8 can be filed before step 5's wait is over — see
"Filing a partial run" below.

---

## Steps

Run every step on both devices. Record the outcome of each one, and take the screenshots
the template asks for.

### 1. Sign in on the device

Open `https://⟨TABLET_HOST⟩`, sign in with the seeded user, and reach Home.

**Record:** that sign-in succeeded; the wordmark reads `PRODUTO`; the relatório list and
the status board are drawn. Screenshot of Home.

### 2. Confirm the shell worker installed

Leave the tab open for a few seconds after Home paints.

**Record:** on iPadOS, Safari › Develop (from a Mac) › the device › Service Workers shows
one worker for this origin; on Android Chrome, `chrome://inspect` › Service workers. If
inspection is not available, note that and rely on step 4 instead.

### 3. Go offline and commit values

Open the capture surface:

- **Until Epic 5 ships a sheet:** go to `https://⟨TABLET_HOST⟩/__fixture/field` — the
  dev-only field fixture, one labelled input on the real commit path with a draft source
  registered. It has no navigation entry; type the address.
- **From Epic 5 on:** open a relatório and use a real sheet.

Turn on Airplane Mode (or switch Wi-Fi off). Then:

- type a value and commit it (blur, Enter or a discrete control); the readout under the
  field shows what the outbox accepted. Do this two or three times with different values;
- then type one more value and **do not** commit it — that uncommitted text is what step 4
  checks;
- watch the sync badge turn to its offline state and the toast "Sem conexão. Tudo fica
  salvo neste aparelho." appear.

**Record:** every value you typed, verbatim, which ones you committed, which one you left
uncommitted, and the badge state. Screenshot.

### 4. Close the browser completely and reopen it, still offline

Not just the tab: close Safari (swipe it away from the app switcher) and Chrome
(force-stop), so the next open is a cold start with no network.

Reopen the browser, the origin, and the same surface as in step 3.

**Record:**

- whether the app loaded at all (this is the shell precache under test: without it the
  browser shows its own error page);
- whether Home drew from the device, with the same relatórios and the same counts;
- whether every value you committed in step 3 is still there;
- whether a "Rascunho encontrado — Recuperar" toast appeared for the value you left
  uncommitted, that the field was **not** filled in by itself, and that pressing
  "Recuperar" — and only that — applied it.

Screenshot of the reopened Home and of the toast.

### 5. Leave the tab unused for the eviction window

Leave the device alone, with the app closed, for at least **seven days** (iPadOS Safari's
documented cap on unused-origin storage). Use the device normally in the meantime — the
eviction is more likely on a device that browses other sites.

Then open the origin again, online.

**Record:**

- whether the data is still on the device, or whether the one-time screen "Dados deste
  aparelho foram apagados" appeared;
- if it appeared: whether its action downloaded the relatórios again and whether a reload
  afterwards went straight to Home;
- whether anything that had not yet been sent was lost, and exactly what.

Screenshot of whichever state you got.

### 6. Read the storage figures

In the app: Conta › Armazenamento neste aparelho.

**Record:** the "Em uso" line as shown. Then, from a connected desktop Safari/Chrome
inspecting the device, run in the console and record both numbers:

```js
await navigator.storage.estimate()
```

This is the number AD-8's storage-low threshold is waiting for: the provisional 500 MB is
marked `[ASSUMPTION]` in the spine and is set from this reading. No banner ships on it
until this step has run.

### 7. Open the camera from a page

Still on the device, open the camera from the app (or, until Epic 6's capture surface
exists, from a page on this origin that calls `getUserMedia`) and take one photo.

**Record:** whether the permission prompt appeared, whether the camera opened, and whether
the photo came back to the page. On iPadOS this is the check that the origin is a real
secure context.

### 8. Fill in and file the result

Complete the result file, put the screenshots beside it, and link it from the pull request
of whichever story this run gates.

---

## Filing a partial run

Step 5 needs the device left alone for at least a week; the story it gates does not. So
the result file has a **Status** of `PARTIAL` or `COMPLETE` and a date column per step:

1. Run steps 1-4 and 6-8 in one sitting, file the result with **Status: PARTIAL**, step 5
   marked `not run yet`, and link it. Every step except 5 is decided at that point,
   including the two that gate Epics 5 and 6 (the tab closing and the camera).
2. When the eviction window has passed, run step 5 on the same devices, fill in its row
   with its own date, and change the status to **COMPLETE**. Keep the same file — the run
   is one run, not two.

A partial run never claims the eviction result. Anything that depends on it (the
storage-low threshold, the platform-line decision when the iPad's failure would be
step 5) stays open until the status is COMPLETE.

---

## What the outcome decides

This is the PRD Q0 failure branch, and it selects the slice's platform line
(`epics.md` Story 1.8, AD-8):

- **iPadOS Safari passes steps 4, 5 and 7** → the slice ships for **all three browsers**:
  iPadOS Safari, Android Chrome and desktop Chrome/Edge.
- **iPadOS Safari fails any of them** → the slice ships for **Android Chrome and desktop
  only**, and **FR-56 (zero photo loss) stays unchanged** — the guarantee is not weakened
  to fit the platform that failed. Record which step failed and how, raise it through
  `bmad-correct-course`, and update the supported-platform line in the PRD and the spine.

Step 6's numbers set the storage-low threshold either way.
