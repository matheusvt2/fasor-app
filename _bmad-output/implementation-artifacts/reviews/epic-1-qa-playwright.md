# Epic 1 exploratory QA (Playwright, human-style)

Date: 2026-09-22. Tester: Claude (exploratory QA agent). Build: `main` at 00de851, isolated worktree, compose project `fasor-qa` (ports 47xxx), torn down afterwards with `down -v`.
Evidence: screenshots in `_bmad-output/implementation-artifacts/reviews/qa-epic-1/` (names cited below as `NN`).

## Executive summary

1. The golden paths work: login, Home from IndexedDB, Account, theme, sync push/pull, two-company isolation, offline cold open through the service worker on the built bundle, draft recovery, the 5-day banner, eviction recovery and the re-auth banner all behave as the stories describe.
2. axe-core 4.10 (WCAG 2.0/2.1/2.2 A+AA tags) reports zero violations on Login, Home, Account, Sync, the fixture and both dialogs, in light and dark.
3. Worst defect: after a new build, the new shell becomes active on the next launch **with ops still in the outbox**; the AD-8 gate does not hold (Story 1.8 AC).
4. Home is broken on a phone and at 200 % zoom: the four-tile Status board stays in one row and scrolls the page sideways by 120 px (mock draws 2x2; WCAG 1.4.10 reflow).
5. Every dialog (Registro profissional, Sair) renders in Times New Roman with unstyled native inputs: the dialog is portaled outside the element that carries the font and field styles.
6. The `online` event does not start a sync cycle; after reconnecting, pending ops wait for the next 60 s tick (measured 42-46 s).
7. The PRODUTO wordmark and avatar render as default browser links (blue or visited purple, underlined) in both themes on every surface.
8. With the database down, login says "Sem conexão — entre quando houver sinal..." (it no longer says the password is wrong, but it blames the network the user does have).
9. Sync status and the recovery screen show raw user ids ("seed-user-a-teste-local") and "0 pessoas da equipe": the company stream carries no user names.
10. Setup: the README describes a prototype that does not exist; Caddy answers "Not found" until the web bundle is built by hand; the prod-profile doc tells you to run pnpm on the host; the desktop browser gets a certificate error that no doc mentions. Trusted origins did **not** need changing.

Counts (table below): 34 checks: 23 pass, 7 partial, 3 fail, 1 not testable.

## Setup notes

- `.env` and `compose.local.yml` exactly as briefed. `docker compose up -d --build`: api healthy in about 15 s.
- `TRUSTED_ORIGINS` did not need to be overridden: the compose default already includes `http://localhost:*`, `http://127.0.0.1:*` and `https://${TABLET_HOST}:${CADDY_HTTPS_PORT}`. Login worked on 47173 (Vite), 47001 (api-prod) and 47443 (Caddy) even though `AUTH_BASE_URL` stays `http://localhost:5173`.
- Seeding: `docker compose run --rm tools pnpm exec tsx scripts/seed-users.ts --test` created `a@teste.local` and `b@teste.local`. Operator user: `--company-id 8f3a2c1e-... --company "Acme Engenharia" --email ana@acme.com --password ... --name "Ana Alves" --council crea --number "SP 1234" --title "Eng. Eletricista"` worked; that user signed in over Caddy HTTPS and on api-prod.
- The Playwright MCP browser runs on a persistent profile. One step (401 mid-session) called `context.clearCookies()`, which also cleared that profile's unrelated cookies. That affects only the MCP's own Chrome profile, not the user's main browser. `.playwright-mcp/` logs were written to the main checkout (gitignored).
- No page creates a relatório yet, so I crafted ops with `fetch('/api/sync/ops')` from the signed-in page (client, project, four relatórios, one per status). The app then pulled them the normal way.

## Results table

