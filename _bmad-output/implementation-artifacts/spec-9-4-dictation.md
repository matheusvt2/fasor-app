---
title: 'Story 9.4: Dictate a caption, an observation or a reading'
type: 'feature'
created: '2026-09-28'
status: 'in-review'
baseline_revision: '7c0cb90326aa2fa79b2f36d4e336a335e436e4e9'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'Epic 9 batch V: Story 9.4 whole in one batch (one engine interface, one kernel parser, six surfaces) per Conflict 9 of epic-9-context.md.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The engineer must type every caption, observation and reading that no chip covers (FR-40, UX-DR18). There is no speech code in the app; only the dictation tokens (`tokens.css:229`) and the `.dictation`, `.dictation-btn`, `.listening-word` rules (`components.css:232-246`) exist.

**Approach:** One speech engine interface in `apps/web` (`webspeech`, `fake`, `none`, picked by `VITE_SPEECH_ENGINE`, default `webspeech`), one Dictation button component, and one kernel utterance parser. A dictated result is component state drawn as a Suggestion field (never a suggestion row); confirming writes the same plain op the field writes when typed; typing discards it.

## Boundaries & Constraints

**Always:**
- Surfaces, in this order: (1) the import batch caption field (`capture-sheet.tsx`, mock `70-fotos.html:419`) and the Caption composer (`caption-composer.tsx`, mock `71-legenda.html:148-160`); (2) the checklist row observation (`60-ficha.html:384`, "Ditar observação do item N"), the sheet "Observações" section head (`60-ficha.html:745`, "Ditar observações") and the point-of-attention "Texto" (`72-pontos.html:196-201`, "Ditar o texto"); (3) each Measurement table title row (`60-ficha.html:516`, `.mt-actions` > `.dictation`).
- Markup verbatim from the mocks: `<span class="dictation"><button class="dictation-btn" aria-pressed aria-label=…><svg class="ico"><use href="/sprite.svg#i-mic"/></svg></button><span class="listening-word" aria-live="polite">Ouvindo…</span></span>`. The button is 48 px (the token), round, outlined; `aria-pressed="true"` while listening. Check `/sprite.svg` has `i-mic`; if not, add the symbol from the mock sprite.
- Hidden, not disabled (no element rendered), when the engine is `none`, the engine reports unavailable (no `SpeechRecognition`/`webkitSpeechRecognition`), or `useSession().online` is false. Going offline while listening aborts the session with no result. Chips and keyboard stay as they are.
- One listening session app-wide: starting one aborts any other. A second tap on the pressed button stops listening with no result.
- Prose fields show the result as the shared `SuggestionField` (`components/suggestion-field.tsx`, `confirmLabel` "Usar") right under the field, value = the transcript as heard (trimmed, first letter upper-cased by a kernel helper). "Usar" writes the field's existing plain op; any keystroke into that field, a new dictation or leaving the surface discards it; nothing is written before "Usar".
- Observation fields append, never overwrite: sheet observation through kernel `appendObservation` (`relatorio/ficha.ts:107`), checklist row through the chips' `insertPhrase` path at the end of the text, point text through the "Textos rápidos" insertion (`insertQuick`). Captions replace ("Digite ou fale para trocar", `70-fotos.html:421`): the batch caption's "Usar" sets the batch caption state (written with the photos by "Adicionar N fotos"); in the composer dictation shows only while "Editar texto" is on (mock CSS `71-legenda.html:46-56`), the text lands in the textarea, the `.caption-field` takes `data-state="suggested"` with the "Sugerido" pill and the `.dictated-note` " · o ditado entrou como sugestão — Salvar confirma"; "Salvar legenda" confirms, typing clears the suggested state.
- Tables: the kernel parses the transcript against that table; a parsed reading shows on its target cell as the Story 8.1 measurement Suggestion field (`nameplate-suggestions.tsx:320-360` pattern: `SuggestionField bare valueClassName="measurement-field"`, editable guess, "Confirmar"); "Confirmar" writes `testCellOp(... {raw, unit, state: 'measured'})` (`ficha-ops.ts`); a typed different value writes the typed value and drops the dictation. Unparsed speech (no row match, ambiguous row, no number, unit not in the cell's units, target row has no empty capture cell) becomes the sheet observation's dictation suggestion (lifted to a ficha-level context) and an announcement through `api.announce`.
- Every derived text is kernel: the table button's accessible name, the capitalized transcript, the parse and the target cell. Static copy in `copy/pt-br.ts` (surface labels, composer note) or `copy/ui.ts` ("Ouvindo…", "Usar", the unparsed announcement marked `// authored:`).

**Never:** a suggestion row or a server op for dictation; a new op family or `CONTRACT_VERSION` bump; overwriting a filled cell; a verdict or NC suggested; a disabled mic; audio or transcripts sent to the api; touching `job.ts`, `contract/ocr.ts`, `services/ocr` or the "Ler visor" button (batch D owns the title row's "Ler visor"; add only the `.mt-actions` wrapper and the dictation span); the conclusion text or parecer mics (`60-ficha.html:767`, `50-relatorio-setup.html:295`), which are outside Story 9.4; raising `PARALLEL_WORKERS`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Table, digits | "Fase A, 147 giga" on an insulation table (units MΩ/GΩ/TΩ) | row Fase A, first empty capture cell: raw "147", unit GΩ | none |
| Table, words | "fase b cento e quarenta e sete vírgula cinco mega" | Fase B: "147.5" MΩ | none |
| Table, no unit | "Fase C 52" | cell's shown unit (`EvaluatedCell.unit`) | none |
| Table, µΩ | "T1-T2, 145 micro" / "t1 t2 145 micro-ohms" | row T1-T2: 145 µΩ | none |
| Table, single row | "147" on the one-row TAP table | that row's first empty capture cell | none |
| Table, "mil" | "Fase A dois mil e quinhentos mega" | "2500" MΩ | none |
| Table, decimal comma | "Fase T, 120,1" / "120 vírgula 1" / "3.7 tera" | "120.1"; "3.7" TΩ | none |
| Unit not allowed | "Fase A 147 volts" on a GΩ table | unparsed | observation suggestion + announce |
| Ambiguous row | "Primário 147 giga" (two rows start with Primário) | unparsed | same |
| No row match / no number | "está chovendo" | unparsed | same |
| Row full | target row has no empty capture cell | unparsed, filled cell untouched | same |
| Offline / no engine | `context.setOffline(true)` or engine `none` | no `.dictation-btn` in the DOM | none |
| Engine error | recognition `error` event | button back to idle, no suggestion | announce authored "Não foi possível ouvir. Digite ou tente de novo." |

</intent-contract>

## Code Map

- `packages/domain/src/parse/pt-br-number.ts` -- `parseDecimalPtBr`, `canonicalDecimal`, `isInsulationFamily`, `INSULATION_UNITS`; reuse, do not change behavior.
- `packages/domain/src/parse/` -- new `utterance.ts` + `utterance.test.ts`; export through the package index (`packages/domain/src/index.ts`).
- `packages/domain/src/relatorio/readings.ts:49-97` -- `EvaluatedCell/Row/Table` (row `connection`, `label`, `cells` with `role`, `state`, `units`, `unit`, `address`); the parser works on these.
- `packages/domain/src/relatorio/ficha.ts:107` -- `appendObservation`.
- `packages/domain/src/seed/v1.ts:379-490` -- row labels to test against (Fase A..Reserva, T1..T5, T1-T2, Fase R/S/T, Primário/Secundário duplicates, the one-row TAP table with capture columns only).
- `apps/web/src/components/suggestion-field.tsx` -- shared Suggestion field (`confirmLabel`, `bare`, `valueClassName`).
- `apps/web/src/state/session.tsx:42,87` -- `online` flag.
- `apps/web/src/surfaces/photos/capture-sheet.tsx:402,455-477` -- batch caption textarea (local state, `onAdd`).
- `apps/web/src/surfaces/photos/caption-composer.tsx:108-218` -- `ComposerBody`, `editing`, `.caption-actions`.
- `apps/web/src/surfaces/ficha/checklist-section.tsx:236-360` -- row observation (`useTypedText`, `insert`/`insertPhrase`, `.row-expand`).
- `apps/web/src/surfaces/ficha/conclusao-section.tsx:176-330` -- sheet observation textarea and its existing Story 12.4 suggested state (keep it; the dictation suggestion is a separate `SuggestionField` under the field).
- `apps/web/src/surfaces/points/point-editor.tsx:188-356` -- point "Texto" contenteditable (`useSectionTextArea`, `insertQuick`), mock head `.poa-text-head` (`72-pontos.html:45`, page CSS goes to surface CSS).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:143-205` -- `MeasurementTable`, `.mt-title-row`; `measurement-field.tsx` -- `MeasurementField` (`useNumberInput`, `testCellOp`).
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` -- host for the ficha-level sheet-observation dictation context.
- `apps/web/package.json:8` -- `build:e2e`; `docker-compose.yml:101-106` -- web service env; `.env.example`.
- `e2e/gallery.spec.ts` (import batch and composer flows, `photo-import-input`), `e2e/support/photos.ts` (`openChaveSheet`, `devicePhotos`), `e2e/support/outbox.ts` (`readStore`), `e2e/export.spec.ts:208` (`context.setOffline`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/parse/utterance.ts` -- add and export: `parseSpokenNumberPtBr(text: string): string | null` (digits in pt-BR forms via `parseDecimalPtBr`, cardinal words zero..novecentos e noventa e nove mil…, "um/uma", "dois/duas", "catorze/quatorze", "cem/cento", "e" joiner, "vírgula"/"ponto" decimal with digit-by-digit or cardinal fraction, returns canonical dot-decimal); `parseSpokenUnit(word: string, units: readonly string[]): string | null | 'invalid'` (giga/gigaohm(s)/"giga ohm"/g → GΩ, mega → MΩ, tera → TΩ, micro/microohm(s)/µΩ → µΩ, mili/miliohm → mΩ, volt(s)/V → V, quilovolt(s)/kV → kV, ampère(s)/A → A; null when no unit word, 'invalid' when the unit is not in `units`); `parseTableUtterance(transcript: string, table: EvaluatedTable): TableDictation` where `TableDictation = { kind: 'cell'; address: CellAddress; raw: string; unit: string | null } | { kind: 'unparsed'; text: string }` (normalize: lower case, strip accents and punctuation, hyphens to spaces, drop the word "fase"; head = words before the first number; a row matches when the head equals a word prefix of its joined connection cells or equals one connection cell; exactly one matching row, or an empty head on a one-row table; target = the row's first capture cell with `state === 'empty'`; no unit spoken → that cell's `unit`); `dictatedText(transcript: string): string` (trim, collapse spaces, first letter upper-case); `tableDictationLabel(table: EvaluatedTable): string` ("Ditar leitura — ex.: “Fase A, 147 giga”": first row label + a sample by the first capture cell's unit family: GΩ "147 giga", MΩ "147 mega", TΩ "3 tera", µΩ "145 micro", else "120 vírgula 1"). -- kernel owns parse and derived text.
- `packages/domain/src/parse/utterance.test.ts` -- every I/O matrix row plus number-word coverage (0-20, tens, hundreds incl. "cem"/"cento e um", "mil", "dois mil e quinhentos", feminine forms, decimals by "vírgula" and comma, mixed "147 vírgula cinco") and each seed table family.
- `apps/web/src/speech/engine.ts` -- the interface below, `createSpeechEngine(name)`, `speechEngineName()` reading `import.meta.env.VITE_SPEECH_ENGINE` (unset → `webspeech`, unknown → `none`), a React context `SpeechEngineProvider`/`useSpeechEngine` mounted at the app root.
- `apps/web/src/speech/webspeech-engine.ts` -- `SpeechRecognition ?? webkitSpeechRecognition`, `lang = 'pt-BR'`, `interimResults = false`, `continuous = false`, `maxAlternatives = 1`; abort on signal; `no-speech`/`aborted` → none, other errors → error.
- `apps/web/src/speech/fake-engine.ts` -- test engine: available unless `globalThis.__FAKE_SPEECH__?.available === false`; while listening waits for `window.__fakeSpeech.say(text)` / `.fail()`; exposes `window.__fakeSpeech.listening`.
- `apps/web/src/speech/dictation.tsx` -- `useDictation()` (one session app-wide, online gate, abort on offline/unmount) and `DictationButton({label, onResult})` rendering the mock markup or null.
- `apps/web/src/speech/*.test.ts(x)` -- engine selection, webspeech with a stubbed constructor, hidden when `none`/unavailable/offline, pressed state, abort.
- `apps/web/src/surfaces/photos/capture-sheet.tsx`, `caption-composer.tsx` -- surface (1) as in Always.
- `apps/web/src/surfaces/ficha/checklist-section.tsx`, `conclusao-section.tsx`, `ficha-surface.tsx`, `apps/web/src/surfaces/points/point-editor.tsx` (+ surface CSS for `.poa-text-head`) -- surface (2).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx`, `measurement-field.tsx` -- surface (3): `.mt-actions` in the title row with `DictationButton label={tableDictationLabel(table)}`; the pending `TableDictation` held by `MeasurementTable`, passed to the target cell.
- `apps/web/src/copy/pt-br.ts`, `apps/web/src/copy/ui.ts` -- copy per the three homes.
- `apps/web/package.json` -- `build:e2e` sets `VITE_SPEECH_ENGINE=fake`; `docker-compose.yml` web env `VITE_SPEECH_ENGINE: ${VITE_SPEECH_ENGINE:-webspeech}`; `.env.example` documents it.
- `e2e/support/speech.ts` -- `speak(page, text)`, `failSpeech(page)`, `disableSpeech(context|page)` (addInitScript setting `__FAKE_SPEECH__ = {available: false}`).
- `e2e/dictation.spec.ts` -- specs listed in the ACs; each asserts the committed store/outbox state after reload (`readStore`, `devicePhotos`), not only the screen.

**Acceptance Criteria:**
- `@p0` Given the gallery import batch at 390 px with "Geral" chosen, when the engineer taps "Ditar a legenda", then the button is 48x48 px with `aria-pressed="true"` and "Ouvindo…" is visible; when the fake engine says "detalhe da limpeza dos cubículos", then a Suggestion field shows "Detalhe da limpeza dos cubículos" with "Usar" and the caption textarea is unchanged; when "Usar" then "Adicionar 2 fotos" are tapped and the page reloads, then both photo rows in IndexedDB carry that caption.
- `@p0` Given a seccionadora sheet with signal, when the engineer taps the contato fechado table's mic and says "Fase A, 147 giga", then the Fase A cell shows 147 GΩ as a Suggestion (amber, "Sugerido", "Confirmar") and the store has no value; when "Confirmar" is tapped and the page reloads, then the block's `sheet.tests` cell holds raw "147", unit "GΩ", state measured.
- `@p0` Given the same table, when the engine says "está chovendo muito", then no cell changes and the "Observações" section shows "Está chovendo muito" as a Suggestion with "Usar"; when "Usar" is tapped and the page reloads, then `sheet.observations` holds the text (appended after any existing text).
- `@p0` Given any dictation surface, when the context goes offline, then no `.dictation-btn` is in the DOM while the chips and fields remain; when back online, the button returns; given `__FAKE_SPEECH__.available === false`, no button renders.
- `@p1` Given the Caption composer with "Editar texto" on, when dictation arrives, then the textarea holds it, the field shows "Sugerido" and the dictated note; "Salvar legenda" then reload stores the caption; with "Editar texto" off no mic is shown.
- `@p1` Given an NC checklist row, when "Ditar observação do item N" yields text and "Usar" is tapped, then after reload the item observation holds it; given a pending dictation, when a key is typed into that observation, then the Suggestion disappears and only the typed text is committed.
- `@p1` Given the point editor, when "Ditar o texto" yields text and "Usar" is tapped, then after "Concluir" and reload the point text contains it.
- `@p1` Given a filled cell's row, when the utterance targets it, then the filled cell is unchanged and the speech goes to the observation suggestion; given a second tap on a pressed mic, listening stops with no suggestion.

## Spec Change Log

## Review Triage Log

### 2026-09-28 — Review pass
Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter, Intent Alignment (token economy; the integrated epic review covers them).
- verdicts: 15 findings — high 0, medium 5, low 9, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` Digit-by-digit "um quatro sete" sums to 12 (`parseWhole` has no magnitude order) — parts now accepted only in descending place order; unit tests added.
  - `[low]` `[patch]` `tableDictationLabel` uses an ambiguous first-row label ("Primário") the parser refuses — first row with a unique label, else the sample alone; unit test added.
  - `[medium]` `[patch]` "Usar" on the sheet observation drops the Story 12.4 suggested NC lines shown in the field — appends to the text the field shows.
  - `[low]` `[reject]` Dictated text already contained in the observation: "Usar" writes nothing with no feedback — rare, and the fix adds a branch and copy.
  - `[low]` `[reject]` Enter on an unchanged dictated cell does not confirm — deliberate: only the explicit "Confirmar" writes a heard value (nothing unconfirmed is written); an edited value commits on Enter.
  - `[low]` `[reject]` "Confirmar" silent when `api.author` is null or the commit rejects — same as the existing `MeasurementField.write`; not reachable in a signed-in sheet.
  - `[low]` `[reject]` A pending dictated reading whose target is filled by sync stays hidden and returns if the cell is cleared — rare two-device sequence; fix adds an effect.
  - `[medium]` `[patch]` Microphone permission denied (`not-allowed`) keeps the mic visible and every tap errors — the webspeech engine remembers it and reports unavailable; unit test added.
  - `[low]` `[reject]` Switching a row between NC and not NC while listening remounts the button and aborts the session — rare; the engineer taps again.
  - `[maybe-false]` `[reject]` Row names spoken with "e" ("primário e secundário") unparsed — no seed row is named that way; would only be low.
  - `[medium]` `[patch]` Claim check: the sheet observation "appends, never overwrites" is false while the 12.4 lines show — same root cause as the third row, same fix.
  - `[medium]` `[patch]` Gap: the Observações-off branch of unparsed table speech has no test — Vitest added.
  - `[medium]` `[patch]` Gap: the typed-override write of a dictated reading is covered only by a `@p1` e2e — Vitest for `DictatedMeasurementField` added; the composer, row and point wiring stay `@p1` and run in `test:e2e:full` before the PR.
  - `[low]` `[reject]` The `dictation-announcer` keeps its last message until the next session — a live region is not re-read; harmless.
  - `[low]` `[reject]` The thrown `recognition.start()` branch is untested — a two-line defensive catch.

## Design Notes

Engine interface (the cross-batch contract):

```ts
export type SpeechEngineName = 'webspeech' | 'fake' | 'none';
export type SpeechResult = { kind: 'text'; text: string } | { kind: 'none' } | { kind: 'error'; reason: string };
export interface SpeechEngine {
  readonly name: SpeechEngineName;
  available(): boolean;
  /** One utterance in pt-BR; resolves when heard, stopped (none) or failed. Aborting the signal resolves `none`. */
  listen(signal: AbortSignal): Promise<SpeechResult>;
}
```

Open questions (listed, not decided): (Q1) `webspeech` sends audio to the browser vendor's service (Google on Chrome) with no consent text in the POC; Matheus confirms before it defaults on in production. (Q2) Observations append and captions replace (mock copy "fale para trocar"); another choice is Matheus's. (Q3) Unparsed table speech with the Observações sub-block disabled only announces.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/parse apps/web/src/speech` -- green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/dictation.spec.ts --project=desktop-chrome` (after `build:e2e`, or through `pnpm test:e2e -- e2e/dictation.spec.ts`) -- green.
- `flock /tmp/fasor-verify.lock docker compose --profile tools run --rm tools pnpm verify` and `pnpm test:e2e:full` under the lock -- green.
