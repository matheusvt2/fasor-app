---
title: "Releng PRD — Addendum"
status: final
created: 2026-09-19
updated: 2026-09-21
---

# Addendum to the Releng PRD

Depth that is load-bearing downstream but does not belong in the PRD's narrative: decisions handed to architecture, alternatives considered and rejected with their reasons, sizing data, and domain detail an implementer will need but a requirements reader will not.

## 1. Handed to architecture

Any number the UX spines give for these is a suggestion, not a requirement.

**Storage and offline**
- The offline vehicle (PWA with a service worker, or otherwise) and the sync trigger.
- Local storage engine and the autosave debounce interval.
- **iPadOS Safari storage eviction — named an explicit risk.** Safari evicts script-writable storage after seven days without use unless the app is installed to the home screen, and does not honor `persist()`; background sync runs only while the tab is foregrounded. This is the single largest technical unknown in the product: **photo-safe offline capture must be proven before anything else is built on it.**
- Storage-low threshold and its detection mechanism.
- Maximum offline age before photos must be uploaded; how many active laudos one device holds.
- Photo compression, maximum resolution, and whether originals are retained after generation.

**Sync and merge**
- Conflict detection mechanism (base revision against version vectors) and where unresolved versions live.
- Upload concurrency and resumable upload.
- Registry deduplication across devices — "Schneider" and "SCHNEIDER" must converge to one entry with every sheet still pointing at it.
- Offline download of other devices' photos: full size or thumbnails.

**AI and capture**
- Provider for LLM vision and OCR, **cost per reading**, and the OCR text-layer grounding check that FR-37 depends on.
- Dictation engine: browser Web Speech against backend transcription, and offline pt-BR availability.
- Geolocation to altitude resolution; photo-stamp coordinate source and precision.

**Document generation**
- Server-side against client-side generation; the table-of-contents and "Página X de Y" engine; the PDF renderer.
- How watermark and logo render in DOCX as well as PDF.
- The template engine for the generated conclusion text and the parecer summary.
- Export time tolerance for a 124-page document with about 82 photographs.
- Template snapshot against versioned reference.

**Platform and session**
- The UI system. Design tokens must map onto it without changing hex values or sizes.
- Whether to bundle the Inter typeface for offline use or accept the fallback stack.
- Session token lifetime and offline re-authentication; user provisioning, seeding and password reset.
- Retention and purge of removed-block data and past revisions.
- Timezone and locale handling for timestamps and photo ordering.

## 2. Alternatives considered and rejected

- **Scan and OCR the filled A4 sheets.** Proposed by the builder, rejected by the design partner on principle: *"A ideia era não fazer no papel. Eu já queria fazer direto na ferramenta."* When pressed for a dual mode he conceded only *"Pode acontecer"* and returned to the mobile-first answer. Paper is dropped, not digitized.
- **Look up equipment specifications by serial number from public sources.** Proposed by the builder. Corrected by the partner: what varies is voltage and insulation, and what is needed is a registry of standard values plus the manufacturer, not a specification database.
- **Build an internal tool for Fasor first, with no SaaS structure** (market research R1). Declined: the MVP is built as a SaaS-ready data model from the start.
- **Subscribe to Mesh Labs and reproduce a real Fasor report on it before freezing scope** (competitive research R1). Declined, to keep the product's design independent. Recorded as a divergence; it means the competitive gap analysis was never tested hands-on.
- **Keep AI capture out of the MVP** (market R5, competitive R5). Reversed on the afternoon of 2026-09-18 by an explicit user mandate making camera capture and inference the center of the flow. The queue was also inverted: report generation still ships first, but the assists now precede other polish.
- **PDF after the MVP.** The brief placed PDF right after the MVP; the UX work pulled it in, so DOCX and PDF now ship together as one revision. Digital signature stayed out.
- **An editable DOCX as the round-trip format.** Rejected: the DOCX is for reading, printing and last-mile edits, but corrections flow back through the app and regenerate. There is no upload-a-revised-DOCX path, because the PDF must never be a conversion of a hand-edited DOCX.
- **"Leave a low-confidence value blank rather than guess."** The brief states this three times, once as a stance: *silence over a guess*. **Narrowed, not kept.** A field with a known shape — a nameplate field, a measurement cell — now shows its best guess flagged Verificar, because an editable guess costs a glance and a blank costs typing, and the flag makes the uncertainty visible. Free prose keeps the original rule absolutely: a caption or an observation is never guessed, because a plausible wrong sentence in a signed report is not visibly wrong. PRD FR-41 carries the rule; this is the record that it changed.
- **Names considered and dropped:** Voltlog (taken), Voltlaudo, Laudovolt, Subelog, Religa, Laudo Pronto, Isola, Laudex, Neutro. "Releng" collides in search with *release engineering*; domain, INPI and store availability were never checked.

