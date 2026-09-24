# Independent review: PR #27, Stories 4.2, 4.6 and 4.7 (batch C)

Reviewed 2026-09-24, against `git diff origin/main HEAD` on `story/4-2-4-6-4-7-setup-status-section-text` (head `81d57a3`), including the internal review's patches and the merge of batches B (4.4/4.5) and D (4.8).

**Verdict: changes-requested.** The kernel additions, the `advanceOnEdit` wiring in `commitBatch`, the section text editor and the Sumário's backward move are well built. The hand-merged `sumario-surface.tsx` is intact: against `origin/main` its diff only adds lines, so 4.4/4.5's tree and palette are untouched. Two defects block the merge. First, the setup page's date fields corrupt data when digits are typed at normal speed. The "truncated year" from the QA pass was not a browser-automation artifact. I reproduced it with the same `page.keyboard.type` the e2e helper uses: the stored value was `0202-09-06`, and a second typed date was dropped entirely. `4.2-E2E-001` passes only because it never reads back the dates it types. Second, after the merge the renderer still resolves `{escopo}` from `setup.atividade` and ignores `setup.exclusions`. What a user types in Etapa 2 never reaches the generated document, and the kernel now holds two section-variable mappings that disagree. There are also several should-fix items: AC deviations (no Conselho segmented control, no amber line on expired instruments, a plain-text banner instead of the UX-DR11 Banner), a focus drop after "Desfazer", and missing `.frame-phone` translations.

Counts: must-fix 2 · should-fix 9 · nice-to-have 5 · note 2.

## Findings

1. **Must-fix: typing a date on the Setup page stores a truncated year or drops the date.** `apps/web/src/surfaces/relatorio/setup-surface.tsx:284-286` and `:685-689`, with `apps/web/src/components/date-field.tsx`.
   - **Cause.** `DateField` is controlled by `value`, and `value` comes from Dexie through `useLiveQuery`. React Aria calls `onChange` for every intermediate valid date while the year is typed (year `2`, `20`, `202`). Each call commits a `relatorio/setup/*` op at once, with no debounce. The live query then re-renders `value` in the middle of typing, and React Aria resets the year segment's typing buffer. The "Novo relatório" dialog does not break because it holds its dates in synchronous local state (`new-relatorio-dialog.tsx:150-151`).
   - **Evidence.** A temporary Playwright probe on `desktop-chrome` (compose project `fasor-e4c`, now removed from the tree) clicked the day segment, then ran `page.keyboard.type(...)`:
     - "Início da execução", typed `06092026`: segments `['06','09','202']`, stored `service_start = 0202-09-06`.
     - "Início da execução", typed `01102026`: segments stayed `['06','09','2026']`. The whole input was lost.
     - "Próxima intervenção recomendada" (empty field), typed `15092027`: segments `['15','09','2']`, stored `next_intervention_date = 0002-09-15`.
     - The same entry with `{ delay: 150 }` stored correctly (`2026-09-08`). The failure depends on typing speed, so it is not an automation quirk. On a tablet, one debounce window or a fast typist is enough.
     - The QA screenshot `qa-epic-4-C/15-sumario-overflow-open-1280-light.png` shows the corrupted data reaching the Sumário meta line: "01–08/09/0202".
   - **Test gap.** `e2e/relatorio.spec.ts:493-494` and `:533` type dates on the Setup page but never assert the rendered segments or the stored value. The only date assertion in the flow (`relatorio-flow.ts:47`) is on the dialog's field, a different component instance. The claim that "4.2-E2E-001 asserts correct values" is not true for this surface.
   - **Fix direction.** Give the Setup date fields a local echo plus a `useFieldCommit`-style commit (idle or blur) that ignores intermediate states, as `useTextField` does for text. Add e2e assertions on the segments and on the stored ISO value for all three date fields.

2. **Must-fix: after the merge, Etapa 2 "Escopo" and the exclusions list never reach the document, and the kernel has two diverging section-variable mappings.** `packages/domain/src/print/layout.ts:109-123` and `:199-205`; `packages/domain/src/relatorio/section-variables.ts`.
   - Batch D's `sectionInputs` maps `escopo` to `setup.atividade`. This batch's Setup page writes `setup.escopo` and never writes `atividade`.
   - Section 3 prints the seed's own items (`seededBlocks`), so `setup.exclusions` is ignored.
   - `sectionVariables`, `section3Text` and `defaultExclusions` were written for the renderer to call "once merged" (spec Design Notes, "Cross-batch contract"). `sectionVariables` and `section3Text` have zero callers after the merge: `grep` finds only `defaultExclusions`, used in `setup-surface.tsx:330`.
   - The two functions also differ on `obra`: `layout.ts` treats a blank `local` as unset, `section-variables.ts` does not.
   - This breaks AD-1 (the kernel computes each text once) and silently loses data the user types under a band labeled "Seções 1 e 3".
   - The merge wired only the ART number into the renderer (`apps/api/src/jobs/generate/job.ts:221`). No `deferred-work.md` entry records the gap.
   - **Fix direction.** Make `layoutSpec` use one mapping (either `sectionVariables`, or `sectionInputs` extended with `escopo`) and `section3Text` for section 3. Delete the loser. Add a layout test with a non-null `escopo` and `exclusions`.

