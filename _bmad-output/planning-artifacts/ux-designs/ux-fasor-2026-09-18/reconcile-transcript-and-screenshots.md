# Reconcile — Transcript & reference screenshots

Inputs: planning-meeting transcript (Bruno Matsui / Matheus Torres) and `docs/concorrentes/extract-fotos-whatsapp.md` (11 GroundPRO + Mesh screenshots). Checked against `DESIGN.md`, `EXPERIENCE.md`, `.memlog.md`.

## Captured

- "Tirar o computador do campo"; all engineers have tablets → EXPERIENCE › Foundation (tablet-first, phone-capable).
- Pre-printed sheets per equipment count ("imprimo 10 disjuntores") → Template composer with quantities; Flow 1.
- "Seleciona o código 2E e puxa tudo" → Instrument picker; Registries › Instruments.
- Add one-by-one vs predefine quantities; "faltou alguma coisa, incluo na hora" → Block Model; Block palette; Flow 3.
- draw.io drag mental model → Block Model (verbatim); Block card drag handle.
- Photo "nem que seja pequena" beside the sheet → DESIGN Photo tile 64px inline; EXPERIENCE Photo tile (same object in sheet and gallery).
- Caption + step-by-step gallery; "conforme imagem 5" → Caption composer; Capture-to-Document §7/§8 (auto numbering).
- Split work Bruno/Eduardo, memory loss after 15 days → Offline & Sync conflict rule; Flow 4; captions at capture. (Note: Flow 4 reverses the real roles — Bruno did photos, Eduardo the sheets.)
- Voltage classes 15/17,5/23 kV; manufacturer registry; "não quero a especificação técnica" → Registries (name-only Manufacturers).
- Nameplate photo with AI → Inspiration › Mesh (deferred, last in queue).
- Project → N laudos → Laudo setup pre-filled in office → IA › Project; Flow 1.
- "Vermelho preencho, preto é padrão" → Section blocks (fixed text + variables); equipment blocks pre-carry checklist and tests.
- GroundPRO: status dashboard, "Novo laudo", Rascunho encontrado → Recuperar, connection notice, client combobox, whole-field focus, inline calculated cells, user-controlled status, "Ver um exemplo" (Open Question) → Home; State Patterns; Combobox; DESIGN Colors › Focus; Measurement table; Status pill.
- Mesh: stepper, required-field counter, TAG, unit slot, sticky bar, CTA disabled until valid → Template composer; Progress counter; Sheet header; Measurement field; Sticky action bar; Button.
- Dark/green theme consciously not lifted → DESIGN Brand & Style; Inspiration.

## Dropped or weakened

1. **Report type as first-class concept.** Bruno: "tem que ter tipo — cabine, painel, SPDA". EXPERIENCE › Surface closure says multiple report types are "listed under Open Questions", but Open Questions never lists them, and Inspiration drops the type picker as "not lifted". Severity: medium (broken cross-reference; SaaS-ready model needs the slot). Fix: add an Open Question in EXPERIENCE.md and state that "Novo laudo" shows the single type "Cabine primária" pre-selected.
2. **"Importar do dispositivo" (local file portability).** Screenshot §4. Absent from both spines. Severity: low. Fix: list under Inspiration & Anti-patterns as not lifted (local-first sync replaces file export) or as an Open Question.
3. **Numbered step form.** memlog records "formulário multi-etapa" as admired; neither Laudo setup nor Equipment sheet is described as stepped sections, and Inspiration omits it. Severity: low. Fix: EXPERIENCE › IA › Laudo setup and Sheet header: numbered section bands; add to the GroundPRO lifted list.
4. **Paper fallback mode.** Matheus: "pode ter os dois modos"; Bruno rejected paper; brief puts handwritten-sheet OCR out of MVP. Spines silent. Severity: low. Fix: Inspiration & Anti-patterns › Rejected: paper-first / OCR, with the reason.
5. **Norm reference in labels.** Inspiration claims it was lifted (screenshot §7), but the spine only says acceptance values carry "a source noted" and admits ">400 MΩ has no known source". Severity: low. Fix: Measurement table header prints criterion + source field; Open Question "which norm item backs each criterion".

## Qualitative ideas not reflected

- Bruno: the old GroundPRO version was "mais legalzinha"; the update got worse (undetailed). No Open Question to ask what changed.
- Example placeholders in inputs ("Ex: -19.9167", screenshot §5) — no rule in Voice and Tone.
- Always-visible laudo-level summary (R1/F chips analogue): NC count / not-tested / sheets concluded in Laudo overview header — only per-sheet Progress counter and card progress exist.
- Billing delay pain ("tempo pra fazer o faturamento") — Flow 5 covers time-to-send, nothing on invoice-readiness; probably out of scope but unrecorded.
- Bruno answers the client on the spot from the phone (SPDA risk) — hints at a same-day on-site summary; unrecorded.

## Verdict

Every load-bearing wish, pain and admired pattern from the transcript and screenshots is adopted or consciously parked, with the field mental model (blocks, 2E, small photo beside the sheet, "conforme imagem 5") faithfully translated. Five items are weakened — the report-type Open Question is the one that must be fixed before the spines are frozen; the rest are one-line additions to Inspiration or Open Questions.
