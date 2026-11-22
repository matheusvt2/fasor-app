---
title: 'e27c: layout and organisation (Stories 27.11 to 27.14)'
type: 'feature'
created: '2026-11-22'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high (27.11, floor: overflow menu and focus); medium (27.12, 27.13, 27.14)'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27-context.md'
warnings: ['batched']
batched_reason: 'Epic 27 wave 3 is one batch and one PR (token economy of 2026-11-12); the four stories are screen layout and words over the Sumário, the ficha, Etapa 1 and the template editor, with no kernel or print code between them.'
deferred: []
baseline_revision: '42b0d25b0914054731f0996fe6735b0294abca6b'
---

<intent-contract>

## Intent

**Problem:** The manual pass of 2026-11-21 found fixed bars that eat the screen (F14), a cover tile without its thumbnail and a one-line input for long text (F15, F16), contradictory hints and three identical "Confirmar" buttons, a red "Obrigatória" before anything is typed (F17 to F19), a squeezed template card and two numbers per section row (F20), and Home cards that cannot be told apart (F21). Wave 1 also left two tables that do not fit: an oil transformer's readings table at 1280 px, and the disjuntor table at 768 px with the tree opened by hand.

**Approach:** Screen-only fixes, every seed. The stories, word for word, are `_bmad-output/planning-artifacts/epics.md` lines 12155-12301 (read with offset/limit only; the epic's rules are lines 11629-11637). Findings: `_bmad-output/test-artifacts/manual/ux-pass-2026-11-21.md` (grep the F number). This spec adds the batch's readings; where it is silent the story text rules.

## Boundaries & Constraints

**Always:**
- No contract number, no seed change, no migration, no golden / layout lock / `pdf-text.json` change. If one turns red or seems needed, stop and report.
- Screens from the mocks with the mock's class names; `tokens.css` and `components.css` byte-identical; any translation or authored rule goes in `apps/web/src/styles/app.css` (or the surface's own css) with a comment naming the mock rule or saying `authored (batch e27c, Story 27.x)`. Behaviour from React Aria Components. No Tailwind, no new look, no emoji.
- CSS-only width switches (the codebase's rule: never a JS `matchMedia`; precedent `block-palette-field.tsx` draws both rows and CSS shows one).
- `apps/web` derives no status, count, plural, date text or rule. Static copy in `apps/web/src/copy/pt-br.ts`, component chrome in `copy/ui.ts`; every authored pt-BR sentence marked `// authored:` and listed in the implementer's report.
- Epic 26's permission checks in `sumario-surface.tsx` / `sumario-actions.ts`, its blocks in `pt-br.ts` and at the end of `app.css` stay intact. Each action moved into a menu keeps its permission check and its disabled reason (`OverflowMenuAction.disabled` + `reason`).
- Before changing a label or a selector, grep `e2e/` and `apps/web/src/**/*.test.tsx` for the old words / selector and update what asserts them in the same story. List the grep and its hits in the report.
- Every layout story's Playwright spec measures geometry at 390, 768, 1024 and 1280 px plus one dialog or menu: no horizontal page overflow, the fixed bars' height as a share of the viewport, the primary action visible. Layout-measuring specs go in `SERIAL_SPECS` lane `solo` (`e2e/support/groups.ts`), as `corrected-column-fit.spec.ts` does.
- A new `@p0` spec asserts committed state (outbox or store) where it writes, not only the screen.

**Never:**
- Edit `apps/web/src/app.tsx`, the Login screen, `permissions/`, `http/session.ts`, `auth/auth.ts`, `ops/path.ts`, `contract/errors.ts`, `contract/sync.ts`, `contract/version.ts`, any seed file, `epics.md`, `sprint-status.yaml`, `docs/kbs/`.
- Edit `DESIGN.md` / `EXPERIENCE.md` (the orchestrator writes every amendment after the build from the implementers' reports; report the exact departure from the mock instead).
- Change the template's reorder (Story 27.5 AC2 waits for Matheus).
- Build the Home half of Story 27.14 (see Narrowings).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sumário phone | 390x844, Em revisão with "Marcar como enviado" offered, a banner shown | footer: one button ("Gerar relatório"); "Pré-visualizar" and "Marcar como enviado" in the header overflow menu; content area >= 50 % of 844 | a role without `relatorio.issue`: the menu entries show disabled with `permissionRefusalText(...)` as reason; offline: "Pré-visualizar" disabled with `copy.export.offlineReason` |
| Sumário 768/1280 | same states | footer and header menu exactly as today | - |
| Sumário phone menu empty today | a role whose header menu had no entries | the phone menu still draws (it holds the moved actions) | - |
| Ficha 1024x768 | items unanswered, checklist on screen | no bulk bar inside `.sticky-action-bar`; the bulk bar sits in the checklist flow above the first unanswered item; fixed bars <= action bar + stepper | all answered: the bar at the list head, disabled with its reason (J-15 as today) |
| Ficha bulk press | keyboard press on the in-flow "Marcar os restantes como Conforme" | items marked; focus never lands on `body` (goes to the list head's action) | - |
| Cover photo | a photo chosen in Etapa 1, then offline reload | the tile shows its thumbnail from the local file | no file blob: the tile as today |
| Informações adicionais | three paragraphs typed, field left, reload | textarea of the mock's class, several lines, saved on blur, count follows | cap as today |
| Caption dialog | generated / edited by hand / composed from the three fields | exactly one hint, the state's | - |
| Conclusion buttons | adjusted note + text + observation pending | three different visible labels and accessible names | - |
| Obrigatória | item just marked NC | no red mark, no `aria-invalid` until the field is left empty or the step's conclude is attempted | the conclude path still finds the field |
| Template local card | 768 and 1024 px | meta text >= half the card's width, wraps as a sentence | - |
| Template section row | any section | one number (Story 27.5's); the position only as the move control's value | - |
| Oil transformer table | 1280 px | no overflow of its `.mt-scroll` box, if the stacked corrected-column variant solves it | else: report, no new look |
| Disjuntor table 768 + tree open | 400 px box | no inner scroll, if the stacked variant solves it | else: report (it already applies there; measured 571 px in 400 px) |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:442-477,543-592` -- header `OverflowMenu` (`headerItems`) and the footer `.sticky-action-bar` (Pré-visualizar, Marcar como enviado, `GenerateAction`); focus helpers query `.overflow-trigger` (`:359`, `:605`) and must find the visible one.
- `apps/web/src/components/overflow-menu.tsx` -- items carry `disabled` and `reason`.
- `apps/web/src/styles/app.css:116-135` -- the phone translations (`.frame-phone .sticky-action-bar .bar-buttons` column rule); `:1273-1294` the e23v / Story 27.7 stacked corrected-column rules.
- `apps/web/src/surfaces/ficha/sticky-action-bar.tsx`, `ficha-surface.tsx:292-296` (`secondary` = the compact mirror), `use-checklist-mirror.ts`, `checklist-section.tsx:173-211` (`BulkActionBar`), `:250` (the list head's bar), `:440-680` (`ChecklistRow`, `required`, `data-missing-field`).
- `apps/web/src/surfaces/photos/caption-composer.tsx:285-293` -- the three hints.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx:~466,~543` and the third "Confirmar" -- all `ui.suggestionField.confirm`.
- `apps/web/src/surfaces/relatorio/setup/etapa1-capa.tsx:100-122` -- the `<input>` and the cover `UploadTile` without `previewSrc`; `components/upload-tile.tsx` (`previewSrc`); how other tiles get a local preview: grep `previewSrc=`.
- `apps/web/src/surfaces/templates/skeleton-list.tsx:~215`, `templates/templates.css:~98`, `templates/section-list.tsx:~108` -- the local card and the section row's two numbers.
- Mocks (grep, never read whole): `mockups/prototype/screens/40-relatorio-overview.html`, `60-ficha.html`, `50-relatorio-setup.html`, `41-templates.html`, `42-template-composer.html`.
- Specs: `e2e/corrected-column-fit.spec.ts` (extend), `e2e/relatorio.spec.ts` (the Sumário), `e2e/ficha.spec.ts`, `e2e/templates.spec.ts`, `e2e/home.spec.ts`, `e2e/journey-taps.spec.ts` and every spec that reaches `.sticky-action-bar .bulk-action-bar` (grep `bulk-action-bar\|is-compact\|Marcar os restantes`).

## Tasks & Acceptance

**Execution (implementer A, in order: 27.11 + the two tables, then 27.13):**
- `sumario-surface.tsx` + `app.css` -- Story 27.11 Sumário: draw two header menus, CSS shows one: the wide one (today's `headerItems`, shown from 768 px) and a phone one (`headerItems` plus "Pré-visualizar" and, when `sent.offered`, `MARK_SENT_LABEL`, each with today's disabled condition and reason; shown below 768 px). Below 768 px the footer's secondary buttons are hidden by CSS (authored rule next to the `.frame-phone .sticky-action-bar` translation) and the phone footer is capped (authored `max-height` share of the viewport with `overflow-y: auto`; pick the smallest value that keeps the AC with the longest reason line). The preview's working label and its error lines stay in the footer. Focus helpers return to the visible trigger. Web unit tests updated so both menus do not break `getByRole` queries (scope by container or class).
- `ficha-surface.tsx`, `sticky-action-bar.tsx`, `use-checklist-mirror.ts`, `checklist-section.tsx` -- Story 27.11 ficha: no bulk bar in `.sticky-action-bar` (the `secondary` slot goes or stays empty); the checklist's `BulkActionBar` renders in the flow above the first unanswered item (`checklistUnsetItems`, kernel), at the list head when that is item 1 or none is left (J-15 disabled-with-reason kept). Keep `.checklist > li` counts that tests assert unchanged (no extra `li` unless every asserting test is updated). The focus rescue keeps focus off `body` after a press that moves the bar.
- `app.css` + `e2e/corrected-column-fit.spec.ts` -- the two known-open tables: measure first. Apply the stacked corrected-column rule (copy of the Story 27.7 declarations, new authored comment with the measured widths) to the oil transformer at 1280 px and to the 768 px tree-open case only where it removes the overflow; add one test per case (new ids `27.7-E2E-002`/`-003` or the next free). Where the stacked rule does not solve it, leave the CSS alone and report the widths measured.
- `e2e/fixed-bars.spec.ts` (new, solo lane) -- "27.11-E2E-001": Sumário at 390x844 (one footer button, the menu holds the moved actions and each still works or is disabled with its reason, content >= 50 %), 768 and 1280 (footer as today: its buttons present), ficha at 1024x768 (no bulk bar in the fixed bar, fixed bars <= stepper + action bar, the in-flow bar above the first unanswered item, a press marks and the store/outbox holds the marks), 390 and 768 too; no horizontal overflow at each width; the menu opened once.
- `caption-composer.tsx` -- Story 27.13: one hint by state (generated, edited by hand, composed from the three fields); read the three existing strings and keep their words.
- `conclusao-section.tsx` + `pt-br.ts` -- Story 27.13: "Confirmar resultado" (the adjusted note's pair), "Confirmar texto" (the conclusion text), "Confirmar observação" (the observation/items line); the accessible names follow. Which button writes what: read the code; if the mapping of the coordinator's three words to the three buttons is not clear, say so in the report and use the closest reading. Grep `e2e/` and the tests for `name: 'Confirmar'` / `ui.suggestionField.confirm` on the ficha and update the hits.
- `checklist-section.tsx` -- Story 27.13: `required` visible (red reason, `aria-invalid`, `data-required`) only after the observation field was blurred empty or a conclude was attempted on the sheet; `data-missing-field` (what the conclude path finds) unchanged.
- `e2e/ficha-dialog-words.spec.ts` (new) + web tests -- "27.13-E2E-001" and unit tests for the three hint states, the three labels, the blur rule.

**Execution (implementer B, in parallel, different files: 27.12 then 27.14's templates half):**
- `etapa1-capa.tsx` -- Story 27.12: the cover `UploadTile` gets `previewSrc` from the local file the way other tiles do; "Informações adicionais" becomes a `<textarea>` of the mock's textarea class (grep `50-relatorio-setup.html` and `components.css` for `textarea`), same `maxLength`, `onChange`, `onBlur`, `CharCount`.
- `e2e/setup-cover.spec.ts` (new) -- "27.12-E2E-001": the photo, its thumbnail (assert the image's natural size > 0), offline reload keeps the thumbnail, three paragraphs typed show on several lines (element height > one line), saved on blur (store value), kept after reload, the count follows; geometry at 390, 768, 1024, 1280.
- `skeleton-list.tsx`, `templates.css`, `section-list.tsx` -- Story 27.14 templates half: the local card's meta text takes the card's width; the section row shows one number (27.5's), the position stays only as the move control's value; grep tests asserting the second number.
- `e2e/templates-home-cards.spec.ts` (new) -- "27.14-E2E-001" templates cases only (meta width >= half the card at 768 and 1024; one number per row); the Home case is narrowed.

**Acceptance Criteria:** the story ACs of `epics.md` 12172-12184, 12209-12217, 12244-12256, 12283-12291 (Home AC excluded, see Narrowings), plus:
- Given every spec listed under Verification, when run on the final head, then all pass.
- Given the batch diff, when checked, then `tokens.css`, `components.css`, every golden, layout lock and `pdf-text.json` are unchanged.

## Design Notes

- **Narrowing (Story 27.14, Home):** a card not on the device is built from the company pull's summary (`packages/domain/src/contract/sync.ts` `relatorioSummarySchema`), which carries no service date; the server's `apps/api/src/sync/pull.ts:168` would have to add `service_start`/`service_end`. The precedent of an optional summary field (Story 10.4's `progress`) took contract 11, and this batch takes no contract number, so the Home half (the date on an absent card, the twins' line, "27.14-UNIT") is left for the coordinator. On-device twins already differ by `meta` (dates, template) unless all of these are equal.
- **Ficha bulk bar:** the coordinator's reading (in the flow, above the first unanswered item). Answering in order, the bar moves below the item just answered, so the next unanswered item does not move under the finger.

## Verification

All under `lockf -t 7200 /tmp/fasor-verify.lock`, inside the tools container (`podman compose --profile tools run --rm --user root tools ...`), output to `.scratch-e27c/<name>.log`, tail only:
- `pnpm lint`, `pnpm static` -- exit 0.
- `pnpm test:unit -- <touched web test paths>` while iterating; the whole `pnpm test:unit` at the batch gate.
- `pnpm exec tsx scripts/e2e.ts <spec paths> --project desktop-chrome --project durability-desktop-chrome` -- the new specs, `corrected-column-fit`, and every spec the greps hit.

## Auto Run Result