## 3. Sizing data from the reference job

Porto Seguro, Torres A and B, 6–8 September 2026.

| Quantity | Value |
| --- | --- |
| Pages in the delivered document | 124 (index runs to printed page 119) |
| Embedded equipment sheets | 94, all as EMF pictures pasted from Excel |
| Photographs | about 82 in section 7, plus cover and certificates |
| Photo captions | 82 captions numbered 01–76, with two numbers repeated four times each — manual numbering had already broken |
| Section 9 subsections | 11, by location and equipment family |
| Sheets per subsection | 4 to 14 |
| Words | 3,663 |
| Equipment sheet distribution | 25 seccionadoras · 21 disjuntores · 11 TP · 11 TC · 8 transformadores · 4 cabos de entrada · 9 cabos de saída · 5 para-raios |
| Checklist items | 5 (cabos, para-raios) · 14 (seccionadora) · 15 (disjuntor) · 15 (TP, TC, transformador — one shared list) |
| Nameplate fields | 0 (cabos) · 6 (para-raio) · 9 (seccionadora) · 12 (disjuntor, TP, TC, transformador) |
| Estimated AI volume per job | about 94 plates · about 1,100 display shots · about 82 captions |
| Days on site | 3, over a holiday weekend |
| Write-up lag today | about 15 days after the work |

**Defects found in the delivered sample, which are evidence for requirements:**
- Every C/NC/NA cell across all 94 sheets is blank. The report was delivered unfinished.
- Contact resistance values of 251, 281, 279, 297 and 303 µΩ are recorded against a printed criterion of `< 250 µΩ` with no NC and no Reprovado. The manual process does not evaluate its own thresholds — the basis for FR-27 and FR-28.
- All eight Transformador de força sheets are cropped after the ratio table and carry **no observations and no conclusion block**. FR-22 restores it.
- Two different column orders for the C/NC/NA block coexist in the same document: 55 sheets use `ÍTEM | C | NC | NA | OBSERVAÇÕES`, 36 use `ÍTEM | OBSERVAÇÕES | C | NC | NA`.
- The `TAG:` field is present on subsoil and generator switchgear sheets and absent on the Enel cubicle ones.
- Section 6 declares applicable checks for **Relé de Proteção** and for **Cubículos, QGBT's e Quadros de Distribuição**, and section 3 puts the protection relay in scope — yet neither has a sheet among the 94. Section 8 explains the QGBT gap (the client refused de-energization); nothing explains the relay gap.
- Section 10 states that tests were performed and results were positive, while section 8 records that several disconnectors and the TIE breaker could not be tested.

The design partner's own belief that *"os ensaios e os itens de verificação são sempre os mesmos… o que muda é o quantitativo"* is mostly true but not entirely: **the template is less uniform than he believes.**

## 4. Instrument header values from the reference job

Near-constant across 85 or more sheets — exactly what FR-3 replaces with a code selection.

| Test | Instrument | Type | Serial | Certificate | Parameter | Criterion |
| --- | --- | --- | --- | --- | --- | --- |
| Isolação | Megôhmetro digital / Instrument | DMG10Ki | IN919021-25945 | 37428/26 | 10 kV | `> 400 MΩ` |
| Resistência de contato | Micro-ohmmeter / Hi-Tech | HTMO-10 | G282926 | 37276/26 | 10 A | `< 250 µΩ` |
| Relação de transformação | Transformer Ratiometer | HTRT-8K | F277226 | 37274/26 | — | `± 0,5 %` |