| # | Feature | AC reference | Result | Evidence / notes |
|---|---|---|---|---|
| 1 | Stack up, `GET /api/health` | 1.1 | pass | `{"status":"up","db":"up","queue":"up","storage":"up","libreoffice":"up"}` on 47000, through Vite 47173 and Caddy 47443 |
| 2 | Web app through the Vite proxy on the same origin | 1.1 | pass | All `/api` calls same-origin, no CORS messages |
| 3 | Caddy HTTPS serves the built app and `/api/*` on one origin | 1.7 | partial | Works after a manual `pnpm --filter @app/web build` in the tools container. Before that, `https://localhost:47443/` answers `Not found`, because Caddy proxies to the dev api, which serves `apps/web/dist` only if it exists. Desktop Chrome shows `ERR_CERT_AUTHORITY_INVALID` ("Erro de privacidade"); the service worker then refuses to register ("An SSL certificate error occurred when fetching the script"). |
| 4 | prod profile: migrate one-shot, api-prod serves bundle + api, JSON logs | 1.7 | pass | `migrations applied` JSON line; `http_request` lines carry `company_id`/`relatorio_id` keys. Running `--profile prod up -d` also recreated `web`. |
| 5 | Login wrong password: inline `role="alert"`, field marked | 1.3 | pass | `02`; "Senha incorreta" in an alert, password `aria-invalid` |
| 6 | Login validation of empty or malformed input | 1.3 / EXPERIENCE | partial | Empty form and "nao-e-email" are sent to the server and answered "Senha incorreta": misleading, with no required-field message |
| 7 | Valid login lands on Home, httpOnly Lax Secure 30-day cookie | 1.3 | pass | `releng.session_token` httpOnly, Secure, Lax, 30 days |
| 8 | Offline login state | 1.3 / UX-DR61 | pass | `27`, `28`: exact sentence, "Entrar" `aria-disabled` with "Entrar precisa de conexão" in `aria-describedby`, no spinner, submit does nothing |
| 9 | Keyboard-only login | 1.3 | pass | Tab: E-mail, Senha, Mostrar, Entrar. Enter submits. |
| 10 | No sign-up path | 1.3 | pass | Only the footer line "Sem cadastro por aqui" |
| 11 | Session survives offline cold open (SW, Home from IDB, badge, toast once) | 1.3 / 1.6 / 1.8 | pass | `30` on api-prod (localhost counts as a secure context): the shell comes from `releng-shell-*`, Home renders, badge reads "Sem conexão", the toast shows once per page session, the badge recovers online |
| 12 | Home App bar, Status board, `aria-pressed`, second tap clears | 1.6 | pass | `03`, `06`; `aria-pressed` false, true, false |
| 13 | Relatório cards: title, dates, pill, device words, `is-current` first | 1.6 | partial | `08`: the Em campo card is first and highlighted. Cards for relatórios not on the device show only the client name ("Cliente QA Ltda.", or "Relatório sem identificação" before the project arrived), with no site and no dates, unlike the mock. Tapping a "baixa ao abrir" card downloads it silently, with no feedback. |
| 14 | Grayed "Não está neste aparelho" card only toasts | 1.6 | pass | `11`: toast "Não está neste aparelho — conecte para baixar". The graying is very faint. |
| 15 | Empty state "Nenhum relatório ainda." + "Novo relatório" | 1.6 | pass | `03`; "Novo relatório" is `aria-disabled` with "Disponível em uma próxima etapa" |
| 16 | Account content, no "Instalar" row | 1.6 | pass | `12` |
| 17 | Registro profissional Form dialog, CREA/CRT, title default, row text | 1.3 | partial | Behavior passes: switching to CRT defaults the title to "Técnico(a) em Eletrotécnica" but keeps a custom title, an empty number shows an error, save updates the row to "CRT RJ 98765 · Técnico(a) em Eletrotécnica" and `/api/account` agrees. Visual fails: `13`, `14` show a serif font and native inputs inside the field boxes. CREA and CRT are two separate Tab stops. |
| 18 | Tema by mouse and keyboard, persistence, Sistema follows OS | 1.6 | pass | `15`, `16`: Tab lands on the checked segment, arrows, Home and End move the selection (and apply it, as radios do), survives reload, `prefers-color-scheme` followed under Sistema |
| 19 | Sair destructive with confirm, focus on Cancelar, Esc returns focus | 1.3 / 1.2 | pass | `17`, `25`: pending variant "Sair com envios pendentes?"; focus starts on Cancelar and returns to Sair |
| 20 | Sign-out keeps local data | 1.3 | pass | After Sair, `releng-seed-user-a-teste-local` still holds 5 entities; signing back in shows the same Home |
| 21 | Sair offline disabled with reason | 1.3 / 1.6 | partial | `aria-disabled` with "Sair precisa de conexão" in `aria-describedby` (also `18`). The reason is not announced when the device goes offline (no live region), only when Sair is focused. |
| 22 | Sync status headline + "Sincronizar agora" (reason while running or offline) | 1.5 / 1.6 | pass | `07`, `20`: "Sincronizando…" while running, "Sem conexão" offline, button `aria-disabled` |
| 23 | Commit produces an op, badge pending then ok | 1.4 / 1.5 | pass | Fixture commit: "1 pendente", then "Sincronizado" at the next tick (about 42 s). There is no push on commit, which the AC allows, but it feels slow. |
| 24 | Offline commit, then automatic sync when back online | 1.5 | fail | The `online` event fires (verified with a listener) but no cycle starts; "1 pendente" stays until the 60 s timer (46 s measured). See D-3. |
| 25 | Company B sees nothing of company A | 1.3 / NFR-13 | pass | `21`: B's Home is empty. B pulling A's relatório gets `404 relatorio_not_found`. B pushing an op with A's `company_id` gets `op_tenant_mismatch`. |
| 26 | Rejected op: "Erro" badge, "Reenviar" | 1.5 | pass | `22`: the forged op goes dead with `op_tenant_mismatch`, the badge reads "Erro", "1 alteração rejeitada" with "Reenviar". There is no way to discard, and no detail of what was rejected. |
| 27 | Draft on `visibilitychange`, "Rascunho encontrado — Recuperar", never silent | 1.8 | partial | `23`: the draft is saved and offered, not applied until "Recuperar", which restores and commits. The toast has no dismiss control (Esc does nothing), so "dismissing keeps the draft" cannot be exercised. An info banner "Há um rascunho para recuperar neste aparelho." shows at the same time, duplicating the toast. |
| 28 | Banner "Alterações sem envio há 5 dias" | 1.8 | pass | `24`: outbox `client_ts` backdated 6 days, pushes forced to 503 |
| 29 | Eviction recovery screen, re-pull, "Continuar sem baixar" with api down | 1.8 | partial | `31`, `32`, `33`: the screen, the failure message and the skip all work. It says "O servidor tem 4 relatórios e 0 pessoas da equipe" (wrong, see D-6), and the skip note is placed under "Baixar do servidor" rather than under the skip action. |
| 30 | New shell not activated while the outbox has pending ops | 1.8 / AD-8 | fail | See D-1 |
| 31 | 401 mid-session: re-auth banner, outbox kept | 1.3 / 1.5 | pass | `26`: "Sua sessão expirou. Nada foi apagado deste aparelho." + "Entrar de novo", then Home after sign-in. The badge still says "Sincronizado" while the session is gone. |
| 32 | DB down at login must not say the password is wrong | 1.3 | partial | `35`: shows the offline sentence "Sem conexão — entre quando houver sinal..." while online. `/api/health` returned 503 degraded. |
| 33 | api down while using the app: no spinner, no blank screen | 1.5 / FR-54 | pass | Everything renders from IDB and 502 retries stay quiet. But the badge and Sync status keep saying "Sincronizado" while every pull fails (`34`). |
| 34 | Physical iPad / Android manual script | 1.7 / 1.8 | not testable | Needs devices on the LAN with the mkcert root installed |

