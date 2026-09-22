---
title: 'Epic 1 fixes: UI hygiene checked in a real browser'
type: 'bugfix'
created: '2026-09-22'
status: 'done'
baseline_commit: 'b67032802dcb507d97de5bcb03f33cfa5e6cdf12'
baseline_revision: 'b67032802dcb507d97de5bcb03f33cfa5e6cdf12'
route: 'freeform'
dev_model: 'opus'
dev_effort: 'high'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-09-22.md'
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-1-qa-playwright.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/MOCK-GUIDE.md'
warnings: ['multiple-goals', 'oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 1 retro action A5 (U1-U8, F-DUP-1, F-PAT-1, F-PAT-2, F-SPEC-6, F-UNVERIFIED-1). The app copies the mockups' `components.css` verbatim, but that file encodes viewport as `.frame-phone`/`.frame-tablet`/`.frame-desktop` container classes and the base reset as `.frame, .frame *`; the app applies neither, so Home's status board overflows 120 px sideways on a phone (U1) and every React Aria dialog, portaled outside `.app-root`, renders in Times New Roman with native inputs (U2). Around that: the `online` event does not start a sync (U3), login blames the network or the password for the wrong failures (U4), three hand-rolled duplicates of shared components remain (F-DUP-1, F-PAT-1), Toggle/Checkbox/grouped FilterChip have no visible on state (F-SPEC-6), and small chrome defects (U5-U8) plus two PR #9 leftovers.

**Approach:** Write one translation rule for mock container selectors, apply it in `app.css` (root-scoped base, media-query copies of every `.frame-*` rule the app can hit), keep `components.css`/`tokens.css` byte-identical, and document the rule. Then fix each behavior item on the existing shared components and kernel, with a unit/component or e2e test per behavior item and a real-browser pass at 390, 768 and 1280 px, light and dark, keyboard only.

## Boundaries & Constraints

**Always:**
- `tokens.css` and `components.css` stay byte-identical to the mockups (`styles.test.ts`). Translations and aliases go in `apps/web/src/styles/app.css`, each with a comment naming the mock rule it mirrors.
- Translation rule (to be written into AGENTS.md "Conventions that differ from defaults", outside the managed block if the block cannot be edited, and referenced from `app.css`'s header): `.frame, .frame *` and `.frame X` base rules -> `:root`/`html` scope (so portals inherit them); `.frame-phone X` -> `@media (max-width: 767.98px) { X }` (below DESIGN.md `breakpoint-tablet` 768px); `.frame-tablet X` -> `@media (min-width: 768px) and (max-width: 1279.98px)`; `.frame-tablet-landscape X` -> `@media (min-width: 1024px) and (max-width: 1279.98px)`; `.frame-desktop X` -> `@media (min-width: 1280px)`; `.frame--crop`, `.mock-*`, bezel and `.browser-chrome` rules are mock-only and never translated. Media queries in `components.css` itself (the 480px sync badge rule) already apply and are not duplicated.
- On-state pattern (proven on `SegmentedControl`): the ARIA state lives on the element the mock CSS styles; when a valid ARIA shape cannot carry the mock's attribute (a `role="radio"` cannot carry `aria-pressed`), add an `app.css` alias that mirrors the mock rule's declarations verbatim for the valid attribute. No invented look.
- Behavior from React Aria where it fits; keyboard per APG; AD-23 (disabled stays focusable with a reason); pt-BR copy in its A7 home (`copy/pt-br.ts`, `copy/ui.ts`, kernel for derived text); new sentences marked `// authored:`.
- The kernel owns the badge decision: `syncBadgeState` gains the reachability input; `apps/web` never derives a badge word itself.
- No emoji, no `fasor`/`laudo` in user-visible strings; product name only from `PRODUTO`.

**Never:**
- No change to `apps/web/public/sw.js`, `apps/web/src/sw/register.ts`, vitest config, e2e tag scheme or `deferred-work.md` structure (parallel branches R2, R4 own them); adding new entries to `deferred-work.md` at the end is allowed.
- No new runtime dependency; no Tailwind or component kit; no redesign beyond what the mocks draw.
- No new banner kinds or badge states beyond the five in EXPERIENCE.md.
- No rebase or force-push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Phone Home | viewport 390x844, or 768 at 200% zoom | status board 2x2; `document.documentElement.scrollWidth <= innerWidth` on Home, Account, Sync, Login | - |
| Dialog fonts | open Registro profissional or Sair dialog | computed `font-family` of title, labels, inputs starts with Inter (`--font-ui`); inputs have no native border/background inside `.input` | - |
| Back online | pending op, offline -> `online` event | a push starts within 2 s (not on the 60 s tick); badge `ok` after ack | - |
| Login DB down | online, auth answers 5xx | "server unavailable" authored message (not the offline sentence, not "Senha incorreta"); password not `aria-invalid` | retry allowed |
| Login transport failure while `navigator.onLine` | fetch rejects | same server-unavailable message | - |
| Login offline | `navigator.onLine` false | unchanged offline sentence and disabled Entrar | - |
| Login empty/malformed | empty e-mail, empty password, or e-mail without `@x.y` | no request sent; field-level message on the offending field, `aria-invalid` on it, `role="alert"` | - |
| Login 401 | wrong pair | "Senha incorreta" as today | - |
| Badge unreachable | online, last cycle ended in network/5xx failure, nothing pending | badge not `ok` (see Design Notes: `offline` word) and Sync status says the server could not be reached; returns to `ok` after a clean cycle | - |
| Badge session expired | re-auth required | badge not `ok`; Sync status says the session expired | - |
| Toggle/Checkbox/FilterChip | selected | visible on fill from the mock rule, in light and dark; keyboard toggles; axe clean | - |
| Draft toast | draft found | toast has a dismiss control; Esc on it or the control dismisses; draft row kept; not re-raised this page session; no draft banner at the same time | - |
| Boot with unsent registration | offline registration save, reload online before push, user row not yet pulled | Account shows the saved values, not the server's older ones | - |
| Save registration | Editar -> Salvar | dialog closes, focus returns to Editar | - |

</intent-contract>

## Code Map

- `apps/web/src/styles/app.css` -- `.app-root` base (L20-72) duplicates `.frame` rules but scoped to `.app-root`, so portals miss it (U2). Move scope to `:root`/`html`/`body`; add media-query translations of every `.frame-phone|tablet|tablet-landscape|desktop` rule in `components.css` (L43-44 content padding, L114-116 badge, L192-200 action bar, L251-253, L260, L302-303 card-continue, L332, L373, L448-450, L514, L553-554, L644 form-dialog field-pair, L667 status-board 2x2 (U1), L688-694 relatorio-row, L741, L752-753 tabs, L848, L861, L957, L962). `.dialog-scrim{position:fixed}` and `.dialog-modal{display:contents}` already here (L113-131).
- `apps/web/src/styles/components.css` / `tokens.css` -- READ ONLY (byte-identical guard `styles/styles.test.ts`). On-state rules: `.toggle[aria-checked="true"]` L717-720, `.checkbox[aria-checked="true"] .box` L729, `.chip[aria-pressed="true"]` L799, `.icon-btn` L91, `.app-bar .wordmark` L90, `.avatar-btn` L93.
- `apps/web/src/app.tsx` -- router root `<div className="app-root">` L89; route `handle.title` L99-103; per-route `document.title` belongs with these handles (AppShell or a small hook). `apps/web/index.html` -- static `<title>PRODUTO</title>`; no favicon (use an inline `data:image/svg+xml` icon so no request and no SW/precache change).
- `apps/web/src/surfaces/app-shell.tsx` -- App bar: wordmark `Link` L72, avatar `Link` L79 render as default links (U6); `app-bar-left` holds only the wordmark: add the mock's `.icon-btn` "Voltar" with `i-back` on non-root routes (`key-account.html` L61-63), going to Home; `BannerSlot` fed `draftFound` L57.
- `apps/web/public/sprite.svg` -- symbols i-check, i-chev-right, i-layers, i-book; add `i-back` (path from `mockups/key-account.html` sprite: `M15 5l-7 7 7 7`); `styles/sprite.test.ts` asserts the exact list.
- `apps/web/src/state/sync.tsx` -- `onlineRef.current = session.online` during render (L88-89) read by `isOnline` (L99) (U3); badge from `syncBadgeState(counts, { online })` (L151); `status.lastFailure`, `session.reAuthRequired` available for U5.
- `apps/web/src/sync/engine.ts` -- `defaultSubscribeOnline` L73-77; `withRetry` stops when `!deps.isOnline()` L137; `SyncEngineDeps.subscribeOnline` injectable for tests; `engine.test.ts` exists.
- `packages/domain/src/sync/counts.ts` -- `syncBadgeState(counts, { online })` L63-68; used by `home/cards.ts:208` and `state/sync.tsx`; tests `sync/counts.test.ts` L56-70.
- `apps/web/src/surfaces/sync/sync-status-surface.tsx` -- headline; add the unreachable / session-expired line.
- `apps/web/src/api/auth-client.ts` -- `signIn` L88-110 maps transport failure and 5xx to `serverUnreachable` with `copy.login.offline` (U4); `SignInResult.reason` `'credentials'|'network'`.
- `apps/web/src/surfaces/login/login-surface.tsx` -- hand-rolled inputs/buttons (F-PAT-1); `noValidate` form sends empty/malformed input to the server; error only under the password field. Offline decided by `session.online`.
- `apps/web/src/copy/pt-br.ts` -- `login` L13-25 (add authored server-unavailable and field-validation sentences); `copy/ui.ts` component chrome (toast dismiss word, "Voltar").
- `apps/web/src/components/confirm-dialog.tsx` -- `DialogTrigger`-based; `Modal` lacks `className="dialog-modal"`; `aria-modal` never set explicitly (F-UNVERIFIED-1; React Aria leaves it off, see `surfaces/use-aria-modal.ts` comment). Needs a controlled mode without a trigger (Account opens it from a `Button` with `isDisabled` + reason) and a description slot for the kernel sentence.
- `apps/web/src/surfaces/account/sign-out-dialog.tsx`, `apps/web/src/surfaces/use-aria-modal.ts` -- duplicates to delete once Account uses `ConfirmDialog` and the registration dialog uses a shared form-dialog shell (new `components/form-dialog.tsx` or equivalent, setting `aria-modal`, `className="dialog-modal"`, focus return).
- `apps/web/src/surfaces/account/registration-dialog.tsx` -- click-only radiogroup L103-118 -> `SegmentedControl`; not wrapped in `DialogTrigger`, so focus does not return to Editar after save.
- `apps/web/src/surfaces/account/account-surface.tsx` -- opens both dialogs by state (L260-276); registration read from `localUser` row else `session.user` (L106).
- `apps/web/src/state/session.tsx` -- server-confirmed boot `setUser(fresh)` + `writeLastSession(fresh)` (~L160-165) overwrites the optimistic registration from `doSaveRegistration` (L230-255) while `user/{id}/{field}` ops are unsent. Outbox read helpers in `db/sync-store.ts` / `db/commit.ts`.
- `apps/web/src/components/toggle.tsx`, `checkbox.tsx`, `chip.tsx` -- React Aria keeps state on hidden inputs / `role=radio`; comments document the missing on state (F-SPEC-6). Tests: `toggle.test.tsx`, `checkbox.test.tsx`, `chip.test.tsx`, `gallery.test.tsx` (axe).
- `apps/web/src/components/toast.tsx` + `state/toast.tsx` + `state/drafts.tsx` -- draft offer re-raised whenever the toast slot frees (L166-175); no dismiss control (U7). `state/banner-slot.tsx` -- `draft-found` candidate L93-100 duplicates the toast.
- `apps/web/src/surfaces/home/relatorio-card.tsx` -- hand-rolled `<button className="card-title">` and `AriaButton` with `aria-disabled` (L31-60): port the Continuar/Ver sumário pair onto `Button`/`TextButton` (`components/button.tsx`, which already does `isDisabled` + reason); `state/banner-slot.tsx` L151-160 hand-rolled `.btn btn-text` / `.banner-more` buttons: use `TextButton`/shared button where the markup matches.
- `apps/web/src/surfaces/home/home.css`, `login/login.css`, `account/account.css` -- page-only 480px queries; keep.
- Tests: `apps/web/src/**/*.test.tsx` (vitest + jsdom + jest-axe), e2e in `e2e/*.spec.ts` (Playwright, `@p0` tag, projects `desktop-chrome` on Vite 5199; support in `e2e/support/`). Screenshots of the real-browser pass go to `_bmad-output/implementation-artifacts/reviews/epic-1-ui-hygiene/`.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/styles/app.css`, `apps/web/src/app.tsx`, `AGENTS.md` -- root-scope the base layer (drop the `.app-root` scoping or keep the class only for layout), translate every `.frame-*` rule per the rule above, document the rule -- U1, U2, F-PAT-2.
- `apps/web/src/state/sync.tsx`, `apps/web/src/sync/engine.ts` -- the `online` event starts a cycle immediately (the engine must not read a stale online flag; e.g. keep the ref in sync from its own `online`/`offline` listener registered before the engine's, or have the engine trust the event) + engine/provider test -- U3.
- `packages/domain/src/sync/counts.ts` (+ `home/cards.ts` input), `state/sync.tsx`, `sync-status-surface.tsx`, `copy/pt-br.ts` -- `syncBadgeState` takes `{ online, reachable }` where `reachable` is false while the last cycle ended in a network/5xx failure or re-auth is required; kernel tests; Sync status line -- U5.
- `apps/web/src/api/auth-client.ts`, `surfaces/login/login-surface.tsx`, `copy/pt-br.ts` -- failure kinds `credentials` / `server` / `offline`; client-side required and e-mail-shape validation before any request; Login built on shared `Button` where the mock markup allows -- U4, F-PAT-1.
- `apps/web/src/components/confirm-dialog.tsx`, new shared form-dialog shell in `components/`, `surfaces/account/registration-dialog.tsx`, `account-surface.tsx`; delete `sign-out-dialog.tsx`, `use-aria-modal.ts` -- `aria-modal="true"` on the `role="dialog"` element in the real DOM, `dialog-modal` class, initial focus on Cancelar, focus returns to the opener (Sair, Editar) on cancel and on save, Conselho via `SegmentedControl` -- F-DUP-1, F-UNVERIFIED-1, item 8b.
- `apps/web/src/surfaces/home/relatorio-card.tsx`, `state/banner-slot.tsx` -- use shared `Button`/`TextButton` where they render the same markup -- F-PAT-1.
- `apps/web/src/components/toggle.tsx`, `checkbox.tsx`, `chip.tsx`, `styles/app.css` -- visible on state per the on-state pattern; keep axe clean; update the Design Notes comments -- F-SPEC-6.
- `apps/web/src/components/toast.tsx`, `state/toast.tsx`, `state/drafts.tsx`, `state/banner-slot.tsx`, `copy/ui.ts` -- toast dismiss control (`.toast-action` look, 48px), Esc dismisses a focused toast, dismissing keeps the draft row and suppresses re-offer for the page session; the draft-found banner is not raised -- U7.
- `apps/web/src/surfaces/app-shell.tsx`, `apps/web/public/sprite.svg`, `styles/sprite.test.ts`, `apps/web/index.html`, `styles/app.css` -- wordmark and avatar styled as the mock (ink, no underline, visited same), back `.icon-btn` "Voltar" on non-root routes, `document.title` = `"<title> · PRODUTO"` per route (Home and Login: `PRODUTO`), inline SVG favicon -- U6, U8.
- `apps/web/src/state/session.tsx` -- server-confirmed boot keeps locally committed registration fields while their `user/{id}/{field}` ops are unacked -- item 8a.
- Tests: unit/component for every behavior item (engine online trigger, badge reachability, login kinds and validation, dialog aria-modal + focus return + one Tab stop in Conselho, on-states, toast dismiss, boot registration merge, document title, back button); e2e `@p0` for: no horizontal overflow and 2x2 board at 390 px, dialog font is Inter, online event pushes within seconds, login server-down message (route intercept 503), draft toast dismiss.
- Real-browser pass (Playwright MCP) at 390, 768, 1280 px, light and dark, keyboard only; screenshots in `_bmad-output/implementation-artifacts/reviews/epic-1-ui-hygiene/`; keep `.playwright-mcp/` inside the worktree.

**Acceptance Criteria:**
- Given any surface (Login, Home, Account, Sync, both dialogs) at 390, 768 and 1280 px and at 200% zoom on 768, when rendered, then there is no horizontal page scroll and the Home status board is 2x2 below 768 px and 1x4 at and above it.
- Given an open dialog, when inspected in a real browser, then its text and inputs use Inter, inputs show no native border inside `.input`, and the `role="dialog"` element carries `aria-modal="true"`.
- Given `grep` over `apps/web/src`, when searching for `sign-out-dialog`, `use-aria-modal`, `useAriaModal` and `role="radiogroup"` outside `components/`, then nothing is found.
- Given the Conselho control, when tabbing, then it is one Tab stop and arrow keys change the selection.
- Given the Account "Sair" or "Editar" dialog, when closed by Cancelar, Esc or Salvar, then focus returns to the button that opened it.
- Given Toggle, Checkbox and a grouped FilterChip that are on, when rendered in light and dark, then the mock's on look shows, and axe reports no violation.
- Given the App bar in both themes, when rendered, then the wordmark and avatar are not blue, purple or underlined; Account and Sync show a "Voltar" button that goes to Home; `document.title` differs per route; the page load requests no `favicon.ico` 404.
- `pnpm verify` is green, and every I/O matrix row has a test.

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass
- verdicts: 40 findings — high 0, medium 9, low 29, false 2, maybe-false 0 (VG 3, EC 10, BH 16, IA 11; medium rows collapse into 4 root causes)
- findings:
  - `[medium]` `[patch]` VG: session-expired badge/Sync line untested through the real `SyncProvider` — e2e 1.3-E2E-002 now asserts badge "Sem conexão" and the session sentence on /sync.
  - `[low]` `[patch]` VG: no Home test with `unreachable: 'server'` — home-surface test added.
  - `[low]` `[patch]` VG other: `navigator.onLine` spy restored at the end of the test body — moved to `afterEach`.
  - `[medium]` `[patch]` EC: a later pull 404/apply failure overwrites an unreachable push failure in `cycleFailure` — unreachable failure no longer downgraded; engine test added.
  - `[low]` `[reject]` EC: controlled ConfirmDialog without `onOpenChange` never closes — the only controlled caller passes it; a guard adds surface for a misuse no caller makes.
  - `[medium]` `[patch]` EC: `doSignIn` writes the raw server profile over unsent registration values — same overlay applied after `attachDatabase`; session test added.
  - `[low]` `[reject]` EC: a non-put registration op after an older put — nothing emits a remove/create on `user/{id}/{field}` from the client (`registrationPuts` only puts).
  - `[false]` `[reject]` EC: draft `declined` survives a user switch — `DraftProvider` is inside `RequireSession`, which unmounts on sign-out, so state resets per session.
  - `[low]` `[patch]` EC: `TABBABLE` may pick a disabled or hidden control — selector excludes `[disabled]` and hidden inputs, includes `a[href]`.
  - `[low]` `[patch]` EC: follow-up cycle timer scheduled after `stop()` — flag cleared on stop, no scheduling when stopped.
  - `[low]` `[patch]` EC: going offline mid-cycle records a network failure, so Sync status briefly says the server is unreachable after reconnect — the device-offline stop is not recorded as a cycle failure.
  - `[medium]` `[patch]` EC claim: U5 claim broken by the overwrite — same root cause as the `cycleFailure` row.
  - `[medium]` `[patch]` EC claim: item 8a only on the boot path — same root cause as the `doSignIn` row.
  - `[medium]` `[patch]` BH: last failure hides an earlier unreachable one — same root cause as the `cycleFailure` row.
  - `[medium]` `[patch]` BH: overlay only on boot — same root cause as the `doSignIn` row.
  - `[false]` `[reject]` BH: boot reorder leaves the user unset if `attachDatabase` rejects — `attachDatabase` catches its own errors and returns false (`session.tsx` try/catch), so it never rejects.
  - `[low]` `[patch]` BH: `openSyncStatusWithRowsWaiting` ignores `expectedBadge` — dead parameter removed / count asserted.
  - `[low]` `[reject]` BH: `DraftsState.draftFound` and the `draft-found` kind have no publisher — kept deliberately for a later publisher (banner priority is spec'd in EXPERIENCE.md); harmless.
  - `[low]` `[reject]` BH: dismissing the draft has no way back and no discard — Story 1.8's AC says dismissing keeps the draft and the next launch offers it again; a "Descartar" action is new product behavior.
  - `[low]` `[patch]` BH: `TABBABLE` too loose and too narrow — same root cause as the EC row.
  - `[low]` `[patch]` BH: spy leak in auth-client test — same root cause as the VG row.
  - `[low]` `[patch]` BH: sync-status test name claims the offline case it never renders — case added.
  - `[low]` `[reject]` BH: no e2e in the 1024-1279 px range — the translation is guarded by `app-css.test.ts`; only the Sticky action bar (no production caller) lives there.
  - `[low]` `[reject]` BH: `app-css.test.ts` checks one direction, magic floor, quote-sensitive regex — a stale extra rule has no named harm today; test brittleness, not behavior.
  - `[low]` `[patch]` BH: `onlineWhileRunning` not reset on stop — same root cause as the EC row.
  - `[low]` `[reject]` BH: stale `lastFailure` persists while offline — intended (no flash back to ok before the server answers); the offline-stop part is patched above.
  - `[low]` `[reject]` BH: session-expired line has no action and uses `sync-cause` class — the re-auth banner in the same slot carries "Entrar de novo"; the class carries no style (hook only).
  - `[low]` `[reject]` BH: Checkbox lost `isDisabled`/`name`/`value` — no production caller; the first story that needs a disabled checkbox adds it with the reason contract.
  - `[low]` `[reject]` BH: `disabledReasonId` silently wins over `disabledReason`, dangling id unchecked — developer misuse only; `assertReason` still requires one of them.
  - `[low]` `[patch]` BH: `formErrorId` unused — removed/linked.
  - `[medium]` `[patch]` IA: Toggle/Checkbox/FilterChip on state never seen in a real browser — rendered on the dev-only fixture route, e2e asserts computed on-state styles in light and dark, screenshots added.
  - `[low]` `[patch]` IA: 200% zoom not tested — 384 px viewport added to A5-E2E-001.
  - `[low]` `[reject]` IA: keyboard-only pass mostly asserted in jsdom — the independent review repeats the pass keyboard-only in the real browser (playbook step 3).
  - `[low]` `[reject]` IA: item 8a has no e2e — covered by session unit tests on both paths; an e2e needs an unpushed op across a reload, disproportionate.
  - `[low]` `[patch]` IA: focus return after Salvar not in e2e — added to A5-E2E-002.
  - `[low]` `[patch]` IA: U6 has no computed-style assertion — e2e asserts color and `text-decoration-line`.
  - `[low]` `[patch]` IA: favicon no-404 not asserted — e2e asserts no `/favicon.ico` request.
  - `[medium]` `[patch]` IA: session-expired only unit-tested — same root cause as the VG row.
  - `[low]` `[reject]` IA: `.banner-more` still hand-rolled — no shared component renders `.banner-more` markup; the intent says "where one exists".
  - `[low]` `[reject]` IA: shared components extended, React Aria Switch/Checkbox replaced, U4 adds client validation — within the intent's readings (SegmentedControl pattern; "empty or malformed form is not 'Senha incorreta'").

## Design Notes

U5 word choice: EXPERIENCE.md has five badge states and no "unreachable" one. `offline` ("Sem conexão") is defined as "no connection; still saving locally", which is what the user needs to know when the office cannot be reached, so unreachable maps to `offline` unless `dead > 0` (`error` keeps priority) and pending ops keep their count visible on Sync status. Re-auth maps the same way; the re-auth banner already names the cause. Sync status adds one authored line per cause so the headline is honest: "Não foi possível falar com o servidor. Tudo fica salvo neste aparelho." and "Sua sessão expirou. Entre de novo para enviar." (adjust wording only if a mock string exists).

U4 authored strings: server down -> "Não foi possível falar com o servidor. Tente de novo em instantes."; empty e-mail -> "Informe o e-mail"; malformed -> "E-mail inválido"; empty password -> "Informe a senha". Each error sits under its field with `aria-describedby` + `aria-invalid`, first invalid field focused on submit.

Back chevron target: Home (`/`) rather than `history.back()`, because a cold open deep link has no history and Account/Sync are one level below Home (EXPERIENCE.md "Back returns one level").

Phone breakpoint is 767.98px (DESIGN.md breakpoints are 768 and 1280), not the 480px of the badge's own query: at 481-767 px the four tiles still overflow.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, unit, api, e2e all green.

**Manual checks:**
- Playwright MCP against the worktree web port (http://localhost:14073): each AC at 390x844, 768x1024, 1280x800, light and dark, keyboard only; `scrollWidth` probe; computed font in dialogs; `aria-modal` in DOM; offline->online push timing; screenshots saved under `_bmad-output/implementation-artifacts/reviews/epic-1-ui-hygiene/`.

## Auto Run Result

Status: done

**Summary:** Epic 1 retro A5. `app.css` applies the mock stylesheets to the real app by a written rule (AGENTS.md "Mock container selectors"): the `.frame` base layer is root-scoped so React Aria portals inherit Inter and the unstyled field controls, and every `.frame-phone|tablet|tablet-landscape|desktop` rule has a media-query copy (Home status board 2x2 below 768 px); `components.css`/`tokens.css` stay byte-identical and `app-css.test.ts` guards the translation. The `online` event starts a cycle at once (`sync/online.ts`, plus a follow-up cycle when the event lands mid-cycle). The badge reads `offline` when the server is unreachable or the session expired (`syncBadgeState` gains `reachable`), and Sync status names the cause. Login tells credentials, server and offline apart and validates fields before sending. One dialog shell (`DialogShell`, `FormDialog`, controlled `ConfirmDialog`) sets `aria-modal`, initial focus and focus return; `sign-out-dialog.tsx` and `use-aria-modal.ts` are gone and Conselho is the shared `SegmentedControl`. Toggle and Checkbox carry the ARIA state on the styled element; the grouped chip gets an on-state alias. The draft toast has "Fechar"/Esc and no duplicate banner. App bar: ink wordmark and avatar, "Voltar" on non-root routes, per-route `document.title`, inline favicon. Unsent registration values survive a server-confirmed boot and a re-auth sign-in.

**Files changed:** `apps/web/src/styles/app.css` (+ `app-css.test.ts`), `AGENTS.md`, `apps/web/index.html`, `apps/web/public/sprite.svg`; `sync/engine.ts`, `sync/online.ts`, `sync/policy.ts`, `state/sync.tsx`; `packages/domain/src/sync/counts.ts`, `home/cards.ts`; `api/auth-client.ts`, `surfaces/login/login-surface.tsx`; `components/dialog-shell.tsx`, `form-dialog.tsx`, `confirm-dialog.tsx`, `button.tsx`, `toggle.tsx`, `checkbox.tsx`, `chip.tsx`, `toast.tsx`; `surfaces/account/*` (sign-out dialog deleted), `surfaces/use-aria-modal.ts` (deleted), `surfaces/app-shell.tsx`, `surfaces/home/*`, `surfaces/sync/sync-status-surface.tsx`, `surfaces/eviction-recovery-surface.tsx`, `surfaces/fixtures/field-fixture-surface.tsx`; `state/banner-slot.tsx`, `drafts.tsx`, `toast.tsx`, `session.tsx`; `db/sync-store.ts`; `copy/pt-br.ts`, `copy/ui.ts`; tests alongside; e2e `ui-hygiene.spec.ts` (new, 6 tests), `auth.spec.ts`, `sync.spec.ts`, `home.spec.ts`; screenshots in `reviews/epic-1-ui-hygiene/`.

**Review:** 40 findings (VG 3, EC 10, BH 16, IA 11). Patched: 4 medium root causes (a later 404 downgraded an unreachable cycle failure; the re-auth sign-in overwrote unsent registration values; the session-expired path was untested through the provider; the on states were never seen in a browser) and 13 lows (offline stop recorded as a failure, follow-up timer after stop, dialog initial-focus selector, spy leak, Home unreachable test, dead e2e parameter, split sync-status test, unused id, 384 px zoom check, focus after Salvar, wordmark and avatar computed style, favicon request). Rejected with reasons in the triage log: 2 false, 12 lows.

**Follow-up review recommended:** true (patched: medium 4 root causes, low 13). The unverified risk is the engine's new failure-recording rule (`recordFailure` ignores the device-offline stop and never downgrades an unreachable failure), which also changed when the eviction screen dismisses itself.

**Verification:** `docker compose --profile tools run --rm tools pnpm verify` EXIT 0 before and after the patches (final: domain 293, web 404, tooling 17, api 66, Playwright 27). Real-browser pass with the Playwright MCP at 390, 768 and 1280 px, light and dark, keyboard: no sideways scroll, board 2x2 below 768, dialogs in Inter with `aria-modal`, focus return, on states on the fixture page.

**Residual risks:** the phone App bar badge shows the short word below 768 px (was 480 px) because the phone frame rule is now translated; the wordmark shows only on Home (other routes show "Voltar", as the mock draws). The Playwright MCP wrote a console log into the main checkout (`.playwright-mcp/`, gitignored) that needs manual removal.