The `> 400 MΩ` figure **has no traceable source**. For comparison, NETA MTS-2019 asks 5,000 MΩ at 2.5 kV DC for 15 kV insulation, and CPFL releases energization above 30 MΩ — two orders of magnitude apart. Hard-coding any of them would break the multi-company story; FR-5 stores the criterion with its source instead, and the seeded value declares its source honestly as "aceitável na ficha".

## 5. Competitive detail

| Product | Platform | Price | Covers | Gaps |
| --- | --- | --- | --- | --- |
| **Mesh Labs** (launched Sept 2026) | Android phone only | R$ 1,397/year for the suite | Same 6 equipment groupings; nameplate AI; offline; consolidated report as PDF and DOCX with logos, on its own fixed template; instrument and serial recorded | Table of contents **announced as next**; no C/NC/NA; no NR-10 framing; no action plan with deadlines; **declares it does not record calibration** (module "Equipa" on the roadmap); Android only; also sells competing engineering services |
| **Minipa Link** | iPad and Android | from R$ 60/month | "Same-day final report", PDF only | No ART, no calibration, no MV equipment sheets; near-zero traction (10+ Android downloads, 0 iOS ratings) |
| **GroundPRO** (Elétrica Academy) | Web | — | SPDA and grounding: offline field report **with calibration and an adequacy schedule at immediate/30/90/180 days with owners**, Word and PDF | Does not cover cabine primária. If it extends, it occupies Releng's strongest gap |
| **Inspekio** (GoStart Lab) | pre-launch | — | Near-identical pitch: "offline de verdade", "sem Word" | Unknown |
| **Status quo** | Word and Excel | R$ 49.90 for a template pack, or free | — | The real incumbent. Releng must save visible time, not merely organize better |

**Gaps no competitor covers, in order of defensibility:** (1) the provider's own layout with a table of contents, sheets and photo record; (2) points of attention with photo, corrective action, deadline and owner **on the cabine**; (3) C/NC/NA visual inspection across the whole substation including equipment outside the competitor's six types; (4) calibration certificate and validity recorded in the system; (5) tablet and iPad as the primary platform; (6) not competing with the customer.

**A competitor category the product research found and the competitor table misses: "the dev from the group".** Engineer-developers selling report generators directly inside engineering WhatsApp groups. One such tool won roughly six users from a single group off one testimonial, and its users are the design partner's own peers. It is the only competitor already inside Fasor's network, it has no website to analyze, and it prices by conversation.

**Channel, and the one product constraint it imposes.** Peer trust is the go-to-market instinct here — Mesh sells through a 43,700-subscriber training school, GroundPRO through the same, and "the dev from the group" through the group itself. Releng has **no audience of its own**, which is a real strategic weakness, and its only plausible channel is referral between providers. That has one design consequence worth carrying into the product: **it must be demonstrable and shareable inside a group chat** — a short path from a link to something a skeptical engineer recognizes as their own report. Nothing in the PRD's FRs expresses this, which is exactly why it is recorded here.

**Revalidation dates for everything in this section.** The competitive claims underpinning PRD §2 were gathered on 2026-09-18 from public evidence only, and the upstream research attached expiry dates to them. The "short windows" argument in PRD §2 is unreadable without these:

| Date | What to re-check |
| --- | --- |
| 2026-10-01 | GroundPRO "Checklists Online", announced without a date |
| 2026-11-01 | Mesh Labs terms of service and its Bluetooth integration |
| 2026-12-01 | Prices and feature sets of Mesh, Minipa and GroundPRO — the main agenda of the next refresh — **and NR-10 itself** |
| 2027-03-01 | Mesh Labs traction |
| before 2027-06-01 | NR-10 again, immediately before the new text takes effect |

**The strategic read:** Mesh, GroundPRO and Minipa already do offline capture with photos, and two advertise reading instruments over Bluetooth — one of those integrations is disputed and the other covers only low-voltage meters, not MV instruments. **Sync reliability has become a qualifying threshold rather than a differentiator.** What is left to differentiate on is the final document — and two of those gaps have explicitly short windows.