Accessibility and copy sweeps (not in the counts): `lang="pt-BR"` present; axe clean; visible 3 px focus outline on every Tab stop, all at least 48x48 (Home Tab order in `48`); no focus traps; dialogs trap focus and Esc returns it; reduced motion leaves no transitions or animations; 200 % zoom breaks Home (D-2) but Account reflows (`50`). No user-visible "fasor" in the DOM, `<title>` or `dist/` file names; no emoji in `apps/web/src`; product name is PRODUTO everywhere. `<title>` stays "PRODUTO" on every route (WCAG 2.4.2: the views are not distinguishable). `favicon.ico` returns 404 on every load.

Console and network: the only errors are the expected `401 /api/account` on boot while signed out (twice per load), `favicon.ico` 404, 502/503 during the induced outages, and `ERR_INTERNET_DISCONNECTED` for `/api/account` while offline. That boot session probe runs outside the sync engine, about twice per page load, even offline. No CORS errors on any origin.

## Defects, ranked

**D-1 (High) A new shell activates on the next launch even with ops in the outbox (Story 1.8, AD-8).**
Steps: build the web bundle; start `--profile prod`; open `http://localhost:3001` (47001 here) and sign in; let the SW install. Make pushes fail (stop the api, or keep an op pending) so the badge reads "1 pendente". Rebuild the bundle so `sw.js` changes (for example `build:e2e`, then `build`). In the open tab the new worker installs and waits (`registration.waiting` true, both `releng-shell-*` caches present). Close the tab (or leave the origin) and reopen the app. The new bundle (`index-CgqpUOlB.js`) is now served, the old cache is deleted, and the outbox still says "1 pendente". The page-side gate cannot stop the browser from activating a waiting worker once no clients are left; the worker itself has to defer (for example, not calling `skipWaiting` and not taking over navigations until the page reports an empty outbox, or keeping the old cache until then).