3. **Should-fix: the Responsável Combobox shows the signed-in user's name while nothing is selected.** `setup-surface.tsx:433`.
   - A new relatório has `responsible_user_id: null`. The combobox input still displays the session user's name (probe: value `Bento Braga`).
   - Meanwhile the Conselho, number and ART/TRT fields stay hidden (`selected === null`), and "Concluir dados do relatório" reads "falta o responsável técnico".
   - The screen looks filled while it is not. The AC says name and council are "prefilled from the account's Registro profissional". Either commit the default as a real `responsible_user_id` put, or show an empty input.

4. **Should-fix: no Conselho segmented control.** `setup-surface.tsx:475-478`.
   - The Story 4.2 AC reads "with the Conselho segmented control relabeling the two number fields", and the mock's D2 draws it (`50-relatorio-setup.html:143-150`, `.council-field .segmented`).
   - The implementation shows the council as a read-only `.input` div.
   - The spec's own Design Notes (l.202) list the "council Segmented-control relabeling" among the widgets it reuses, but the code does not contain it.
   - The Responsável helper "Assina a seção 10 como ⟨título⟩ · conselho e número vêm do perfil" is also missing. The Code Map asked to display `selected.title`.
   - If read-only is the intended narrowing (council lives on the user's profile), record it in `epics.md` with a dated strike-through, as PRs #25 and #26 did.

5. **Should-fix: expired instruments have no amber line and no described-by note.** `setup-surface.tsx:567-570`.
   - The AC asks for "expired ones selectable with their amber line", and the Code Map asked for `aria-describedby` pointing at the expired note when `validity.expired`.
   - The row concatenates ``` ` · ${text.validity.text}` ``` as plain text.
   - The registry's own row does it right (`apps/web/src/surfaces/registries/instrument-row.tsx:38`, `.rr-expired` span). The mock uses `<span class="ip-expired">` plus `<p class="ip-expired" role="status">` with `aria-describedby` (`50-relatorio-setup.html:219-228`).
   - No unit or e2e test covers an expired instrument on this page.

6. **Should-fix: focus drops to `<body>` after "Desfazer" on the section text (E3-A8).** `apps/web/src/surfaces/relatorio/section-text-surface.tsx:139-143`.
   - Probe: the toast's "Desfazer" was focused and activated with Enter. Afterwards `document.activeElement` was `BODY`.
   - The spec required "focus stays sane after restore/undo (E3-A8)". Restore itself is fine: focus stays on the now-`aria-disabled` "Restaurar texto do template".
   - Move focus to the text area, or back to "Restaurar", after the undo.

7. **Should-fix: the issued banner is plain grey text, not the UX-DR11 warning Banner.** `apps/web/src/surfaces/relatorio/sumario-surface.tsx:309`.
   - The AC says "the warning banner reads …" (UX-DR11), and EXPERIENCE.md l.389 names a "Relatório overview Banner".
   - The app already has the `.banner` component (warning by default, `components.css:136`) and a single banner slot with a `relatorio-exported` kind reserved for exactly this (`apps/web/src/state/banner-slot.tsx:17-25`).
   - This PR renders a `.section-note` instead (screenshot 15).
   - The text also differs from the AC: `issuedBannerText` prints `dd/mm/yyyy` ("10/09/2026"), while the AC and EXPERIENCE.md write `dd/mm` ("09/09"). Confirm which one is intended.
   - The banner shows whenever any revision exists, whatever the status, so it stays after "Voltar para Em campo" or "Voltar para Rascunho". The AC scopes it to "Emitido or Em revisão after an issue".

8. **Should-fix: missing `.frame-phone` translations for the setup page.** `apps/web/src/styles/app.css` (the phone block near l.207).
   - The mock's `.frame-phone … .band-head { flex-wrap: wrap }`, `.band-note { margin-left: 44px; flex-basis: 100% }`, `.band-body .row { flex-wrap: wrap }` (`50-relatorio-setup.html:48-50`) and `.instrument-list .ip-code { min-width: 32px }` (l.29) are not translated.
   - AGENTS.md ("Mock container selectors") requires each `.frame-*` rule to be translated in the change that first renders it.
   - Visible in `qa-epic-4-C/01-setup-etapas-390-light.png`: the band notes squeeze beside the titles ("Seções 1 / e 3", "Seção / 11") instead of wrapping to their own line.

9. **Should-fix: an equipment TAG rename never advances Emitido to Em revisão.** `apps/web/src/db/commit.ts` (the `byRelatorio` grouping skips ops with `relatorio_id == null`) and `apps/web/src/surfaces/relatorio/tree-actions.ts:308`.
   - The Story 4.6 AC lists `equipment` in the edited-since family.
   - Equipment ops are project scope with `relatorio_id: null` (`relatorio-ops.ts:30-31`). A rename batch (`putEquipmentTagOp` alone) never reaches `advanceOnEdit`.
   - A TAG change on an issued relatório therefore leaves it "Emitido", and its next document silently differs from the issued one.
   - Equipment creates are covered, because they travel with a relatório-scoped `block` create.
   - Either resolve the relatório(s) the equipment belongs to, or record the narrowing.

10. **Should-fix: the exclusions resync compares arrays by reference.** `setup-surface.tsx:334-338`.
    - `setup.exclusions !== committedExclusions.current` holds on every live-query refresh, because `relatorioState` rebuilds fresh objects from Dexie. Any other field's commit or a sync pull therefore resets the local list to the committed value.
    - With an in-progress, uncommitted exclusion edit, the text vanishes on screen. If the user keeps typing, the next `committer.change` is built on the reset array and the earlier characters are lost for good.
    - `useTextField` compares strings, so an unrelated refresh does not affect it.
    - Compare by content (for example a joined or JSON key), not by reference. The internal review's patch introduced this pattern while fixing the "no resync" finding.

11. **Should-fix: derived text composed in `apps/web`.** These belong in `packages/domain` or `pt-br.ts` (AGENTS.md "Where a new user-facing string goes"; AD-1).
    - `setup-surface.tsx:629`: the FR-16 rule (`< 1000` shows "< 1000 m", otherwise `${m} m`) is decided in the surface.
    - `setup-surface.tsx:672`: `aria-label="metros"` is a hardcoded pt-BR string outside the copy files.
    - `setup-surface.tsx:569`: the ` · ` join of the validity clause is composed inline.
    - A kernel `siteAltitudeText(m)`, used by both this page and Epic 5's Ambiente de ensaio, would keep the "< 1000 m" rule in one place.

12. **Nice-to-have: the section text header departs from `45-secao.html`.** `section-text-surface.tsx:154-156`.
    - The mock uses `<h2 class="sheet-title">Seção 2 — Definições</h2>`. The page renders `.section-text-title` "2 Definições".
    - The mock's two-part `.secao-note` ("Salvo automaticamente · 21/09 14:02 · Bruno" and "Texto simples; …") is merged into one sentence with no timestamp or author.

13. **Nice-to-have: dead copy.** `apps/web/src/copy/pt-br.ts`: `copy.setup.autosaveNote` and `copy.setup.backToSumario` have no caller. The setup surface uses `copy.common.back`, and the sticky bar has no autosave note.

14. **Nice-to-have: small accessibility and copy gaps.**
    - `setup-surface.tsx:654`: once the altitude is confirmed, the `<label htmlFor={altitudeId}>` points at an input that no longer exists.
    - `:480`: with `council === null`, the number field renders an empty `.field-label` and an empty value. The ART/TRT input's fallback label ("Número ART/TRT") does work: it has an accessible name, which verifies the internal review's patch.
    - `packages/domain/src/relatorio/setup-complete.ts:20`: the reason says "o número do ART/TRT" even when the council is known. `artOrTrtLabel` could name it.

15. **Nice-to-have: the "Início da execução" calendar glyph sits low at 1280 px.** `qa-epic-4-C/03-setup-etapas-1280-light.png`. The start `DateField` is a direct `.dates-3` grid child and stretches to the height of the end cell, which is taller because of its "Na capa" echo, so the absolutely placed icon drifts to the stretched box's bottom edge. Wrapping the start field like the end one, or `align-items: start`, fixes it.

16. **Nice-to-have: the Porto Seguro fixture carries `art_trt_number: null`.** `packages/domain/fixtures/porto-seguro/op-log.ts:208`. The golden document therefore still prints "—" in the document control's ART row, and the new `job.ts:221` wiring has no golden coverage with a real number. The delivered relatório has one, and the fixture is allowed to carry it (Decisions of record, 2026-09-21).

17. **Note: verified as claimed.**
    - The merged `sumario-surface.tsx` is additive over `origin/main`: banner, backward-move item and `ConfirmDialog` on top of 4.4/4.5's tree, palette and restore.
    - `latestRevision` has one export, from `print/revisions.ts`, used by the Sumário, `use-generate.ts` and `apps/api/src/http/generate.ts`.
    - `buildBatch` appends the status op before chaining (correct).
    - A batch that already carries `relatorio/status` is skipped, so backward moves and undo never double-advance.
    - Backward-move focus returns to the header Overflow trigger after Confirm, Cancelar and Escape (probe).
    - The chip is inserted by keyboard (Tab to the chip, then Enter), focus returns to the area, and Backspace removes the chip whole.
    - Tab order: Combobox, ART/TRT, the instrument checkboxes (Space toggles), altitude, date segments, justification, "Concluir".
    - `advanceOnEdit` never fires for non-edit families.
    - No emoji and no `laudo` in the added lines. No client material outside the Porto Seguro fixture.
    - Scoped unit tests pass in the tools container: web relatório, templates and `commit.test.ts` (12 files, 143 tests), plus the domain `relatorio` and `registration` suites.

18. **Note: the deferred "Restaurar" flush race** (spec frontmatter) is plausible as described and matches Story 3.6's pattern. It was not re-verified empirically in this pass.