Category price anchors, for the SaaS decision that is not being made yet: Mesh R$ 1,397/year; Minipa R$ 0/60/120/180 per month; Tecniko R$ 59.90; Field Control R$ 525 for four licenses; Online OS R$ 899.99; SafetyCulture US$ 24–29 per seat; Word template packs R$ 49.90. An inferred R$ 100–300/month for a vertical SaaS is low-confidence and should not be planned against. CAC and churn benchmarks in the research come from a single source with no methodology; the research itself says not to plan with them.

## 6. Domain detail not encoded in the MVP

Kept because the first post-MVP additions will need it, and because it explains several deferrals in §7.2 of the PRD.

- **Grounding measurement** is the fall-of-potential method with its curve, not a single number: geometry and rod distances, curve points, the plateau value, soil condition wet or dry, the limit applied **and the source of that limit**, plus continuity. CPFL requires ≤ 10 Ω in wet soil and ≤ 25 Ω in dry. NBR 5419:2015 already removed the 10 Ω figure, which had been only a recommendation in the 2005 edition.
- **Relay 50/51 testing**: pickup and dropout, two curve points, manufacturer tolerance, and breaker trip verified by each relay. Bases cited: NR-10 item 10.12.7 (from 2027-06-01), NBR 14039 item 8.2.2.4, and public tender specifications. EDP seals relays and forbids changing their settings without prior authorization; Cemig may require field verification of the settings the responsible engineer set.
- **Temperature correction** of insulation values to 20 °C uses NETA table 100.14 and needs an insulation-type field. Both raw and corrected values should be stored.
- **History-relative criteria** that the stable TAG makes possible later: winding resistance within 2% of the previous visit, polarization index against history, breaker operation counter before and after, and the trend analysis NETA expects. Roughly half the domain's real criteria are relative, not absolute.
- **As-found and as-left** are two values of one measurement, not two measurements: the breaker operation counter before and after, relay settings found and left, and tests taken before cleaning.
- **Oil and DGA** arrive from an external laboratory after the field work. Cemig requires an oil report less than six months old to re-energize after more than six months out of service. This is why the PRD excludes laboratory results from SM-1 and why a future "awaiting laboratory result" state plus re-issue as a new revision is the right shape.
- **Thermography** is performed energized, before the shutdown, and appears in every public tender read. Narratively it belongs **before** the de-energization block.
- **Concessionaire variation** worth a registry later: grounding limit with its soil condition, minimum notice for a planned shutdown (CPFL 15 days, EDP 5 working days), what is sealed, and the insulation threshold for energization (CPFL > 30 MΩ at 15 kV, > 50 MΩ at 25 and 34.5 kV).
- **Periodicity is nobody's constant.** No norm fixes it; CPFL makes the consumer declare it; the responsible professional decides. Never encode "annual" anywhere. The field that carries this is "next recommended intervention" with a date and the professional's justification, which then feeds the 10.7.11 schedule.

## 7. Verbatim quotes worth keeping

The requirements above were derived from these; they are the evidence a reviewer may want to check.

- *"eu preencho duas vezes, uma em campo fazendo, e depois eu trago essas informações pro computador"* — the core problem.
- *"Eu quero tirar o computador do campo."* — stated twice, unprompted. The platform constraint.
- *"o tempo pra mandar pro cliente, o tempo pra fazer o faturamento, isso me atrasa muito."* — delivery gates billing.
- *"O Eduardo preencheu a parte dos relatórios… já tem 15 dias que a gente fez o trampo… você sai anotando no papel de pão."* — the context-decay problem.
- *"os que estão em vermelho é o que eu preencho na mão, o que está em preto é o que é padrão sempre"* — the block model, in his own words.
- *"Quero inserir uma chave seccionadora, clico lá, ele já insere a seccionadora… Só preenche o número de série e o resultado dos ensaios."* — FR-22.
- *"A gente só tem dois equipamentos desse aqui… Seleciona o código 2E e ele já puxa todos os dados."* — FR-3.
- *"Aí vem o ponto de atenção… com o número da foto. Conforme imagem 5, verificou-se uma possível fuga de tensão na múfula XYZ."* — FR-48, FR-49.
- *"Putz, faltou alguma coisa. Eu incluo na hora? Eu consigo incluir na hora?"* — FR-18.
- *"Para o projeto Ambev, você vai lá no Ambev, você pode ter N relatórios."* — FR-15.
- *"Tem que ter vários tipos, pra cabine, pra painel elétrico, pra SPDA."* — the data-model-only decision.
- *"na hora que o cara terminou o trampo, o relatório já tá pronto, véi."* — SM-1, in his own framing.
- *"como se fosse um draw.io com objetos prontos em que o usuário pode adicionar ou remover"* — the block model metaphor.
- *"a gente quer fazer um negócio mais top"* — the bar. A floor, not a target.
- The mandate, 2026-09-18: *"Como é algo a ser usado no campo, quanto mais inteligente for, melhor. Quero que o usuário digite o menos possível — aqui a usabilidade do usuário é chave!"*