**D-2 (High on a phone, Medium overall) The Home Status board overflows sideways at 390 px and at 200 % zoom.**
Steps: resize to 390x844 (or 768 at 200 % zoom) and open Home. The four tiles stay in one row; `scrollWidth - innerWidth` = 120 px (126 px zoomed); pills wrap as "Em / campo". The mock (`key-home.html`, phone frame) draws a 2x2 grid. Evidence `36`, `39`, `49`.

**D-3 (Medium) Coming back online does not sync until the 60 s timer.**
Steps: open `/__fixture/field` on the dev server. Go offline, type a value and Tab: the badge reads "Sem conexão". Go online: the badge reads "1 pendente" for about 45 s. The `online` event reaches the page. Likely cause: `engine.ts`'s `online` listener runs before `SessionProvider` re-renders, so `deps.isOnline()` (backed by `onlineRef` in `state/sync.tsx`) still reads `false` and `withRetry` ends the phase at once. This is a hypothesis from reading the code, not verified.

**D-4 (Medium) Dialogs are unstyled: serif font and native inputs.**
Steps: Account > Registro profissional > Editar, or Account > Sair. The title and labels are Times New Roman (computed `font-family: "Times New Roman"`); the inputs are small native boxes inside the 56 px field frames. Evidence `13`, `14`, `17`. The React Aria overlay is portaled to `body`, outside the element that sets the font and the field styles.

**D-5 (Medium) Login maps every failure other than going offline to one of two misleading messages.**
Steps: stop postgres; sign in with valid credentials: the message is "Sem conexão — entre quando houver sinal..." while the device is online (`35`). Also: submitting an empty form or a malformed e-mail sends a request and answers "Senha incorreta".

**D-6 (Medium) Raw user ids and "0 pessoas da equipe".**
Steps: push anything from a second device (or look at Sync status after any push). "Último envio" lists "seed-user-a-teste-local" with an "S" avatar for both "Este aparelho" and "Outro aparelho" (`07`, `22`). The eviction screen says "0 pessoas da equipe" (`31`). The company pull carries no user rows, so `userNames` in `state/sync.tsx` stays empty.

**D-7 (Low) The wordmark and avatar render as default links.**
On every surface the "PRODUTO" wordmark is blue `rgb(0,0,238)` or visited purple, underlined, and the avatar initial is underlined. Both themes (`03`, `15`). The mock shows plain ink text.

**D-8 (Low) The persistent draft toast cannot be dismissed, and a banner duplicates it.**
See #27. It needs a dismiss affordance (the AC says dismissing keeps the draft), and the draft-found banner should not render while the toast is showing.

**D-9 (Low) "Sincronizado" while the server is unreachable or the session expired.**
With the api stopped, or after a 401, the badge and the Sync headline keep reading "Sincronizado". Nothing is pending, so it is technically "nothing to send", but "Última sincronização" does not advance and nothing says the server is failing.

**D-10 (Low) Conselho segmented control has two Tab stops.**
In the Registro dialog, Tab visits CREA and then CRT. The Tema control correctly has one.

