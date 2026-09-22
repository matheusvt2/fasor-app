---
title: 'Story 2.1: Register a test instrument with its calibration record'
type: 'feature'
created: '2026-09-22'
status: 'done'
dev_model: 'sonnet'
dev_effort: 'medium'
baseline_revision: 'bef76c2c9b995fe9f94bb4e9ed17b8de3de23352'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-epic-1-fix-ui-hygiene.md'
warnings: [oversized]
deferred:
  - summary: >-
      Component-level tests are missing for registries-surface.tsx, instrumentos-tab.tsx,
      instrument-row.tsx and the five placeholder tabs; only kernel unit tests and 4 e2e
      specs cover the surface (the AC4 referenced/unreferenced branch now has its own
      targeted component test).
    evidence: |-
      Internal review pass 2026-09-22. Real: zero `*.test.tsx` files existed under
      apps/web/src/surfaces/registries/ before the fix that added
      instrument-panel.test.tsx. Full coverage of every branch in the six new components
      is disproportionate to add in this pass under the current token budget.
    location: >-
      apps/web/src/surfaces/registries/
    severity: medium
  - summary: >-
      A second device editing the same instrument while the panel is open on a first
      device would show stale text for untouched fields, since each field seeds its
      local state once at mount and never resyncs from the live row.
    evidence: |-
      Internal review pass 2026-09-22. Real but unconfirmed by any test; the same
      seed-once-never-resync pattern is already used by every other Epic 1 field editor
      (e.g. RegistrationDialog), so it predates and is not unique to this story.
    location: >-
      apps/web/src/surfaces/registries/instrument-panel.tsx (TextField/NumberField/TestDefaultField)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** There is no Registries surface yet, and the `instrument` registry schema is missing fields (name, RBC toggle, calibration interval, laboratory, per-test-type defaults) the office needs to register a test instrument once instead of retyping it on every sheet.

**Approach:** Build the six-tab `/cadastros` surface (one file per tab, Instrumentos real, the other five stub placeholders for Stories 2.2-2.6), extend the kernel `instrument` schema, add pure kernel functions `calibrationCheck`, `calibrationValidUntil` and an `integrity` reference check (`isInstrumentReferenced`), and wire the existing autosave/commitBatch/outbox machinery to `registry/instrument/{id}` ops. No apps/api route changes: the generic `POST /api/sync/ops` reducer already tenant-scopes and applies any registry op.

## Boundaries & Constraints

**Always:** every instrument field autosaves on its own `registry/instrument/{id}/{field}` op (no Save button, per-field debounce via `useFieldCommit`); validity is computed, never stored, from `calibrated_at` + `calibration_interval_months` via kernel `calibrationValidUntil`; expired instruments never block anything, only show amber "Vencida em dd/mm/aaaa" and sort first; deletion is generic `removed_at` — "Arquivar" and "Remover" both set it, the only difference is which action the referenced-check offers and whether a `ConfirmDialog` + undo toast (`undoBatch`) gate it; the five non-Instrumentos tabs are placeholder components each in their own file under `apps/web/src/surfaces/registries/`, wired once into a single tab config array so Stories 2.2-2.6 only ever touch their own tab file; the tab selection persists per session (sessionStorage, key `registries.tab`); reuse `DialogShell`/`FormDialog`/`ConfirmDialog`/`Tabs`/`Toggle`/`Combobox` verbatim, no new dialog primitive; every new pt-BR string goes in `apps/web/src/copy/pt-br.ts` (surface copy) or `ui.ts` (shared chrome, e.g. a generic tab-placeholder sentence); every derived value/status/row text is a kernel function, never computed in `apps/web`.