## 8. Contradictions in the source material

Flagged so a reader does not rediscover them as bugs.

- **Does he take a laptop to the field?** Within thirty seconds: *"Eu levo o computador para a obra… Hoje eu fico"* and then *"Eu quero tirar o computador do campo."* Present state against target state.
- **Are photos and test sheets related?** *"Está relacionado, é que neste relatório aqui de cabine a gente não faz assim. Eu gostaria de fazer"* — asserted and retracted in one sentence. Resolution: conceptually related, structurally unlinked today, and he wants them linked.
- **Report types.** *"Não, tipo de relatório vai ter que ter tipo"* — the "Não" is a verbal tic, not a negation.
- **Template-first against form-first authoring.** He started preferring incremental (*"ser mais tipo um formulário mesmo"*) and settled three minutes later on both.
- **"IA" against OCR.** He calls the competitor's nameplate feature AI; the builder called it simple OCR; both describe the same capability.
- **Page count.** He said "120 alguma coisa… Não, fechou. 24." The document metadata settles it at 124.
- **Both video transcripts are empty** — 33.7 seconds each, no speech recorded, despite source files of 13.2 MB and 7.9 MB. Either the recordings are silent screen captures or transcription failed. **No claim in the PRD is sourced to them**; the WhatsApp screenshots are the usable record of that content.

## 9. Seed data specification for the eight equipment block types

PRD FR-22 gives counts; this is the content. Labels are verbatim from FO.SERV-03 and stay in Portuguese, because they are what prints. The full sheet-by-sheet extraction, including the 94 individual sheets, is in `.working/extract-raw-sources.md` §2, which is the print specification for generated section 9.

**A discrepancy to resolve before seeding.** The UX spines' field counts and the counts obtained by decoding the actual sheets do not agree: para-raio 6 against 5 decoded, seccionadora 9 against 10, disjuntor 12 against 13, TC 12 against 14. The decoded document wins on evidence; the counts in PRD FR-22 follow the spines. Reconcile against the source before writing the seed, and correct whichever is wrong.

### 9.1 Nameplate field lists (`DADOS DO EQUIPAMENTO`)

| Type | Fields, verbatim |
| --- | --- |
| Cabos de entrada / de saída / de alimentação TRn | none — the sheet opens at the checklist |
| Para-raio | `FABRICAÇÃO` · `Nº SÉRIE` · `TIPO` · `TENSÃO NOMINAL` (kV) · `CORRENTE NOMINAL` (kA) |
| Chave seccionadora | `IDENTIFICAÇÃO` · `FABRICAÇÃO` · `Nº SÉRIE` · `TAG` · `TIPO` · `MEIO DE EXTINÇÃO` · `TENSÃO DE PLACA` (kV) · `CORRENTE NOMINAL` (A) · `ACIONAMENTO` · `DATA DE FABRICAÇÃO` |
| Disjuntor MT | `IDENTIFICAÇÃO` · `FABRICAÇÃO` · `Nº SÉRIE` · `TAG` · `TIPO` · `MEIO DE EXTINÇÃO` · `VOL. ÓLEO` · `CORRENTE NOMINAL` (A) · `CAPACIDADE INTERRUPTOR` (kA) · `DATA DE FABRICAÇÃO` · `TENSÃO NOMINAL` (kV) · `AJ. BOBINA` · `AJ. RELÉ 50/51` |
| TP | `IDENTIFICAÇÃO` · `FABRICAÇÃO` · `Nº SÉRIE` · `TIPO` · `TIPO DE ISOLAÇÃO` · `VOL. ÓLEO` · `POTÊNCIA NOMINAL` (VA) · `TAP ATUAL` · `DATA FABRICAÇÃO` · `TENSÃO NOMINAL AT` (kV) · `TENSÃO NOMINAL BT` (V) · `LIGAÇÃO SECUNDÁRIA` |
| TC | the TP list plus `RELAÇÃO` (e.g. 500/5) and `EXATIDÃO` (e.g. 10P20) |
| Transformador de força | the TP list, with `POTÊNCIA NOMINAL` in kVA and `TIPO DE ISOLAÇÃO` taking values such as `Á SECO` |