**D-11 (Low, dev-only) False eviction screen on a second port.**
Cookies ignore the port, so signing in on :47173 and then opening :47001 shows "Dados deste aparelho foram apagados" on a device that never had data there. It only matters when switching between dev and prod ports on one machine.

**D-12 (Low) The server accepts ops for relatórios that do not exist.**
The fixture writes `relatorio/setup/local` to `019966b0-0808-...f1`, which exists nowhere; the server marks it applied. On screen the committed value then never shows in the fixture field after reload (it looks lost). This is probably acceptable given "never reject for a domain rule", but worth a decision.

## UX and mock deviations

- No back chevron in the App bar on Account and Sync (`key-account.html` has one). The only way back is tapping the wordmark, and it is not obvious that it is a link to Home.
- Home at tablet width: "Novo relatório" floats in the middle of the heading row with its reason far right; the mock right-aligns a primary button with a plus icon. On desktop the content is capped at about 904 px and left-aligned while the badge and avatar sit centered in the App bar (`42`).
- Relatório cards: no progress counter ("42 de 94 fichas"), expected before sheets exist. There is an empty line between the title and the dates. Cards not on the device lose their site and dates.
- Offline Home: every card's compact badge reads "Sem conexão", four repeats of the header badge. The mock keeps per-card "Sincronizado" or "n pendentes".
- On a phone the header badge reads "OK" instead of "Sincronizado".
- The Sync status page repeats "Sincronização" as the h1 and the first h2.
- `prototype/screens/*.html` are fragments with no styles when opened alone (`04`); only `key-*.html` and `prototype/` (index) render.
- Account order: the mock puts Tema before Registro profissional and edits the registration inline. The app follows the story (a dialog) instead.

## Confusing even if technically correct

- "Sair mesmo assim" when nothing is pending ("anyway" about nothing). The Sair note always says "Sair antes do envio pede confirmação" even with nothing to send.
- Tapping a card with a chevron and a pointer cursor (Rascunho, Em campo) does nothing and says nothing. "Continuar" and "Ver sumário" are disabled with a reason, but the card body is not.
- "baixa ao abrir" downloads on tap with no feedback. The words change on the next render and nothing opens.
- A rejected change can only be "Reenviar"-ed, which fails again forever. The Sync headline reads "Erro" next to "Nada pendente neste aparelho."
- About 45 s between a commit and "Sincronizado" makes a user think the change did not go through.

## Setup friction for a new developer

1. `README.md` still describes a "Protótipo" with only docs and BMAD folders, and says "laudos". Nothing explains how to start the stack, seed a user or run `pnpm verify`. AGENTS.md's "Running and verifying" is still a TODO.
2. `docker compose up` starts Caddy, but `https://localhost` answers `Not found` until someone builds `apps/web/dist`, and `docs/tablet-https-setup.md` step 4 says it "should load".
3. The prod-profile section says to run `pnpm --filter @app/web build` on the host, which contradicts the Docker-only policy. It works as `docker compose run --rm tools pnpm --filter @app/web build`.
4. The desktop browser gets a certificate error at the Caddy origin and the service worker refuses to register. The doc covers installing the CA on tablets only.
5. `seed-users.ts` makes the operator invent a UUID for `--company-id`. Its usage text lives only in the script header.
6. `tools` is behind the `tools` profile, but `docker compose run tools` works anyway; each run downloads pnpm again ("Downloading the pnpm 12.5.1 binary").
7. No relatório can be created from the UI, so testing Home cards needs hand-crafted ops (the scripts are in this session's transcript). A seed flag that creates sample relatórios would help QA and demos.

## Not tested, or only partly

- Physical iPad Safari and Android Chrome manual script (Story 1.7/1.8 Q0 proof): needs devices and the mkcert root installed.
- The service worker over trusted HTTPS: blocked by the untrusted local CA in desktop Chrome; tested on `http://localhost` instead.
- Quota exhaustion (`storage.estimate` mock) and the "network dropped mid-push" scenario by hand: covered by the Playwright `@p0` suite per the story; not reproduced here.
- Screen reader announcements (only inferred from live-region markup) and real touch or stylus input.
- WebKit and Firefox: only Chromium was used.
- The 426 "Atualizar" screen (no way to raise the server's minimum contract version without code changes).