**Never:** no certificate file upload UI (Story 2.2 owns `file` entity and the upload tile — leave `certificate_file_id` write-only-null in this story, and draw the tile as a disabled/placeholder affordance if the mock shows one); no live Combobox against a real manufacturer/voltage-class registry (Fabricantes/Classes de tensão are placeholders here — keep "Fabricante" a plain text field on the instrument form, Story 2.5's job to upgrade it); no apps/api route or schema change (the generic op reducer already handles this); no new dialog wrapper component; no `valid_until` write path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid calibration | `calibrated_at="2026-01-15"`, `interval=12`, `service_period_end="2026-06-01"` | `calibrationCheck` returns `'valid'` (validUntil `2027-01-15` is far past the period end) | n/a |
| Expiring within window | validUntil falls 0-30 days after `service_period_end` | returns `'expiring'` | n/a |
| Expired | validUntil is before `service_period_end` | returns `'expired'`, row shows "Vencida em dd/mm/aaaa" and amber, sorts first | n/a |
| No period context (registry list itself) | `service_period_end = null` | treat as "now" (today) for the comparison | n/a |
| Missing calibration data | `calibrated_at = null` or `interval = null` | `calibrationValidUntil` returns `null`; `calibrationCheck` returns `'valid'` (nothing to flag yet, never blocks) | n/a |
| Delete referenced instrument | `isInstrumentReferenced` true (a `block.sheet.test[*].instrument` cell equals this id) | only "Arquivar" offered, no Confirm dialog, direct commit + undo toast | n/a |
| Delete unreferenced instrument | `isInstrumentReferenced` false | "Remover" offered behind a `ConfirmDialog`, then `removed_at` op + undo toast | n/a |
| Offline create/edit | `navigator.onLine === false` (or sync engine reports offline) | op lands in the outbox, the row/panel reflects it immediately, pushed on next cycle | none surfaced; matches FR-54 |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts:93-105` -- `registryRowSchemas.instrument`: add `name: z.string()`, `rbc_accredited: z.boolean().nullable()`, `calibration_interval_months: z.number().int().positive().nullable()`, `laboratory: nullableString`; replace `test_parameter: nullableString` with three independent fields `test_isolacao`, `test_resistencia_contato`, `test_relacao_transformacao`, each `z.object({ raw: nullableString, unit: nullableString }).nullable()`; delete `valid_until` (was never derived correctly -- becomes computed-only).
- `packages/domain/src/ops/path.ts` -- `REGISTRY_FIELD`/`FAMILIES` already accept any key present in the schema per registry kind (`'registry'`, `'registry/field'` families); no change needed once the schema above is extended.
- `packages/domain/src/checks/unsynced.ts`, `packages/domain/src/status/table.ts` -- pattern to mirror for a new `packages/domain/src/checks/calibration.ts`: pure functions, injected `now`/`service_period_end`, doc comment citing AR-18.
- `packages/domain/src/format/datetime.ts:54-63` -- private `splitDate`/`formatDate` already produce `dd/mm/aaaa`; export a new `formatCalendarDate(value: string | null): string` wrapper for row/panel display (do not duplicate the parsing logic).
- `packages/domain/src/schemas/entities.ts:259-266` (`sheetSchema.test`) -- reference shape for the new `isInstrumentReferenced` check: cells are keyed `test[key].instrument` (a `cellSchema` whose `value` is the instrument id or null).
- `packages/domain/src/index.ts` -- add barrel exports for the new `checks/calibration.ts`, `checks/references.ts`, and the new row-text module below.
- `apps/web/src/components/index.ts` -- `DialogShell`, `FormDialog`, `ConfirmDialog` (controlled usage: `apps/web/src/surfaces/account/account-surface.tsx:269-278`), `Tabs` (`apps/web/src/components/tabs.tsx`, first real consumer), `Toggle` (`apps/web/src/components/toggle.tsx`), `Combobox` (`apps/web/src/components/combobox.tsx`) -- reuse verbatim.
- `apps/web/src/input/use-field-commit.ts` + `apps/web/src/db/commit.ts` (`commitBatch`, `undoBatch`) -- autosave/undo pattern; call-site model: `apps/web/src/surfaces/fixtures/field-fixture-surface.tsx:29-65` (op shape: `{kind:'put', scope:'company', company_id, project_id:null, relatorio_id:null, path:'registry/instrument/{id}/{field}', value, prev_op_id, batch_id, meta:null, actor_id}`; use `scope:'company'` and a `'create'` op for the first field of a new instrument, per `op.ts`).
- `apps/web/src/app.tsx:85-109` -- add `{ path: '/cadastros', element: <RegistriesSurface />, handle: { title: copy.registries.title } }` inside the `RequireSession` children.
- `apps/web/src/surfaces/home/shortcut-row.tsx` -- the Cadastros shortcut card is `aria-disabled` with a stale comment ("Both destinations belong to Epic 3"); enable it as a `Link to="/cadastros"` (Templates stays disabled -- Epic 3), fix the comment.
- `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/80-cadastros.html` -- authoritative mock (supersedes `key-registries.html`): tab list L82-89 (`.tabs[role=tablist]`, six `.tab[role=tab]`, `data-tab`); Instrumentos row L230-259 (`.registry-row`/`.rr-text`/`.rr-primary`/`.rr-secondary`/`.rr-expired`); persistent editor `<aside class="registry-panel">` L271-350, fields in order: Código (readonly) · Fabricante · Nome · Tipo/modelo · Nº de série · Certificado RBC nº · Data de calibração · Validade (readonly) · Emissor do certificado · Arquivo do certificado (draw disabled placeholder tile, no upload logic) · one "Tensão de ensaio padrão" measurement row (extend to three, one per test type); footer L343-349 `.sticky-action-bar` with the Arquivar/Remover reason line -- drop its "Salvar" button (AC2: no Save button), replace with a "Fechar" close action.
- `apps/web/src/styles/app.css` -- new `.frame-*` translations needed for `80-cadastros.html`'s own `<style>` L1-79 (`.registry-layout` column-stack on phone/tablet, `.registry-panel` width on tablet-landscape), per the AGENTS.md "Mock container selectors" convention; existing `.tabs`/dialog-scrim rules are already generic and reusable.
- `apps/api/src/sync/apply.ts:51-176` -- generic reducer already tenant-scopes every op by `company_id`; no route change. `apps/api/src/sync/sync.integration.test.ts:459` -- pattern for the new registry cross-tenant assertion (push a `registry/instrument` create under company A, assert company B's `GET /api/sync/company` pull never contains it).
- `e2e/durability.spec.ts:48,92,140,197` -- exact `@p0`-in-test-name tagging convention (no `{tag:}` option) to mirror in the new `e2e/cadastros.spec.ts`.
- `apps/web/src/copy/pt-br.ts` -- add a `registries` key (tab labels, Instrumentos empty state "Cadastrar instrumento", panel field labels, archive/remove copy, per-tab placeholder sentence reused via `ui.ts` if identical across the five stub tabs).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts` -- extend/trim `registryRowSchemas.instrument` as in the Code Map -- unblocks every op path below.
- `packages/domain/src/checks/calibration.ts` (+ `.test.ts`) -- `calibrationValidUntil(calibratedAt, intervalMonths)` (calendar month addition via `Date.UTC`, no TZ drift) and `calibrationCheck(instrument, servicePeriodEnd, opts?)` returning `'expired' | 'expiring' | 'valid'`, `servicePeriodEnd=null` compares against `now()` -- covers AC3 and the I/O matrix rows.
- `packages/domain/src/checks/references.ts` (+ `.test.ts`) -- `isInstrumentReferenced(instrumentId, blocks: readonly BlockRow[]): boolean` scanning `block.sheet.test[*].instrument.value` -- covers AC4's `integrity` rule (always `false` today, no blocks exist, but correct once Epic 5 lands).
- `packages/domain/src/registry/instrument-row.ts` (+ `.test.ts`) -- `instrumentRegistryRowText(instrument, calibrationStatus, now)` composing `{primary: "⟨code⟩ — ⟨name⟩ ⟨model⟩", secondary: "…serial · RBC ⟨cert_number⟩ · Vencida em dd/mm/aaaa"}` and a comparator/sort helper putting expired rows first -- covers AC1's row text and ordering as one kernel-owned "composed row" (AGENTS.md convention).
- `packages/domain/src/format/datetime.ts` -- export `formatCalendarDate`.
- `packages/domain/src/index.ts` -- barrel-export the three new modules.
- `apps/web/src/copy/pt-br.ts`, `apps/web/src/copy/ui.ts` -- add the Registries/Instrumentos copy and the shared "Em breve" placeholder-tab sentence.
- `apps/web/src/surfaces/registries/registries-surface.tsx` -- `<Tabs>` shell, six-entry tab config array (`{id, label, Panel}[]`) importing each tab file, `sessionStorage`-backed selected-tab state (default `instrumentos`), `main.screen`/`.content` chrome matching the mock.
- `apps/web/src/surfaces/registries/instrumentos-tab.tsx` -- live-queries local `registry` rows of `kind:'instrument'` (Dexie `entities` table, same pattern as Home/Account), renders sorted rows (expired first) via `instrumentRegistryRowText`, empty state "Cadastrar instrumento", opens the instrument panel on row tap or the empty-state button.
- `apps/web/src/surfaces/registries/instrument-panel.tsx` -- the persistent/overlay editor (desktop: side panel beside the list per the mock; phone: full-width takeover, matching AC2's "full-screen on phone" intent) with the field list from the Code Map, each field wired through `useFieldCommit` -> `commitBatch` on `registry/instrument/{id}/{field}`, `calibration_interval_months` + `calibrated_at` feeding a read-only `formatCalendarDate(calibrationValidUntil(...))` display, the RBC `Toggle`, the three per-test-type `{raw,unit}` rows, and the Arquivar/Remover footer driven by `isInstrumentReferenced` (Arquivar: direct commit + undo toast; Remover: `ConfirmDialog` then commit + undo toast via `undoBatch`).
- `apps/web/src/surfaces/registries/{empresa,clientes,fabricantes,classes-tensao,criterios}-tab.tsx` -- five minimal placeholder components (heading + the shared "Em breve" sentence), each its own file so Stories 2.2-2.6 replace only their own file's contents.
- `apps/web/src/app.tsx` -- add the `/cadastros` route.
- `apps/web/src/surfaces/home/shortcut-row.tsx` -- enable the Cadastros shortcut card, fix the stale Epic-3 comment.
- `apps/web/src/styles/app.css` -- add the `.registry-layout`/`.registry-panel` `.frame-*` translations.
- `apps/api/src/sync/sync.integration.test.ts` -- add the registry-instrument cross-tenant case (company A creates, company B's pull excludes it) -- DoD clause for a new op path touching tenant-scoped data.
- `e2e/cadastros.spec.ts` -- Playwright: `@p0` for the core flow (open Cadastros from Home, Instrumentos default+remembered per session, create an instrument, fields autosave, validity renders read-only and derived, row appears with correct text); `@p1`/`@p2` for edge cases (expired sorts first amber, offline create lands in outbox and pushes on reconnect, referenced-vs-unreferenced Arquivar/Remover + undo).

**Acceptance Criteria:**
- Given the Registries surface, when opened from Home's "Cadastros" shortcut, then all six tabs render, wrap rather than scroll sideways, Instrumentos is selected by default, and re-opening the surface in the same tab-session keeps the last selected tab (AC1).
- Given an instrument with a past validity date, when the Instrumentos list renders, then it sorts before valid/expiring ones and its row reads "Vencida em dd/mm/aaaa" in amber, never disabled or blocked from selection (AC1, AC3).
- Given the instrument panel open for a new or existing instrument, when any field changes, then a `registry/instrument/{id}/{field}` op commits with no Save button anywhere in the panel, and the Validade field is read-only and always equal to `calibrated_at + calibration_interval_months` (AC2).
- Given an instrument with zero references, when "Remover" is chosen, then a Confirm dialog gates the commit and a "Desfazer" toast follows; given an instrument with at least one reference, only "Arquivar" is offered and no Confirm dialog blocks it (AC4).
- Given the device offline, when an instrument is created or edited, then the row/panel update immediately from the local write and the op is visibly queued (Sync badge/outbox count increments), pushing once connectivity returns (AC5).

## Spec Change Log

_None — no bad_spec loopback occurred._

## Review Triage Log

### 2026-09-22 — Review pass

- verdicts: 10 findings — high 0, medium 6, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Código was a fully editable autosaving field for an existing instrument, contradicting the spec's own Code Map annotation `Código (readonly)` and the mock's static rendering — fixed: `instrument-panel.tsx` now renders Código as a plain editable `TextField` only while `instrument === null` (creation), and as a read-only `.input.tabular` display once the row exists.
  - `[medium]` `[defer]` No component-level (`*.test.tsx`) tests exist for `registries-surface.tsx`, `instrumentos-tab.tsx`, `instrument-row.tsx` or the five placeholder tabs — only kernel unit tests and 4 e2e specs cover the surface. The most severe instance (the AC4 referenced/unreferenced branch, tracked as its own finding below) is now patched with a targeted test; the broader coverage gap remains and is disproportionate to add in this pass under the current token budget. Added to `deferred-work.md`.
  - `[medium]` `[patch]` `NumberField` (calibration interval) silently dropped invalid input (decimal, zero, negative) with no commit and no visible feedback, leaving stale unsaved text on screen — fixed: `onBlur` now reverts the displayed text to the last actually-committed value when the current text never became a valid positive integer.
  - `[medium]` `[patch]` AC4's "referenced instrument -> only Arquivar, no Confirm dialog" branch had no test exercising `InstrumentPanel`'s actual conditional rendering (only the pure kernel predicate `isInstrumentReferenced` was covered) — fixed: added `apps/web/src/surfaces/registries/instrument-panel.test.tsx`, asserting the referenced/unreferenced button set and the Confirm-dialog gate.
  - `[low]` `[patch]` `calibrationCheck`'s window boundary (delta = -1/0/30/31 days) was untested, only a mid-window (~9 day) case existed — fixed: added four boundary assertions to `calibration.test.ts`.
  - `[low]` `[patch]` The `i-archive` sprite symbol was declared and asserted in `sprite.test.ts` but never referenced by any component, while the mock draws it on the Arquivar button — fixed: wired `i-archive` into the Arquivar `TextButton`. `i-plus` stays declared but unused in this diff: it is pre-provisioned for Stories 2.4/2.5's own "Novo cliente"/"Criar" buttons the mock draws with the same icon, not true dead code.
  - `[medium]` `[defer]` A second device editing the same instrument while this panel is open on the first would leave the open panel showing stale text for untouched fields (each field seeds its local state once at mount and never resyncs from the live row) — real but unconfirmed by any test, and the same seed-once-never-resync pattern is already used by every other Epic 1 field editor (e.g. `RegistrationDialog`), so it is not unique to this story. Added to `deferred-work.md`.
  - `[low]` `[reject]` A brand-new instrument can be created with only a non-identifying field set (e.g. toggling RBC before typing a code/name), leaving a blank `"— "` row in the list — consistent with the spec's own "no field required, nothing blocks" autosave boundary already applied identically elsewhere in the app (e.g. Empresa); guarding it would add validation this story's boundaries explicitly rule out, for a confusion-only harm no user has reported.
  - `[low]` `[patch]` The panel's accessible name (`aria-label`) used only the instrument's bare code, while the visible heading shows the fuller "code — name" title — fixed: switched to `aria-labelledby` pointing at the heading's own id, matching the mock's `DialogShell` pattern.
  - `[medium]` `[reject]` The spec's own Verification section lists commands as aspirational ("expected: ... all green") with no appended execution transcript — not a code defect; addressed structurally by the orchestrator's independent `pnpm verify` run recorded under `## Auto Run Result` below, per the playbook's own mandatory verify-before-PR step.

### 2026-09-22 — Post-independent-review fixes

The mandatory independent review (PR #13 comment) found 2 medium findings on top of the internal pass above; both patched. A hands-on user report of a misaligned two-column form at tablet width, filed against the same PR before merge, is addressed in the same commit.

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The three per-test-type "Valor"/"Unidade" inputs (Isolação, Resistência de contato, Relação de transformação) shared the exact same `aria-label` across all three groups, so a screen-reader user could not tell which test type they were editing — fixed: each input's `aria-label` now includes its field label (`"${label} — Valor"` / `"${label} — Unidade"`), verified live via a Playwright accessibility snapshot showing three distinct names.
  - `[medium]` `[patch]` The registry tab selection persisted via `sessionStorage`, while the architecture spine (AR-27) names this class of device preference for `local_prefs` (the same Dexie table `theme` and the recovery notice already use) — fixed: added `REGISTRY_TAB_PREF` to `db/schema.ts`, `readRegistryTab`/`writeRegistryTab` to `db/prefs.ts` (mirroring `ThemeProvider`'s async-read-then-correct pattern), and `registries-surface.tsx` now reads/writes through those instead of `sessionStorage`. `e2e/cadastros.spec.ts`'s 2.1-E2E-001 (tab remembered across navigation) still passes unchanged.

Separately, a real-browser user report (not from either review pass) found the instrument form's two-column field grid misaligned at tablet width in dark mode: a wrapping label ("Intervalo de calibração (meses)") pushed only its own control down, and the RBC `Toggle` did not share the input row's height/position with its neighbour ("Certificado RBC nº"). Fixed structurally in `apps/web/src/surfaces/registries/registries.css`: `.field-grid` now defines a 4-track-per-row `grid-auto-rows` pattern (label, control, helper, a fixed spacer track) and every `.field-grid > .field` becomes a `grid-template-rows: subgrid` item spanning those 4 tracks, so a taller label (or a helper present on only one sibling) shifts both columns' controls down together instead of only its own. Verified with a live Playwright accessibility snapshot (boxes) at 390/768/1280, light and dark: at every width the paired controls' top offsets match exactly (e.g. at 1280px "Data de calibração" itself now wraps to two lines, yet both it and "Intervalo de calibração" still start their control track at the same y). A screenshot at 768px dark is saved to `_bmad-output/implementation-artifacts/reviews/story-2-1/cadastros-panel-768-dark.png`. A new regression test, `e2e/cadastros.spec.ts` `@p2 2.1-E2E-005`, asserts the two previously-misaligned pairs keep equal top offsets at 768px.

## Design Notes

**Mock vs. epics.md AC2 wording ("Form dialog on desktop, full-screen on phone"):** the authoritative mock (`80-cadastros.html`) draws a persistent `<aside class="registry-panel">` beside the list, not a `FormDialog` overlay, and neither `EXPERIENCE.md` nor `DESIGN.md` contradicts it. Per AGENTS.md ("Screens are built from the mockups... DESIGN.md and EXPERIENCE.md win over a mock on conflict"), the mock stands: build the side panel, collapsing to a full-width takeover on phone/tablet via `.registry-layout{flex-direction:column}` -- functionally satisfying "full-screen on phone" without introducing the `FormDialog` component for this tab. Document this call in the PR description.

**No `archived_at` field:** "Arquivar" and "Remover" are the same underlying `removed_at` op; the mock's own reason line ("Arquivar tira o {code} das listas e mantém as fichas") confirms materialize never purges by id, so a referenced row stays resolvable for old sheets regardless of `removed_at`. Only the offered action/label and the Confirm-dialog gate differ, driven by `isInstrumentReferenced`.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, test:unit (including the new kernel tests), test:api (including the new cross-tenant case), test:e2e `@p0` all green.
- `docker compose --profile tools run --rm tools pnpm test:e2e:full` -- expected: the `@p1`/`@p2` cadastros cases also pass (not gating, run once for evidence in the PR body).

**Manual checks (if no CLI):**
- Real-browser pass (390/768/1280, light/dark, keyboard-only, offline) on `/cadastros`: no sideways overflow on the tab list, visible focus on tab/row/toggle, panel fonts render inside the portal, expired row reads correctly in dark mode.

## Auto Run Result

Status: done

**Summary.** The six-tab `/cadastros` Registries surface is built, with Instrumentos fully implemented and the other five tabs as one-file-per-tab placeholders. The kernel `instrument` registry schema gained `name`, `rbc_accredited`, `calibration_interval_months` and `laboratory`, and traded its single `test_parameter` string for three independent per-test-type `{raw,unit}` fields; `valid_until` is no longer stored, only computed. New kernel functions: `calibrationValidUntil`/`calibrationCheck` (AR-18, calendar-month math via `Date.UTC`, injected `now`), `isInstrumentReferenced` (the `integrity` rule, AC4), and `instrumentRegistryRowText`/`sortInstrumentRegistryRows` (the composed row text and expired-first ordering). The Instrumentos panel is the mock's persistent side panel (Design Notes documents this departure from epics.md's literal "Form dialog" wording), every field autosaving its own `registry/instrument/{id}/{field}` op with no Save button; Código is editable only while the instrument does not yet exist, then read-only. Arquivar/Remover both resolve to the same `removed_at` op; `isInstrumentReferenced` picks which action and whether a `ConfirmDialog` gates it, both followed by an undo toast. No apps/api route changed — the generic op reducer already tenant-scopes and applies `registry/instrument` ops; a cross-tenant test was added for this op path per the Definition of Done.

**Files changed.**
- `packages/domain/src/schemas/entities.ts` (+ `fixtures/replay-small/{op-log.ts,snapshot.golden.json}` regenerated) -- extended `instrument` row schema
- `packages/domain/src/checks/calibration.ts`, `src/checks/references.ts`, `src/registry/instrument-row.ts` (+ tests) -- `calibrationCheck`/`calibrationValidUntil`, `isInstrumentReferenced`, row text + sort
- `packages/domain/src/format/datetime.ts`, `src/index.ts` -- `formatCalendarDate`, barrel exports
- `apps/web/src/surfaces/registries/*` (11 files, incl. `instrument-panel.test.tsx` added in review) -- the surface, six tabs, the instrument list row and panel
- `apps/web/src/db/home-store.ts` -- `instrumentRows`, `blockRows` live-query sources
- `apps/web/src/app.tsx`, `src/surfaces/home/shortcut-row.tsx` (+ test) -- `/cadastros` route, enabled Cadastros shortcut
- `apps/web/src/copy/{pt-br,ui}.ts`, `src/styles/app.css`, `src/surfaces/registries/registries.css` -- Registries copy, `.frame-*` translations, the subgrid field-grid alignment fix
- `apps/web/public/sprite.svg`, `src/styles/sprite.test.ts` -- `i-close`, `i-plus`, `i-archive` symbols (`i-archive` wired into Arquivar during review)
- `apps/api/src/sync/sync.integration.test.ts` -- registry/instrument cross-tenant case
- `apps/web/src/db/schema.ts`, `src/db/prefs.ts` -- `REGISTRY_TAB_PREF`, `readRegistryTab`/`writeRegistryTab` (post-review: tab selection moved off `sessionStorage`)
- `e2e/cadastros.spec.ts` -- 5 tests: `@p0` core flow, `@p1` expired-sorts-first, `@p1` unreferenced Remover+undo, `@p2` offline create, `@p2` paired-field alignment (added post-review)

**Review findings.** Internal pass: 10 findings from one combined review layer (blind hunt + edge cases + verification gap + intent alignment, per LEAN MODE): medium 6, low 4. Patched 7, deferred 2, rejected 2 (detail in the Review Triage Log above). Independent review (PR #13 comment): 2 more medium findings (the measurement-field `aria-label` collision, `sessionStorage` vs `local_prefs` for the tab preference), both patched. Plus one user-filed alignment bug (two-column field grid misaligned at tablet width), fixed structurally with CSS subgrid and a new regression test. 12 findings total across both passes: medium 8, low 4; patched 9, deferred 2, rejected 2.

**Follow-up review recommendation:** true (0 high patched, but well over the "two or more medium" threshold across both passes). Named unverified risk: this pass used one combined review layer (LEAN MODE) instead of four independent ones for the internal pass, so a disagreement or gap a second, differently-angled internal layer might have caught cannot be fully ruled out — though the mandatory independent review already ran once and found only 2 (now-fixed) mediums, which bounds this risk.

**Verification.** `docker compose --profile tools run --rm tools pnpm verify` green (exit 0) after the internal-review patches: lint, static, domain 316 tests / 26 files, web 408 tests / 50 files, api 69 tests / 12 files, Playwright `@p0` 15/15 including `2.1-E2E-001`; full run ~2 minutes (log: internal scratchpad `verify-1.log`). After the independent review's 2 patches and the alignment fix: `pnpm --filter @app/web run typecheck` clean, `pnpm --filter @app/domain --filter @app/web run test` green (408/408 web, unchanged pass count, new assertions inside existing files), and `npx playwright test e2e/cadastros.spec.ts --project desktop-chrome` green 5/5 including the new `2.1-E2E-005` alignment test; a live Playwright accessibility-snapshot pass (with bounding boxes) at 390/768/1280px, light and dark, confirmed the fix holds at every width (screenshot: `_bmad-output/implementation-artifacts/reviews/story-2-1/cadastros-panel-768-dark.png`). A second full `pnpm verify` runs after merging `origin/main`, before the squash merge (the second of the two full runs this pass budgets). Matrix audit: every I/O & Edge-Case Matrix row is covered by a passing test, unchanged by this round's patches.

**Residual risks.** The AC4 referenced-instrument path still has no e2e coverage (no `block` can exist before Epic 5); covered at the kernel and component level only. `rbc_accredited` and `calibration_interval_months` have no mock control to check placement/wording against, flagged with `// authored:` notes. The broader component-test coverage gap and the concurrent-edit reconciliation gap remain deferred (see `deferred-work.md`). The field-grid subgrid fix is verified structurally (accessibility-snapshot bounding boxes) rather than by pixel screenshot comparison; a future visual-regression tier (already a deferred item from Epic 1, `spec-1-2` item 2) would catch a subtler misalignment this cannot.