The substation header sheet `CARACTERÍSTICAS DA SE` is not an equipment type but the cabine block (PRD FR-24): `TIPO DE SE` as a select from `SIMPLIFICADA - POSTE` · `ALVENARIA - CONVENCIONAL` · `BLINDADA`; `TENSÃO PRIMÁRIA`; `TENSÃO SECUNDÁRIA`; `POTÊNCIA INSTALADA`; then `AMBIENTE DE ENSAIO` with `ALTITUDE`, `TEMPERATURA` and `UMIDADE RELATIVA DO AR`.

### 9.2 Checklist item lists (`VERIFICAÇÕES GERAIS`)

Five distinct lists across eight types.

- **Cabos (5):** `LIMPEZA` · `MUFLA` · `CONEXÕES` · `ATERRAMENTO CORDOALHAS` · `FIXAÇÃO`
- **Para-raio (5):** `LIMPEZA` · `ISOLADOR` · `CONTADOR DE OPERAÇÃO` · `ATERRAMENTO` · `CONEXÕES`
- **Chave seccionadora (14):** `ABERTURA E FECHAMENTO MANUAL` · `ABERTURA E FECHAMENTO ELÉTRICO` · `MECANISMO DE ACIONAMENTO` · `INTERTRAVAMENTO ELÉTRICO` · `INTERTRAVAMENTO MECÂNICO` · `ISOLADORES` · `CONEXÕES` · `CONTATOS` · `MOTOR` · `FUSÍVEIS` · `ATERRAMENTO` · `SIMULTANEIDADE` · `PINTURA, CORROSÃO` · `LIMPEZA E LUBRIFICAÇÃO`
- **Disjuntor MT (15):** `LIMPEZA E LUBRIFICAÇÃO` · `ABERTURA E FECHAMENTO ELÉTRICO/REMOTO` · `ABERTURA E FECHAMENTO MECÂNICO` · `BOBINAS` · `CARREGAMENTO MANUAL DE MOLAS` · `INDICADOR DE POSIÇÃO` · `CÂMARA DE EXTINÇÃO` · `CONTATOS MÓVEL E FIXO` · `ISOLADORES` · `CABOS DE CONTROLE` · `LÂMPADAS DE SINALIZAÇÃO` · `CONTATOS AUXILIARES` · `CONDIÇÃO GERAL DOS MECANISMOS` · `RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM.` · `ÓLEO ISOLANTE/INDICADOR DE NÍVEL`
- **TP, TC and Transformador de força share one list (15):** `LIMPEZA` · `VÁLVULA DE ALÍVIO` · `ELEMENTO SECANTE` · `JUNTAS, VEDAÇÕES E VAZAMENTOS` · `INDICADOR NÍVEL DE ÓLEO` · `VENTILADORES` · `REGISTROS, RADIADORES` · `RELÉ DE GÁS, FUNCIONAMENTO` · `CORROSÃO, PINTURA, VIBRAÇÕES` · `ATERRAMENTO` · `BUCHAS PRIMÁRIA/SECUNDÁRIAS` · `TERMÔMETRO` · `ÓLEO ISOLANTE/INDICADOR DE NÍVEL` · `CONEXÕES` · `RELÉ DE TEMPERATURA EXTERNO`

