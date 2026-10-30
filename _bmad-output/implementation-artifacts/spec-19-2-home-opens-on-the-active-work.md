---
title: 'Story 19.2: Home opens on the active work: Emitido behind its tile, most recent first, the list cut at 10, 20, 50 or 100'
type: 'feature'
created: '2026-10-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
dev_model: opus
dev_effort: medium
baseline_revision: 'baf5415854de86f794f9a09f39bec70f7e351c2e'
baseline_commit: 'baf5415854de86f794f9a09f39bec70f7e351c2e'
context:
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Home lists every relatório the company ever had, in service-date order and with no cap, so with a hundred relatórios the engineer scrolls past emitted work to find the active one (Matheus, 2026-10-30; Epic 19, `epics.md` § Story 19.2, Definition of Ready closed by his three answers).

**Approach:** The kernel selects, orders and cuts the list: with no Status board tile pressed only the active statuses (Rascunho, Em campo, Em revisão) show, the Emitido tile is the way to the emitted ones; every selection is ordered most recent first; the list shows a page of 10 by default, chosen among 10 · 20 · 50 · 100 through Filter chips beside the note "Mostrando 10 de 37 relatórios", the choice kept in the device's local preferences. The surface renders what the kernel returns.

## Boundaries & Constraints

**Always:**
- Binding text: `epics.md` Story 19.2 (DoR and ACs), `epic-19-context.md`. AD-13: `packages/domain` computes the selection, the order, the page, the note and the empty sentence; `apps/web` keeps only the pressed tile and the page size as state and renders.
- `homeCards` keeps returning every card (the Status board counts come from it); the selection and the page are a new kernel function over those cards. The current card (Em campo on this device) stays first in every selection.
- Order (decision, Matheus 2026-10-30, "1.a": "mais recente" is the relatório's last change on the server): the company summary's `updated_seq` descending (`RelatorioSummary.updated_seq`, the server's sequence of the relatório's last change); ~~cards with no summary entry after them by service start descending, missing dates last, then id (today's rule as the fallback).~~ *(2026-10-30, Matheus, "A" to the review's intent gap: a card with no summary entry, a relatório created on this device and not yet synced, is the newest thing here and sorts right after the current card, before every card with a sequence; among themselves by service start descending, missing dates last, then id.)*
- Page sizes `10, 20, 50, 100`, default 10; the note and the chips appear only when the selection holds more than 10; the chips are the existing `FilterChipGroup` (exactly one pressed); the choice is read from and written to `local_prefs` under `home_page_size`, an unknown stored value reads as 10. The preference lives in the user's own database, so it never follows a sign-out to another user.
- Empty states: nothing on the device keeps "Nenhum relatório ainda."; a pressed tile with nothing keeps "Nenhum relatório neste status."; no active relatório with N emitted reads a kernel sentence "Nenhum relatório em andamento. N emitidos: toque em Emitido." (`plural` for 1).
- Telemetry (Epic 18): append `home.page_size` to `UX_ACTION_TARGETS` first (red kernel test), then `data-telemetry="home.page_size"` on each chip; `home.status_chip` unchanged.
- Copy: pt-BR; static labels in `copy/pt-br.ts` marked `// authored`; every count or plural in the kernel. Red first for every new test. English code and comments; no emoji.

**Never:**
- No op, no seed, no contract bump, no server change: `updated_seq` already travels in the summary. No search, no other sort key, no per-user preference on the server.
- No change to the Status board's tiles, their counts (every relatório) or their toggle rule; no change to the card itself or to Story 19.1's section order.
- No new shared component beyond a `telemetry` attribute on the chips; no CSS outside `home.css` and the mocks' existing classes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default list | no tile pressed; 3 active, 9 emitted | the 3 active cards, most recent first; Emitido tile reads 9; no note | none |
| Emitido tile | pressed | the 9 emitted cards, most recent first; press again returns to the active list | none |
| Other tile | Rascunho pressed | that status only, most recent first | none |
| Cap | 12 relatórios in the selection, page size 10 | 10 cards, note "Mostrando 10 de 12 relatórios", chips 10 · 20 · 50 · 100 with 10 pressed | none |
| Page size chosen | press 50 | up to 50 cards, note "Mostrando 12 de 12 relatórios" when they all fit; `local_prefs.home_page_size` = 50; survives a reload | none |
| Stored value unknown | `home_page_size` = 15 or a string | reads as 10, the chip 10 pressed | silent |
| Fits the smallest page | 10 or fewer in the selection | no note, no chips | none |
| Order fallback | a local row with no summary entry | ~~after every card with a sequence, by service start~~ before every card with a sequence, right after the current card, by service start (2026-10-30, Matheus "A") | none |
| Current card | Em campo on this device, old sequence | first in the active list and in the Em campo tile's list | none |
| No active | 0 active, 7 emitted | "Nenhum relatório em andamento. 7 emitidos: toque em Emitido."; Emitido tile 7 | none |
| Nothing | 0 relatórios | "Nenhum relatório ainda." | none |

</frozen-after-approval>

## Code Map

- `packages/domain/src/home/cards.ts` -- `homeCards` (keep every card; change the sort: `updated_seq` from `input.summary`, then today's rule; `filter` stays accepted but the surface stops passing it), `statusBoardCounts` unchanged; add `HOME_ACTIVE_STATUSES`, `HOME_PAGE_SIZES`, `DEFAULT_HOME_PAGE_SIZE`, `isHomePageSize`, `homeList(cards, { filter, pageSize })` returning `{ cards, shown, total, note, empty }` (`empty`: `null | 'none' | 'none-for-filter' | { kind: 'none-active', text }`), `homeListNote(shown, total)` and `noneActiveText(emitted)` with `plural` (`packages/domain/src/text/plural.ts`); export from the kernel index. Tests in `cards.test.ts` (ordering block at 308 to 345 changes).
- `packages/domain/src/contract/telemetry.ts:91` -- `UX_ACTION_TARGETS`: append `'home.page_size'`; `telemetry.test.ts` pins the list.
- `apps/web/src/db/prefs.ts:91-98` -- the `readRegistryTab`/`writeRegistryTab` pattern: add `readHomePageSize`/`writeHomePageSize` (key `home_page_size`, value a number; the surface validates with `isHomePageSize`).
- `apps/web/src/surfaces/home/home-surface.tsx` -- `allCards = homeCards({ ...base, filter: null })` stays for the counts; `list = homeList(allCards, { filter, pageSize })`; render `list.cards`, the note and the chips under `.relatorio-cards` as the mock's `section-note` row, the three empty cases; `pageSize` from the pref (`useLiveQuery` or a read on mount) with `writeHomePageSize` on change. Sections order of Story 19.1 untouched.
- `apps/web/src/components/chip.tsx` -- `FilterChipGroup` (`options`, `selectedId`, `onChange`): add an optional `telemetry` prop applied as `data-telemetry` to each chip; `chip.test.tsx`.
- `apps/web/src/copy/pt-br.ts:134-166` -- `copy.home`: add the chip group's accessible name (`pageSizeLabel`, authored, e.g. "Relatórios por página"); `empty` and `noneForFilter` stay.
- `apps/web/src/surfaces/home/home.css` -- the note row (`.section-note` with the `.chip-row` beside it, wrapping under 480 px; no horizontal scroll at 390 px).
- `apps/web/src/surfaces/home/home-surface.test.tsx` -- `renderHome(syncState({ summaryRelatorios }))` and `summary(id, status)` helpers (give them `updated_seq`); the "three device states" case asserts the emitted card: press the Emitido tile first.
- `apps/web/src/telemetry/targets.test.ts` -- the guard finds `'home.page_size'` in the sources.
- `e2e/home.spec.ts` -- 1.6-E2E-001 (`relatorioCreateOp` seeds; the emitted card is asserted after pressing the Emitido tile now); new `@p1 19.2-E2E-001` seeding 3 active and 12 emitted through the outbox and "Sincronizar agora" (`e2e/support/outbox.ts`, `sync.ts`), asserting the default list, the tile, the order (`updated_seq` from the push order), the note and the chips, 50 pressed and kept across a reload, and at 390 px no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).
- UX: `EXPERIENCE.md:44` (§ Home) and `:342` (§ Status board) dated notes; `mockups/prototype/screens/20-home.html:90` and `mockups/key-home.html` (the three "Ver todos" notes) redrawn as the note plus a `chip-row` of four chips, first pressed, dated comment; `mockups/MOCK-GUIDE.md` dated line.
- `docs/kbs/log.md` -- one dated line.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/contract/telemetry.ts` + `telemetry.test.ts` -- append `home.page_size` (red first) -- Epic 18's kernel-first rule
- [x] `packages/domain/src/home/cards.ts` + `cards.test.ts` -- the sort by `updated_seq`, `homeList`, the sizes, the note and empty texts (red first, every matrix row) -- AD-13
- [x] `apps/web/src/db/prefs.ts` (+ its test file if one exists, else a case in `home-surface.test.tsx`) -- `readHomePageSize`/`writeHomePageSize` -- the remembered choice
- [x] `apps/web/src/components/chip.tsx` + `chip.test.tsx` -- `telemetry` on `FilterChipGroup` -- the event per chip
- [x] `apps/web/src/copy/pt-br.ts`, `home.css`, `home-surface.tsx` + `home-surface.test.tsx` -- render the list, the note row with chips, the empty cases, the pref -- the surface
- [x] `e2e/home.spec.ts` -- 1.6-E2E-001 adjusted; 19.2-E2E-001 added (`@p1`) -- end to end as a human would
- [x] `EXPERIENCE.md`, the two mocks, `MOCK-GUIDE.md`, `docs/kbs/log.md` -- dated notes, strike-through kept -- planning stays truthful

**Acceptance Criteria:**
- Given the matrix rows, when the kernel and the surface run, then each row holds in a unit or component test, red first.
- Given a company with every status, when Home opens, then the list is the active statuses most recent first, the Emitido tile shows its count and toggles the emitted list, and `home.status_chip` events keep their name.
- Given more than 10 relatórios in the selection, when the list renders, then 10 cards, the note and the chips appear; pressing 50 shows up to 50, the note updates, a reload keeps 50, and the chips carry `data-telemetry="home.page_size"`.
- Given 390 px, when the note row renders, then the page has no horizontal scroll and the chips are reachable by keyboard.

## Implementation Notes

- 2026-10-30, implementation subagent `bmad-dev-opus-medium` (model opus), from the spec alone; working tree on `story-19-2`, nothing committed by it. Gate it ran (tools container, host lock, `.scratch-prodfix/s19-2-*.log`): lint 0 errors (25 warnings in untouched specs), static green, test:unit 333 files 4702 tests, test:api 96 files 733 tests (api restarted first), `home.spec.ts` and `app-layout.spec.ts` 5 of 5 on `desktop-chrome` (the durability project holds none of them).
- Coordinator's read of the diff (745 insertions, 20 files): every matrix row has a kernel test in `cards.test.ts` (the `homeList` block), the preference rows a `prefs.test.ts` case, the surface rows a `home-surface.test.tsx` case, and the end-to-end path `19.2-E2E-001`; `1.6-E2E-001` now reaches the Emitido card through its tile. The mocks redraw the note with a `chip-row` in a `role="group"` of `aria-pressed` buttons (the mock's static form of the Filter chip), while the app uses the radiogroup form of `FilterChipGroup`; MOCK-GUIDE says so.
- Known first-frame detail: the page size comes from a live query, so the first render shows 10 until the stored value arrives (a frame, no flash of a different list length worth noting).

- 2026-10-30, coordinator's hands-on browser pass (Epic 1 P2) on the local stack's Vite dev server, signed in as the e2e worker-0 Empresa B user after seeding its 15 relatórios (1 Rascunho, 12 Emitido, 1 Em revisão, 1 Em campo) by running `19.2-E2E-001` once through `playwright test` directly (one global setup; `scripts/e2e.ts` runs two groups and the second group's setup wipes what the first seeded). Observed: tiles 1 · 1 · 1 · 12; the default list holds the three active cards, Em campo, Em revisão, Rascunho (push order, most recent first), no note; the Emitido tile pressed shows 10 cards, "Mostrando 10 de 12 relatórios" and the chips 10 · 20 · 50 · 100 (10 pressed, each with `data-telemetry="home.page_size"`); Tab from the tile reaches the chips (3 px focus outline), ArrowRight moves to 20 (12 cards, "Mostrando 12 de 12 relatórios") and 50; a reload keeps 50 (`local_prefs.home_page_size` = 50); the tile pressed again returns to the active list. 1280 (light), 768 (light), 390 (light and dark): `scrollWidth` = `innerWidth` = 390, the note row wraps with the chips under the note (48 px chips), the pressed chip takes the Filter chip look in both themes, the "Relatórios" heading sits at y = 502 under the four tiles and the two stacked shortcut cards, the current card's "Continuar" is on the first screen at 390 × 844. Screenshots in `.playwright-mcp/s19-2/`. Console: only the two 401s of `/api/account` on the login page before sign-in. Not exercised: the offline reload, because the Vite dev server registers no service worker (a reload offline lands on the browser's error page); the list and the page size come from IndexedDB and the component tests and `19.2-E2E-001`'s reload cover that path on the built bundle.

- 2026-10-30, after the review patches (eight, by the same implementation subagent, `.scratch-prodfix/gate-19-2*.log`): full story gate under the host lock, api restarted first: lint 0 errors (25 warnings in untouched specs), static green, test:api 96 files 733 tests (281 s), test:unit 333 files 4706 tests (223 s, host load up to 12.05 with no red), `home.spec.ts` and `app-layout.spec.ts` 5 of 5 (32 s). Open before the spec can close: the intent gap on the unsynced new relatório's place in the order (Review Triage Log, first row), asked to Matheus as A (newest first) or B (keep after the synced ones).

- 2026-10-30, after Matheus's "A" (the unsynced new relatório right after the current card, before the synced ones): the `homeCards` sort swapped on the undefined sequence, the fallback kernel test rewritten and one test added (current card, then the unsynced one, then the sequenced ones); the two Home test files alone 73 of 73 (`.scratch-prodfix/s19-2-a-quick.log`), then the full story gate again under the host lock, api restarted first (`.scratch-prodfix/gate-19-2-a-*.log`): lint 0 errors (25 warnings in untouched specs), static green, test:api 96 files 733 tests (295 s), test:unit 333 files 4707 tests (209 s, host load up to 9.03, no red), `home.spec.ts` and `app-layout.spec.ts` 5 of 5 on `desktop-chrome` and `durability-desktop-chrome` (27 s). Spec closed.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass 1 (Blind Hunter 15, Edge Case Hunter 8, Verification Gap 0 gaps plus 2 other findings; every row verified against the working tree)

| Finding | Verdict | Evidence and route |
|---|---|---|
| ECH-1, ECH-8 (claim), VG-O2, BH-1: a relatório with no summary entry (created on the device, not yet synced) sorts after every sequenced card and can fall past the cut | medium | True: `cards.ts` sort puts `undefined` sequence last; the spec's own fallback sentence says so, so the code follows the spec. The intent "most recent first" has two readings for an unsynced creation (newest, or after the synced ones). Route: **intent_gap**, taken to Matheus as one question without reverting the code (the fix is one line in the sort and one test; re-deriving 750 lines for it serves no one). His answer is applied as a patch and the frozen fallback sentence is amended with his words. **Resolved 2026-10-30: Matheus chose A** (the unsynced new relatório right after the current card, before the synced ones); patched in `cards.ts` (the two `undefined` branches of the sort swapped), the fallback kernel test rewritten and one test added for the current card, then the unsynced one, then the sequenced ones; Boundaries and the I-O matrix amended with the date. |
| BH-2: the order changes after each sync, a card can leave the visible page between two taps | low | True by design: Matheus chose the last change on the server as the order ("1.a"); the movement shows only above the page size. Rejected (intended behaviour; recorded). |
| ECH-3, VG-O1, BH-3a: arrow keys change the page size and record no `home.page_size` event | low | True: `FilterChipGroup.moveTo` calls `onChange` directly and the instrument listens to `click`. Route: **patch** (the key handler clicks the target chip, so the existing guard and the click listener run). |
| ECH-4, BH-3b: a tap on the already-checked chip records an action the group ignores | low | True: the document listener records any enabled `data-telemetry` click. Rejected: negligible inflation, and the fix adds a guard to the shared listener. |
| BH-4: all four tiles share `home.status_chip` and the event has no value, so the digest cannot tell an Emitido press or the size picked | medium | True: `uxEventSchema` has no value field; the DoD sentence overpromises. Route: **defer** (ledger row: per-tile and per-size targets, an Epic 18 vocabulary decision) and the epics.md DoD sentence gets a dated narrowing. |
| ECH-6, BH-5a: `writeHomePageSize` rejected is an unhandled rejection | low | True: `void writeHomePageSize(db, size)`. Route: **patch** (`.catch`). |
| ECH-5, BH-5c: a stored 20/50/100 renders one frame of 10 before the live query answers | low | True (the implementation note says so). Route: **patch** (the page size is pending until read, like the rows). |
| ECH-7, BH-5b: `db === null` when a chip is pressed | false | Home renders behind a session with its database; the summary comes from the sync that needs the same session; no path renders the chips with `db === null`. Rejected. |
| ECH-2, BH-6: relatórios past the 100th are unreachable from Home | medium | True at company scale; the sizes are Matheus's, search waits for Bruno's volume answers; the Project surface lists a project's relatórios. Route: **defer** (ledger row) and a dated EXPERIENCE sentence naming the Project surface as the other way in. |
| BH-7: the note threshold uses `DEFAULT_HOME_PAGE_SIZE`, the rule says the smallest page | low | True, equal today. Route: **patch** (`HOME_PAGE_SIZES[0]`). |
| BH-8: the 480 px column rule is not in the mock and `flex-wrap` already drops the chips under the note | low | True (the 390 px pass shows the wrap). Route: **patch** (delete the rule). |
| BH-9: the pref key lives in `prefs.ts`, the others in `schema.ts` | false | `CAMERA_APP_PREF` (Story 17.2) also lives in `prefs.ts`; there is no single pattern to follow. Rejected. |
| BH-10: `noneActiveText` hard-codes "Emitido" and carries no `// authored` marker | low | True. Route: **patch** (the kernel's status label and the marker). |
| BH-11: the e2e seed comment misstates the emitted dates | low | True (`2026-0${(i % 9) + 1}-01` grows with `i` and cycles). Route: **patch** (comment). |
| BH-12: no test cuts a selection where the current card has the oldest sequence | low | True (two cards only). Route: **patch** (kernel test). |
| BH-13a: the offline manual check was not done and the spec does not say so | false | The Implementation Notes record the offline reload as not exercised on the dev server and why. Rejected. |
| BH-13b: "Mostrando 50 de N" with a full page never exercised | low | True (every test uses 12). Route: **patch** (kernel test, 60 cards on a page of 50). |
| BH-13c: the DoD asks for the chips at 390 and 1280 px; the e2e checks the wrap at 390 only | low | The chips are asserted at the desktop viewport too (presence, pressed state, telemetry); the wrap under the note was seen in the hands-on pass. Rejected (an extra box assertion for a look the pass confirmed). |
| BH-14: the story title in `epics.md` and the sprint-status key still say "capped with 'Ver todos'" | low | True. Route: coordinator's planning edit (a dated note under the heading; the sprint-status key is an identifier and stays). |
| BH-15: the EXPERIENCE § Home cell nests a strike-through inside two parentheticals | low | True. Route: coordinator's planning edit (the 19.2 note as its own dated parenthetical after the 19.1 one). |

## Design Notes

- Token gate: the spec is about 2400 tokens, above the 1600 guideline; kept whole on the coordinator's recommendation (one user-facing goal; the Code Map replaces the implementation agent's investigation), Matheus answered the open question without objecting.
- The surface stops passing `filter` to `homeCards` so the counts and the list come from one ordered card array; `homeList` is pure and small, which keeps `homeCards` from growing (cards.ts is already 320 lines).
- `updated_seq` is the server's op sequence: a relatório never pulled still carries it in the summary, so the order is the same on a fresh device and on one that holds every row; an unsynced local edit does not move a card until it syncs, which the current-card rule covers for the one being worked.

## Verification

**Commands (tools container, host lock, logs in `.scratch-prodfix/`):**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `static` / `test:unit` / `test:api` -- green (restart the api container before `test:api` and the e2e, since `packages/domain` changes)
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/home.spec.ts e2e/app-layout.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green; a unit red only under load is re-run alone and both runs recorded (E15-A4)

**Manual checks:**
- Real-browser pass (Epic 1 P2): 390, 768 and 1280 px, light and dark, keyboard through the tiles and the chips, offline reload with the pref kept.