Dry-type equipment inherits the oil-filled items and marks them NA in practice — the case PRD FR-11's subtype defaults exist for.

Two column orders coexist in the source and must be normalized to one: `ÍTEM | C | NC | NA | OBSERVAÇÕES` on 55 sheets, `ÍTEM | OBSERVAÇÕES | C | NC | NA` on 36.

### 9.3 Measurement table grammar

**Insulation, single-table form** — the three-column connection triple is the part PRD §4's shorthand "phases against massa" loses:

```
PONTO DE ENSAIO/CONEXÃO        | VALORES (MΩ | GΩ)                        | QUALIDADE ISOLAÇÃO
LINHA | TERRA | GUARD          | 30 SEGUNDOS | 1 MINUTO | ESTAB./10MIN    | ABSORÇÃO | POLARIZAÇÃO
```

Row sets: cables and para-raios use `FASE A/B/C/RESERVA` against `MASSA` or `MASSA/BLIND.`; TP and TC use `FASE R/S/T` against `MASSA`; the transformer rotates the guard across `PRIMÁRIO | MASSA | SECUNDÁRIO`, `PRIMÁRIO | SECUNDÁRIO | MASSA`, `SECUNDÁRIO | MASSA | PRIMÁRIO`. In practice only the `1 MINUTO` column is filled and the rest print `-` — PRD FR-27's not-measured state.

**Insulation, open and closed contact** — seccionadoras and disjuntores, two tables side by side:

```
⟨SECCIONADORA|DISJUNTOR⟩ CONTATO ABERTO   |  ⟨…⟩ CONTATO FECHADO
LINHA | TERRA | GUARD | VALORES (GΩ)      |  LINHA | TERRA | GUARD | VALORES (GΩ)
T1    | T2    | MASSA |                   |  FASE A | MASSA |       |
T3    | T4    | MASSA |                   |  FASE B | MASSA |       |
T5    | T6    | MASSA |                   |  FASE C | MASSA |       |
```

**Contact resistance:** rows `T1-T2 | FASE A | MASSA`, `T3-T4 | FASE B | MASSA`, `T5-T6 | FASE C | MASSA`, values in µΩ, criterion printed in the block header.

**Transformation ratio, three variants:**
- TP: `TP's | V PRIMÁRIO | V SECUNDÁRIO | VAL CALCULADO | H1-H2 / X1-X2 | CONDIÇÕES`, rows `FASE R/S/T`.
- TC: `TPS | A PRIMÁRIO | A SECUNDÁRIO | VAL CALCULADO | P1-P2 / S1-S2 | CONDIÇÕES`, rows `FASE R/S/T`.
- Transformer: `TAP Nº | V PRIMÁRIO | V SECUNDÁRIO | VAL CALCULADO | H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0 | CONDIÇÕES`.

`VAL CALCULADO` is computed from the nameplate, not typed. The verdict word printed in `CONDIÇÕES` is `SATISFATÓRIO`.

### 9.4 Conclusion block

Every sheet ends with a two-axis selection, verbatim: `APROVADO` | `REPROVADO` crossed with `SEM RESTRIÇÕES` | `COM RESTRIÇÕES (ver observações)`. The parenthetical is why the sheet-level `OBSERVAÇÕES` free-text block must exist and must be filled when the restriction axis is set — the design partner's *"aprovado, reprovado e o porquê"*.

### 9.5 Section boilerplate

Sections 1, 2, 3, 4, 5, 6 and 10 are fixed text with a small number of variables, reproduced verbatim in `.working/extract-raw-sources.md` §1.4 to §1.13. Notable content the seed must carry: section 2's seven definitions, section 4's five requirement blocks (Documentação, EPC's, EPI's, Equipamentos de Ensaio, Ferramentas e Materiais), section 5's quoted NR-10 10.5.1 six-step sequence **and** its nine-item re-energization checklist, section 6's eight-type catalogue of applicable checks, and section 10's three fixed conclusion bullets. The cover's `DADOS DO CLIENTE` table rows are `Cliente`, `Cidade/local`, `Data da execução do serviço`, `Informações adicionais`, `Responsável`.
