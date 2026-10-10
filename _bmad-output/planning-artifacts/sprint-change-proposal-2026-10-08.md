# Sprint change proposal: locations without colunas, the site checklist and office-created equipment types (2026-10-08)

Prepared in the correct-course workflow at Matheus's request. Mode: batch (Matheus, 2026-10-08). Matheus approved the three-delivery direction ("siga"), the revocations of section 4.3 and the order "Epic 14 now, the Epic 13 carry-over in parallel" on 2026-10-08.

## 1. Issue summary

On 2026-10-08 Bruno, who owns the FO.SERV-03 relatório, sent three WhatsApp voice notes. They were transcribed in the session and answered a written question list.

- **Site checklist.** Every room ("cada sala") must carry a fixed set of site verifications, whoever provides the item (the client or the team): emergency lighting, grounded doors, fire extinguisher, EPI, EPC, vara de manobra, detector de tensão. Today these appear only as fixed boilerplate in sections 4 and 5 (`seed/sections-v1.ts:88-96, 126`), with nothing marked C/NC/NA. Emergency lighting and grounded doors appear nowhere.
- **Equipment the base lacks.** Equipment the seed does not have keeps turning up, job by job. Bruno's next job, on Saturday 2026-10-10, has a chave ASCO (an automatic transfer switch). Bruno: "vai dependendo conforme for surgindo [...] a gente tenta cadastrar". The office must be able to create a new type by copying an existing one; "técnico de campo só preenche".
- **Locations without colunas.** Masonry rooms ("alvenaria") hold equipment directly, with no coluna. A transformation room may hold only two or four transformers. Bruno asked for "Adicionar local" instead of "Adicionar cabine", and to add equipment directly to a local. The domain already allows a block on a cabine node (AD-6; `apps/web/src/surfaces/templates/template-composer-palette.test.tsx:171`). The composer does not make this discoverable: the cabine card shows "0 blocos · Nenhum equipamento" and the palette asks to "Selecione uma cabine ou coluna".

**Answers recorded with Bruno (2026-10-08):**

| Question | Answer |
| --- | --- |
| The 19-item list in section 4.1 | Approved as sent ("acredito que tenha") |
| Per room or per coluna | Per local (room). Never repeated per coluna |
| Print position | A table inside each cabine in section 9, after AMBIENTE DE ENSAIO, printed once |
| An NC item offers "Criar ponto de atenção" | Yes |
| A fusível sheet | Dropped: fuses get only a visual check, which the existing `fusiveis` checklist rows cover |
| No-break | The **no-break de comando** that feeds the protection relay or the MT breaker in the colunas is in scope. The building-wide UPS stays out |
| Other equipment | Not known in advance. They emerge per job (the chave ASCO is the first) |
| Who creates a type | The office only. The field technician fills sheets |

**Category:** a new requirement from the stakeholder, plus one requirement misunderstood. The two-level Cabine › Coluna wording in `EXPERIENCE.md` line 94 says "the second level is always the column". AD-6 never enforced that.

**Evidence:**
- The three audio transcripts and the question list. They are not stored: client voice material stays out of the repository. Their content is summarized in the table above.
- Competitor material in `docs/concorrentes/` and `research/competitive-laudos-cabine-primaria-2026-09-18/`, plus a web survey on 2026-10-08.
- Norm research on 2026-10-08: NBR 14039:2005 §§ 5.7.1, 9.1.9-9.1.12, 9.2.1-9.2.2, 9.3.2.5; NR-10 2004/2019 and Portaria MTE 737/2026; the cabine primária norms of three distribuidoras (Cemig ND-5.3, Enel, Celesc N-321.0002); IT 37/2025 of the Corpo de Bombeiros; NBR 10898:2023.

**What the research found:**
- No Brazilian medium-voltage competitor offers user-created equipment types or a per-room checklist. Both features are ahead of the market, not catch-up.
- Products that let users define types or forms converge on five patterns:
  1. Clone a library type, then edit it.
  2. Build from typed blocks with a small criteria vocabulary (between, at least, at most).
  3. Draft, then publish an immutable version; each record is pinned to its version; a type is retired, never deleted.
  4. A location is inspected by the same engine as an asset.
  5. A failed item becomes a finding.
- The one desktop test-data manager with a free form editor is described by its own users as needing "someone familiar with SQL databases and custom form design". That argues for composing only from blocks the kernel already has.

## 2. Impact analysis

**Epics.**
- No merged story is reopened. Epic 13 is accepted with open items, and its carry-over items (E13-A2, A4, A6) go to the next carry-over batch in parallel, as already decided.
- A new **Epic 14** carries all three deliveries.
- The Epic 3 composer (Story 3.4), the Epic 4 tree, the Epic 5 "Da cabine" block, the Epic 6 points and the Epic 7 renderer are extended, not rewritten.

**Stories.** These are new stories 14.1 to 14.7 (section 4.4). Story 13.9 stays deferred under E13-A9.

**Artifacts.**

| Artifact | Conflict |
| --- | --- |
| `SPEC.md` | Scope rule (line 140); "criteria and checklist items have no editing surface in the MVP" (line 146); non-goal "criteria or checklist editing surfaces" (line 171); CAP-12 "Eight equipment block types"; CAP-8 "cabines and columns" |
| `source-deltas.md` | Row "`prd.md` Q6 and the FR-5 assumption: Closed: no criteria or checklist editing before the first real job" |
| `ARCHITECTURE-SPINE.md` | AD-6 (two levels, cabine data fields), AD-21 (eight types in code, `getDefinition(seed_version, report_type, block_type)`), AD-3 (path families), AD-15 (snapshot content), AD-26 (point fields) |
| `EXPERIENCE.md` | Block Model › Location ("the second level is always the column"); "The 8 equipment block types"; Template composer |
| `glossary.md` | Location |
| Mockups | `42-template-composer.html`, `40-relatorio-overview.html` (tree), `60-ficha.html` ("Da cabine"), `41-templates.html` (a list of types), plus a new type-editor screen |

**Technical.**
- **Local wording:** copy and UX only.
- **Site checklist:**
  - kernel: seed v4 site items, a location checklist map and op family, `applyOp`, merge, `cabineProgress`, pre-issue, a point `location_id`, location item photos;
  - web: a site checklist surface reusing the checklist row;
  - api: a section 9 print part.
- **Office-created types** cut across the kernel:
  - opening the three closed enums (`blockTypeSchema`, `ITEM_KEYS`, `testDefSchema.key`);
  - a definition resolver that takes company context, used at about 45 call sites including `applyOp` on both sides;
  - a registry kind, an op family and a contract bump;
  - type versions in the snapshot;
  - a generic measurement-table grammar and criteria vocabulary;
  - a print group for added types (today an unknown type falls into Seccionadoras, `print/group-for-print.ts:170-174`);
  - the conclusion and caption nouns.
- No cloud dependency and no paid API in any of it.

## 3. Recommended approach

**Direct adjustment.** Add Epic 14 in three waves, with no rollback and no MVP reduction.

| Wave | Stories | Effort | Risk |
| --- | --- | --- | --- |
| 0 | 14.1, the mocks for the whole epic | about 1 day | Low |
| 1 | 14.2 Local wording and direct add; 14.3 site checklist capture; 14.4 site checklist in the document | about 3 days | Medium: the print layout has no FO.SERV-03 source table, so Bruno approves it on the mock |
| 2 | 14.5 types as company data (kernel); 14.6 type editor; 14.7 office types in templates, the field and the document | about 6-8 days | High: AD-21 amendment, byte-equal replay (AD-3), criteria with no sourced edition, pt-BR agreement in composed text |

Wave 2 starts only after the architecture amendment of section 4.3 is settled with `bmad-architecture`, as Story 14.5's Definition of Ready.

**Timeline.** The chave ASCO of 2026-10-10 cannot be served by the app: wave 2 is weeks, not days. For that job Bruno records it outside the sheets, as a point of attention with its photos or in a Word annex. Section 6 tells him so.

**Alternatives considered:**
- **Ship each new type as a seed version in code** (fusível, no-break, chave ASCO, ...). This keeps AD-21 untouched. Rejected as the main path: Bruno's "vai surgindo" means a developer story per type, per job, forever. Kept as the fallback if the AD-21 amendment fails review.
- **Put the site checklist on a fake equipment block attached to the cabine.** Cheaper, because it reuses the checklist ops and NC points. Rejected: it drags a TAG, a mandatory conclusion, a ficha count and a section 9 sheet title onto something that is not equipment.
- **A free form builder.** Rejected on the competitor evidence above, and because AD-2 requires every verdict and text to come from one kernel function.

## 4. Detailed change proposals (applied in this change)

### 4.1 The site checklist, as approved by Bruno

The items print in this order, grouped. Labels are authored (pt-BR) and were approved by Bruno on 2026-10-08. Each item records C · NC · NA, an observation and photos.

| Group | Item |
| --- | --- |
| Segurança e EPC no local | Luvas isolantes compatíveis com a tensão, com ensaio dielétrico válido |
| | Tapete ou estrado isolante |
| | Vara de manobra com ensaio dielétrico válido |
| | Detector de tensão |
| | Conjunto de aterramento temporário |
| | EPI disponível |
| | Dispositivos de bloqueio e cartões de impedimento |
| Combate a incêndio | Extintor de incêndio carregado, lacrado, dentro da validade, sinalizado e desobstruído |
| | Bacia de contenção de óleo |
| Iluminação | Iluminação normal |
| | Iluminação de emergência (autonomia mínima de 2 h) |
| Aterramento | Portas, telas e grades aterradas |
| | Pontos para aterramento temporário |
| Sinalização e documentação | Placas de advertência na porta e nas grades |
| | Diagrama unifilar atualizado no local |
| | Circuitos e equipamentos identificados |
| Ambiente | Porta abrindo para fora, com fechadura |
| | Ventilação |
| | Limpeza e ausência de infiltração |

**Notes:**
- The distribuidoras disagree on the extinguisher. Cemig asks for PQS ABC outside the room, Celesc for CO2 inside, and the Bombeiros' IT 37 for both. So the row takes type, charge and validity in its observation and fixes no answer.
- The NC chip phrases (3-4 per item, `seed/schema.ts:44-49`) are authored at seed time and reviewed by Bruno, like the equipment chips (SPEC Assumptions).

### 4.2 Decisions of record (`source-deltas.md`, rows dated 2026-10-08)

| Companion says | Decision of record |
| --- | --- |
| `prd.md` Q6 and the FR-5 assumption: "Closed: no criteria or checklist editing before the first real job" | ~~struck~~. Office users create equipment types by copying a seeded or company type and editing it: nameplate fields, checklist items, tests from the kernel's grammars, criteria from a fixed vocabulary. Field users fill sheets only, by convention (roles stay out of scope, SPEC Assumptions). The seeded types and their sourced criteria stay read-only |
| `SPEC.md` Constraints "Scope rule. The MVP covers what FO.SERV-03 covers" | Two additions outside FO.SERV-03 are in scope at its owner's request: the site checklist per location and office-created equipment types. The rule still holds for everything else |
| `SPEC.md` CAP-12 "Eight equipment block types" | The eight seeded types stay as they are. Company types are added beside them, as versioned company data (Epic 14) |
| `EXPERIENCE.md` Block Model › Location "the second level is always the column"; composer "Adicionar cabine" | The coluna is optional: a location may hold equipment directly. ~~On screen a root location is a **local** ("Adicionar local"), and a local with no coluna offers "Adicionar equipamento". Whether the printed relatório also says "local" instead of "cabine" is open with Bruno: the document keeps "cabine" until he answers~~ A cabine with no coluna offers "Adicionar equipamento". *(2026-10-09: cabine and local are two concepts; see § 7.1)* |
| A fusível sheet (proposed 2026-10-08) | Dropped. Fuses get a visual check through the existing `fusiveis` rows |
| `seed/sections-v1.ts:77` section 3 exclusion "Painéis e transformadores de rede estabilizada (nobreak)" | The no-break de comando (relay or MT breaker supply in the colunas) is in scope as an equipment type. The building-wide UPS stays excluded. Whether the section 3 sentence needs rewording is open with Bruno |

### 4.3 Architecture (`ARCHITECTURE-SPINE.md`, dated notes)

**AD-6 (applied now, wave 1).**
- A location row of `kind = cabine` gains `checklist?: Record<SiteItemKey, {result, observation}>`, written only through the new family `location/{id}/checklist/{itemKey}/{result|observation}`. Like `se` and `env`, it is valid only on a cabine.
- The site item list resolves through the relatório's seed version (seed v4 and later).
- A photo of a site item is a `file` with `location_id` and `item_key`.
- A point gains an optional `location_id`.
- The family list is append-only, so this is a contract bump.
- "The UI renders two levels" now means one or two levels: equipment may sit on the root node, as it already may.

**AD-21 (proposed, settled before Story 14.5 by `bmad-architecture`).** The direction recorded here, for the architect to confirm or replace:
- A company equipment type is a registry row `{id, company_id, label, tag_prefix, noun: {singular, plural, gender}, derived_from?: {seed_version, block_type} | {type_id, version}, versions: [...]}`.
- Each published version is immutable and carries the same definition shape as a seed block (`blockDefinitionSchema`): nameplate `FieldDef[]`, checklist items, tests, conclusion.
- A Block references a company type as `block_type = "company:{type_id}"` plus `type_version`, beside `seed_version`.
- `getDefinition` takes a resolver context holding the company's published type versions, which both sides load before replay.
- The generate snapshot (AD-15) carries every type version it prints.
- A version used by any block can never change. "Aposentar" hides a type from palettes and keeps it resolvable.
- New tests may use the existing four grammars or the new generic **measurement table**: named rows, unit, value and one criterion each.
- Company criteria use a fixed vocabulary (`>=`, `<=`, `between`, `±`, plus `pass_fail`) and must name their source. A free-text source "critério do escritório" is allowed and prints as such.
- **Risks to settle:**
  - byte-equal replay when a definition depends on company rows (AD-3, AD-24 company-first order);
  - the 45 resolver call sites;
  - print order and the group title of added types: proposed as one group "Outros equipamentos" after Transformadores, in the template's type order.

### 4.4 Epics and stories (`epics.md`)

A new "Epic 14" in the Epic List and as a full section, with seven stories:

| Story | What it does |
| --- | --- |
| 14.1 | The mocks |
| 14.2 | Local wording and direct add |
| 14.3 | Site checklist capture |
| 14.4 | Site checklist in the document |
| 14.5 | Types as company data (kernel) |
| 14.6 | The type editor |
| 14.7 | Office types in templates, the field and the document; the no-break de comando as the end-to-end case |

Each story has a Dev model line, Given/When/Then criteria citing the new SPEC capabilities CAP-27 and CAP-28 and the existing FR/UX-DR, and a Definition of Ready addition where one applies.

### 4.5 Other edits applied

| Artifact | Edit |
| --- | --- |
| `SPEC.md` | Dated strikes on the scope rule, the criteria constraint and the non-goal; CAP-8 and CAP-12 amended; new CAP-27 (site checklist per location) and CAP-28 (office-created equipment types) |
| `EXPERIENCE.md` | Dated strikes and additions in Block Model › Location and the 8-types paragraph |
| `glossary.md` | Location (optional coluna, "local" on screen); new entries "Verificações do local" and "Tipo do escritório" |
| `sprint-status.yaml` | `epic-14: backlog` and its seven stories |
| `docs/kbs/` | The matching concepts and `log.md` |

## 5. Implementation handoff

**Scope: major.** It amends an architecture decision and the SPEC's scope rule.

| Who | Responsibility |
| --- | --- |
| UX (`bmad-ux`) | Story 14.1: the mocks, approved by Matheus and shown to Bruno before 14.2 to 14.4 start |
| Architect (`bmad-architecture`) | Settle the AD-21, AD-3 and AD-15 amendments of section 4.3 before Story 14.5 |
| Developer (`bmad-build`) | Stories 14.2 to 14.7, each on the model of its Dev model line, under the 2026-10-08 story gate |
| Matheus, with Bruno | The open items in section 6 |

**Success criteria:**
1. A local with no coluna gets its equipment in the composer and in the field in one tap from the local, and nobody needs a coluna for it.
2. Every local of a relatório on seed v4 or later carries the 19 site items; the document prints them once per local after AMBIENTE DE ENSAIO; an NC item becomes a point of attention in one tap.
3. The office creates the no-break de comando from a copy, publishes it, places it in a template, and a field user fills it offline; it prints in section 9. A relatório created before a type edit is untouched by it.

## 6. Open items

**With Bruno:**
1. The no-break de comando: nameplate fields, what is checked, what is measured, and the acceptance limits. This is Story 14.7's Definition of Ready. The research proposes a starting list:
   - nameplate: fabricante, modelo, nº de série, potência VA, tensão de entrada e saída, forma de onda, by-pass, and for the battery: tipo, quantidade, tensão, Ah, data;
   - measurements: tensão de entrada e saída, tensão por bateria, autonomia em falta de rede;
   - checks: alarmes, by-pass, ventilação, reaperto.
2. The chave ASCO: the same questions, for its first type after 14.7. For 2026-10-10 it is recorded outside the sheets.
3. Whether the printed relatório says "local" instead of "cabine".
4. Whether the section 3 exclusion sentence on the no-break is reworded.
5. The NC chip phrases of the 19 site items, reviewed with the seed v4 story (14.3).

**With Matheus:**
1. Confirm the Story 14.1 mocks before wave 1 starts.
2. Schedule the `bmad-architecture` pass before wave 2.

## Checklist record

| Section | Status |
| --- | --- |
| 1 Trigger and context | Done: stakeholder audio, transcripts in session, evidence above |
| 2 Epic impact | Done: no epic invalidated; new Epic 14; Epic 13 carry-over in parallel |
| 3 Artifact conflicts | Done: SPEC, source-deltas, spine (AD-3, AD-6, AD-15, AD-21, AD-26), EXPERIENCE, glossary, mocks |
| 3.4 Other artifacts | Done: no infra, deploy or cost impact; tests per story under the story gate; KB updated |
| 4 Path forward | Done: direct adjustment, three waves; fallback is seed versions in code |
| 5 Proposal components | Done |
| 6 Approval | Matheus approved the direction, the revocations and the order on 2026-10-08; sprint-status updated |

## 7. Follow-up of 2026-10-09: cabine and local, the no-break de comando and the chave ASCO

Matheus asked on 2026-10-09 to re-read the structure audio and to research both new types on the web. Nothing in this section is decided; each part waits for Bruno.

### 7.1 Cabine and local are two concepts

The re-transcription of Bruno's 17:17 voice note, with timestamps, says it at 0:36-0:44: "em vez de ser adicionar cabine, pode ser cabine, e a gente coloca o local dela, porque às vezes eu tenho a cabine de entrada, cabine primária, a cabine de transformação, de distribuição". At 0:29 he adds: "eu vou pensar em outra estrutura pra te mandar".

- **The cabine is what the room is**, by its function: entrada, primária (proteção), transformação, distribuição. FO.SERV-03 already uses this: its § 1 scope reads "Cabines Primárias de Proteção, Distribuição e Transformação" (`imports/extract-fo-serv-03.md:51`).
- **The local is where the cabine sits.** The reference job names its root nodes by place: Cubículo Enel, 1° Subsolo, Oxigênio, Cobertura A and B, Geradores (`seed/template.ts:116-168`).
- **"Quando é alvenaria, não tem coluna" matches TIPO DE SE.** That field already exists on the cabine: SIMPLIFICADA - POSTE, ALVENARIA - CONVENCIONAL or BLINDADA (`extract-fo-serv-03.md:129`). The Cubículo Enel is BLINDADA with colunas. Oxigênio and the Coberturas are ALVENARIA.

The 2026-10-08 decision "on screen a root location is a local" is struck in every document, and the structure waits for Bruno. Two candidate structures:

| | A: cabine with Função and Local (recommended) | B: Local › Cabine › Coluna |
| --- | --- | --- |
| Tree | Cabine (Função, Local, TIPO DE SE) › Coluna (optional) › equipment | Local › Cabine › Coluna (optional) › equipment |
| Card | "Cabine de transformação · 1° Subsolo" | "1° Subsolo" holding "Cabine de transformação" |
| Site checklist | Per cabine, which is one room | Per local, shared by its cabines |
| Cost | Two fields on the cabine (like `se`), print and copy | A third UI level, print grouping, AD-6 depth |
| Fits when | Each room is one cabine. Bruno: "cada sala, que hoje a gente coloca como cabine" | One room holds several cabines (for example entrada and primária in the same room) |

**The question for Bruno:** can one room hold more than one cabine? If not, A. If yes, B.

### 7.2 The no-break de comando: proposed sheet

Web research of 2026-10-09 read the norm PDFs of Cemig, Enel, CPFL, EDP, Equatorial, Light and Celesc; Copel was found only as a 2013 copy. Also read: manufacturer data (NHS, Intelbras, CSB, Moura) and summaries of IEEE 1188.

The common root is **NBR 14039 § 5.3.4.1**:
- a microprocessor relay needs a reserve supply with **at least 2 h of autonomy**;
- the trip coil needs a dedicated source, preferably capacitive.

The distribuidoras differ:

| Distribuidora | What it requires |
| --- | --- |
| Cemig ND-5.3 | Nobreak of **≥600 VA**, **senoidal**, **2 h at ≥20 W / 30 VA**, 0-40 °C. Comutação TP→nobreak or automatic by-pass. Fed by a dedicated thermomagnetic breaker, no fuse. Kept in the sealed relay box. Trip capacitivo **as well** (4.12.13-4.12.14, 9.1.5.6-9.1.5.8, 9.1.9.3-9.1.9.4) |
| EDP | Nobreak of ≥1000 VA |
| CPFL | Function 27-0 supervises the reserve |
| Light | **Forbids the nobreak**: battery bank with charger in Vcc |
| Celesc, Copel | Two capacitive sources, the trip source good for two openings in a row |

Because of these differences, Bruno may prefer a generic type, **"Fonte auxiliar da proteção"**, with subtypes nobreak, fonte capacitiva and retificador + banco Vcc.

No norm sets the nobreak's output tolerance, transfer time or alarm contacts; those values come from the manufacturer. NBR 15204 is cancelled.

**DADOS DE PLACA**

- **No-break:** fabricante, modelo, nº de série, potência nominal (VA), potência ativa (W), tensão de entrada (V) e faixa, tensão de saída (V), frequência (Hz), forma de onda, topologia (standby / interativa / online), by-pass (automático / manual / não possui), tensão CC das baterias (V), faixa de temperatura (°C), data de instalação.
- **Baterias:** fabricante, modelo, tipo (VRLA-AGM / gel / ventilada), quantidade, tensão por bloco (V), capacidade (Ah, C20/C10), data de fabricação, data de instalação, vida útil de projeto (anos), resistência interna de referência (mΩ).
- **Instalação:** origem da alimentação (TP de proteção / secundário do trafo), esquema (comutação externa / by-pass interno), cargas alimentadas, trip capacitivo (sim/não).

**VERIFICAÇÕES** (C · NC · NA)

1. Placas legíveis
2. Em caixa lacrável junto ao relé, LED visível pelo visor (Cemig 9.1.9.3-4)
3. Ventilação desobstruída, temperatura 0-40 °C (Cemig 4.12.13)
4. Limpeza
5. Conexões de entrada, saída e bateria reapertadas
6. Alimentação por disjuntor termomagnético dedicado, sem fusível (Cemig 4.12.14.2)
7. Comutação TP→nobreak ou by-pass automático operante (Cemig 4.12.14)
8. LEDs e display sem falha
9. Alarme ou supervisão 27-0 da fonte reserva operante (Enel ET 2386 7.3 d, CPFL 6.5.1.3 b)
10. Apenas cargas da proteção conectadas
11. Aterramento da carcaça e da caixa
12. Baterias sem estufamento, trinca, vazamento ou corrosão
13. Idade da bateria dentro da vida útil (3-5 anos, fabricante)
14. Trip capacitivo presente e com circuito de teste (Cemig 9.1.5.8)

**ENSAIOS**

| Ensaio | Rows | Columns | Criterion |
| --- | --- | --- | --- |
| E1 Modo rede | Tensão de entrada, tensão de saída, frequência | Unid., medido | Manufacturer's range and the relay's auxiliary range |
| E2 Modo bateria | Tensão de saída, frequência, forma de onda, relé permaneceu energizado | Unid., medido | Output ±3% (manufacturer); senoidal (Cemig); "Sim" |
| E3 Flutuação | Bloco 1 … n, total | V, T amb | 13.5-13.8 V per 12 V block at 25 °C, −3.5 mV/°C per cell; ≤2.5% from the bank average (Moura) |
| E4 Resistência interna | Bloco 1 … n | mΩ medido, mΩ referência, Δ% | ≤+20% OK; above +20% investigate; about +50% replace (practice, Fluke and Megger; IEEE 1188 leaves the limit to the user) |
| E5 Autonomia | One row | Carga (W/VA), início, fim, tempo, V final | **≥2 h at ≥20 W / 30 VA** (NBR 14039, Cemig 4.12.13) |
| E6 Funcional | Disjuntor abriu só com o nobreak; trip capacitivo | Resultado | Abriu (Cemig 3.3.1 e); 2 aberturas seguidas (Celesc, Copel) |

**Questions for Bruno:**
1. Which distribuidoras do the clients connect to? This decides the VA floor, whether the type is "no-break" or a generic "Fonte auxiliar da proteção", and whether Light-style battery banks or capacitive sources appear.
2. Is the 2 h autonomy test run in full on site? The alternative is a short discharge plus the ohmic trend.
3. Is the battery replaced by fixed age or by capacity and ohmic criteria? If by criteria: what instrument, and where does the reference come from?

### 7.3 The chave ASCO: proposed sheet

**What it is.** In Brazil, "chave ASCO" names an ASCO (Schneider) automatic transfer switch, the CTA or chave de transferência automática. It transfers the load between the utility and the generator.
- It is usually **low voltage**: Series 300 and 7000, 115-600 V, 30-4000 A. It sits downstream of the cabine's transformer, between QGBT-Normal, QGBT-Emergência and the generator room.
- An MV version exists: ASCO 7000 MV, 5-15 kV, a metal-clad cubicle with vacuum breakers.
- The Brazilian norm is ABNT NBR IEC 60947-6-1:2015.

**Sources.** The ASCO manuals are primary and were read. The NETA MTS § 7.22.3 content is second-hand, from a public VA specification and a practitioner guide, because the NETA text is paid. NFPA 70B chapter 39 is a draft of the next edition.

**DADOS DE PLACA:** fabricante, série (300 / 4000 / 7000 / 185), tipo (ATS / retardada / transição fechada / bypass-isolation), nº de catálogo, nº de série, BOM, ano, tensão nominal (V), corrente nominal (A), frequência (Hz), nº de polos, neutro (sólido / chaveado / sobreposto), transição (aberta / retardada / fechada), WCR (kA @ V) e proteção a montante, controlador e firmware, invólucro (NEMA/IP), torque dos terminais (N·m).

**VERIFICAÇÕES** (C · NC · NA)

1. Placa confere com o projeto
2. Invólucro, fixação e aterramento
3. Tampas e barreiras fixadas, aviso de transferência manual presente
4. Limpeza interna, aspirada, sem soprar
5. Contatos principais e de arco sem pites ou superaquecimento
6. Reaperto da potência ao torque da etiqueta
7. Reaperto da fiação de controle e dos plugues do chicote
8. Lubrificação com o kit do fabricante
9. Operação manual com alavanca, fontes desenergizadas
10. Intertravamento mecânico e elétrico N/E
11. Rotação de fases da Emergência igual à da Normal
12. Indicação de posição, LEDs e alarmes
13. Registro de eventos e nº de transferências revisados
14. Exercitador do gerador programado
15. Aquecedor e ventilação, se houver
16. Gerador deixado em AUTOMÁTICO ao final

Sources for the list: ASCO manuals (items 4-6, 8, 9, 11, 16), NETA 7.22.3 (items 1-3, 9, 10), NFPA 70B ch. 39 (items 12, 13, 15); the rest is practice.

**ENSAIOS**

| Ensaio | Rows | Columns | Criterion | Grammar |
| --- | --- | --- | --- | --- |
| E1 Resistência de contato | Polo A, B, C, N | Lado Normal µΩ, Lado Emergência µΩ | ≤50% above the lowest of the same side (NETA, second-hand); trend | Seeded contact-resistance grammar, two sets |
| E2 Isolamento principal, 1000 Vcc, 1 min | A-T, B-T, C-T, A-B, B-C, C-A, linha-carga | MΩ with Normal closed, Emergência closed, open | ≥100 MΩ for 600 V class (NETA Table 100.1, second-hand) | Seeded insulation grammar |
| E3 Isolamento do controle | Fiação × terra | MΩ | ≥2 MΩ (NETA, second-hand); disconnect the controller harness first (ASCO) | Seeded insulation grammar, one row |
| E4 Ajustes do controlador | Pickup and dropout of V and f, Normal and Emergência; TD 1C, 2B, 3A, 2E; exercitador | Fábrica, projeto, encontrado, deixado, C/NC | Deixado = projeto; factory values as reference (Group 5: Normal 85/90%, Emergência 75/90%, f 90/95%, TD 1C 1 s, TD 3A 30 min, TD 2E 5 min) | New measurement table |
| E5 Tempos de transferência | Falha da Normal até partida; até carga na Emergência; retransferência; resfriamento; falha da Emergência; falta de cada fase | Ajuste (s), medido (s), C/NC | Measured matches setting, tolerance to be set; ≤10 s to load if NFPA 110 Level 1 applies | New measurement table |
| E6 Termografia sob carga | Terminais N, E, Carga × fase | °C, ΔT vs similar, ΔT vs ambiente, classe | NETA Table 100.18 (second-hand): ΔT similar >15 °C or ambiente >40 °C, repair at once | New measurement table |

**Questions for Bruno:**
1. LV or MV? Which voltage, and how many poles?
2. Open, delayed or closed transition, and is there a bypass-isolation?
3. Is the real mains-failure test with the generator taking load in scope and authorized? It interrupts the load unless the transition is closed. Are times measured with an instrument or read from the controller log, and with what tolerance?

### 7.4 What the two drafts mean for Story 14.5

Both sheets fit the AD-21 direction of § 4.3, but the generic measurement table must cover more than named rows with one value. The 14.5 architecture pass takes these as requirements:

1. **Rows the field user adds:** battery blocks 1 … n, whose count is known only on site.
2. **Several value columns per row:** fábrica, projeto, encontrado, deixado; or Normal and Emergência sides.
3. **A derived column against a reference typed on the sheet:** Δ% of internal resistance against the reference mΩ.
4. **Yes/no and text results judged pass or fail:** "relé permaneceu energizado", "forma de onda: senoidal".
5. **A criterion relative to other cells:** ≤50% above the lowest pole, ≤2.5% from the bank average.
6. **A criterion relative to a value typed on the same sheet:** "deixado = projeto", "medido ≈ ajuste".
7. **Thermography's four-class ΔT scale.**

Items 1-3 are the minimum for the no-break. Items 4-7 can follow with the chave ASCO.

## 8. Decisions of 2026-10-09 and the two library types

Matheus answered § 7 on 2026-10-09:
1. "Um local pode ter mais de uma cabine e essa zero ou mais colunas."
2. Clients are varied.
3. "Coloque o que acha, depois a gente ajusta."
4. and 5. Make the CTA's voltage, poles, transition and functional-test options configurable.
6. Check the sheets against real forms on the internet.

A third web pass on 2026-10-09 compared the § 7 drafts with real published Brazilian forms:
- the WEG nobreak and rectifier start-up and maintenance checklists;
- public-tender routines of the BCB, FUABC, TRT-7, MPF, RJ Casa Civil, OVG, TJAC and the Goiás SEDI;
- the Pextron and Relprot capacitive-source manuals.

### 8.1 Structure: Local › Cabine › Coluna

| Level | Holds | Owns |
| --- | --- | --- |
| **Local** (room or place: "1° Subsolo") | One or more cabines | The Verificações do local, answered once |
| **Cabine** | Zero or more colunas, or equipment directly | Função (Entrada · Primária · Transformação · Distribuição, or a typed name), CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO, *Agrupar por tipo* |
| **Coluna** | Equipment | — |

The site table prints once per local, after the AMBIENTE DE ENSAIO of its first cabine. Seed v1 to v3 keep cabines as roots and stay as they are.

Recorded in:
- `source-deltas.md`, row of 2026-10-09;
- spine AD-6, amended 2026-10-09;
- Story 14.2, criteria added 2026-10-09; its effort is now high.

### 8.2 How the two types ship

"Depois a gente ajusta" fits the clone-and-edit pattern of § 1. So both types ship as **library types** in a seed version after Story 14.5: read-only, usable directly, and duplicable into a company type when Fasor wants to change something. Story 14.7 changes accordingly.

Every option Matheus asked to keep configurable is either a select field, a subtype, or a test sub-block option (`BlockConfig.sub_blocks[key].options`), so a template or a sheet can set it.

### 8.3 Fonte auxiliar da proteção (library type 1)

**Subtypes:** No-break de comando · Fonte capacitiva (trip capacitivo) · Retificador + banco de baterias Vcc. Each subtype pre-marks as NA the items and tests that do not apply, the way the existing subtypes do.

**DADOS DE PLACA**

- **Fonte:** fabricante, modelo, nº de série, potência nominal (VA), potência ativa (W), tensão de entrada (V) e faixa, tensão de saída (V ca ou V cc), frequência (Hz), forma de onda, topologia (standby · interativa · online), by-pass (automático · manual · não possui), faixa de temperatura (°C), data de instalação.
- **Banco de baterias** (no-break, retificador): fabricante, modelo, tipo (VRLA-AGM · gel · ventilada), quantidade de blocos, tensão por bloco (V), tensão do banco (V), capacidade (Ah, C20/C10), data de fabricação, data de instalação, vida útil de projeto (anos, default 5), resistência interna de referência (mΩ, datasheet or first measurement).
- **Fonte capacitiva:** tensão de saída nominal (V cc), capacitância (µF), botão de teste (sim/não).
- **Instalação:** origem da alimentação (TP de proteção · secundário do trafo · serviço auxiliar), cargas alimentadas, trip capacitivo associado (sim/não).

**VERIFICAÇÕES** (C · NC · NA)

1. Placas legíveis
2. Instalada junto ao relé, em caixa lacrável quando a distribuidora exige, indicação visível
3. Ambiente sem infiltração, poeira ou gases corrosivos; ventilação desobstruída; temperatura dentro da faixa
4. Limpeza
5. Conexões de entrada, saída e bateria reapertadas
6. Alimentação por disjuntor dedicado, conforme a norma da distribuidora
7. Comutação TP→fonte ou by-pass operante
8. LEDs, display e histórico de alarmes sem falha
9. Alarme ou supervisão da fonte reserva operante, quando exigido
10. Apenas cargas da proteção conectadas
11. Aterramento da carcaça e da caixa
12. Baterias sem estufamento, trinca, vazamento ou corrosão; estante, cabos de interligação e torque das interligações
13. Sensor de temperatura da bateria conectado, quando houver
14. Idade da bateria dentro da vida útil de projeto
15. Ajustes do carregador (flutuação, carga, limite de corrente) conferidos
16. Trip capacitivo presente, com circuito ou botão de teste

**ENSAIOS** (sub-blocks; each can be switched off per template or sheet)

| Ensaio | Rows | Columns | Default criterion (adjustable by duplicating) | Source |
| --- | --- | --- | --- | --- |
| E1 Modo rede | Tensão de entrada, tensão de saída, frequência | Medido, IHM | Manufacturer's range | WEG checklist |
| E2 Modo bateria (falta simulada; option: sem carga · com carga) | Tensão de saída, frequência, forma de onda, relé permaneceu energizado | Medido | Output ±3% of nominal; senoidal where the distribuidora requires it; "Sim" | NHS datasheet; Cemig 4.12.13; FUABC 2.5.1.12 |
| E3 Flutuação | Bloco 1 … n (added on site), total, média, menor | V, T amb | Datasheet float range at 25 °C, default 13.40-13.80 V per 12 V block, −3.5 mV/°C per cell; ≤2.5% from the average | Intelbras EB1245; Moura |
| E4 Resistência interna | Bloco 1 … n | mΩ medido, mΩ referência, Δ% (derived) | ≤+20% conforme; above +20% investigar; ≥+50% substituir | Practice (Megger, Fluke); no Brazilian form records it, so it is switched off by default |
| E5 Autonomia | One row | Carga (W/VA), corrente, início, fim, tempo, V de corte, tempo de recarga | **≥2 h** | NBR 14039 § 5.3.4.1; FUABC 2.6.7-8 |
| E6 Funcional | Disjuntor abriu alimentado só pela fonte | Resultado | Abriu | Cemig 3.3.1 e |
| E7 Fonte capacitiva | Tensão de entrada (V ca), tensão de saída (V cc), teste pelo botão, aberturas seguidas sem alimentação | Medido, resultado | Output per manufacturer (example 290 V ±10%, or about Vca×1.41 if unregulated); botão OK; **≥2 aberturas** | Pextron TCC manual; Relprot; Celesc N-321.0002 |

The battery is replaced when it is past its design life, or when E4 reaches +50%, or when E5 is below 2 h. That rule goes into the composed conclusion text when one of those NCs exists. No published criterion was found for how long a trip capacitor holds its charge.

### 8.4 Chave de transferência automática (library type 2, "chave ASCO")

**Configurable fields:**
- tensão: BT · MT;
- polos: 2 · 3 · 4;
- neutro: sólido · chaveado · sobreposto;
- transição: aberta · retardada · fechada;
- bypass-isolation: sim · não.

**DADOS DE PLACA:** fabricante, série, nº de catálogo, nº de série, ano, tensão nominal (V), corrente nominal (A), frequência (Hz), WCR (kA), proteção a montante, controlador e firmware, invólucro (NEMA/IP), torque dos terminais (N·m).

**VERIFICAÇÕES** (C · NC · NA)

1. Placa confere com o projeto
2. Invólucro, fixação e continuidade do aterramento do painel
3. Tampas e barreiras fixadas, aviso de transferência manual presente
4. Limpeza interna, aspirada, sem soprar
5. Contatos principais, de arco e auxiliares (posição) sem pites ou superaquecimento
6. Isoladores e barramentos
7. Reaperto da potência ao torque da etiqueta
8. Reaperto da fiação de controle, chicote e fusíveis de comando
9. Lubrificação somente conforme o fabricante, sem óleo
10. Operação manual com as fontes desenergizadas
11. Intertravamento mecânico e elétrico N/E
12. Rotação de fases da Emergência igual à da Normal
13. Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento
14. Registro de manobras e contador de transferências revisados
15. Partida do gerador comandada pela chave; exercitador programado
16. Aquecedor e ventilação, se houver
17. Gerador deixado em AUTOMÁTICO ao final

**ENSAIOS**

| Ensaio | Rows | Columns | Default criterion | Source |
| --- | --- | --- | --- | --- |
| E1 Resistência de contato | Polo A, B, C, N | Lado Normal µΩ, lado Emergência µΩ | ≤50% above the lowest of the same side | NETA 7.22.3, second-hand |
| E2 Isolamento principal | A-T, B-T, C-T, A-B, B-C, C-A, linha-carga | MΩ with Normal closed, Emergência closed, open | BT: 1000 Vcc, ≥100 MΩ. MT: the firm's seeded ">400 MΩ, aceitável na ficha", so the relatório applies one criterion to all its MV equipment | NETA Table 100.1, second-hand |
| E3 Isolamento do controle | Fiação × terra | MΩ | 500 Vcc (300 V wiring) or 1000 Vcc (600 V); ≥2 MΩ; disconnect the controller harness first | NETA 7.22.3, second-hand; ASCO manual |
| E4 Sensores e ajustes do controlador | Pickup and dropout of V and f, Normal and Emergência; falta de fase; TD 1C, 2B, 3A, 2E; exercitador | Fábrica, projeto, encontrado, deixado | Deixado = projeto | ASCO Group 5 manual; RJ ficha DTAC |
| E5 Transferência | Falha da Normal até partida; até carga na Emergência; retransferência; resfriamento; falha da Emergência | Ajuste (s), medido (s), V, f, I with load | Takeover ≤ the design limit (default 10 s, NFPA 110 Level 1); the deviation from the setting is recorded only, since no tolerance is published | OVG; Goiás SEDI; BCB; NFPA 70B A.39.2 |
| E6 Termografia sob carga | Terminais N, E, Carga × fase | °C, ΔT vs similar, ΔT vs ambiente, classe | NETA Table 100.18 classes | NETA, second-hand |

**Options of E5:**
- método: falta real por abertura do disjuntor · botão de teste do controlador · não realizado;
- carga: sem carga · com carga (% carga);
- fonte dos tempos: instrumento · registro do controlador.

A test started from the ASCO controller skips the engine-start delay TD 1C, so the sheet notes the method beside the times.

**Defaults:** E1 to E3 and E6 are on, because they are the firm's own practice on MV equipment, but no Brazilian CTA form records them. Each one is marked NA when the switch cannot be de-energized.

### 8.5 Open, to adjust after first use

1. The firm's ">400 MΩ, aceitável na ficha" is well below NETA's ≥5000 MΩ for the 15 kV class (Table 100.1; the 15 kV row agrees in both sources found). This concerns every MV sheet, not only the CTA. It is recorded here for Bruno and changes nothing now.
2. The other NETA Table 100.1 rows (5, 8, 25, 34.5 kV) differ between the 2007 primary scan and later secondary copies, and need a licensed copy before any of them becomes a criterion.
3. The E4 internal-resistance limits and the E5 transfer tolerance are practice, and Fasor adjusts them by duplicating the type.

## 9. Re-slice with the PM (2026-10-09)

John (PM) reviewed Epic 14 with Matheus on 2026-10-09 and asked, of each delivery, what is the smallest thing that puts value in Bruno's hands on the next real job, and what assumption it tests. Matheus approved three changes.

1. **Library types before company types.** The two first types need only the new vocabulary — the generic measurement table and the new criteria — not company-owned versioned types. So a new **Story 14.5** ships them as seed code (seed v5), and AD-21 stays as it is. The former 14.5, 14.6 and 14.7 (company types in the kernel, the editor, the types in use) become **14.6, 14.7 and 14.8**. The architect's pass on AD-21 now gates 14.6.
2. **Wave 3 waits for real use.** "The office will create its own types" is an intention, not yet observed use. Stories 14.6 to 14.8 start only after two or three real jobs have used the library types, with two counts recorded under Story 14.6: how many new-type requests came in, and what Fasor adjusted in existing types (criteria, items, tables). That count sets the editor's scope. Until then a new type is a small seed story.
3. **The editor frames leave Story 14.1.** Story 14.1 draws the structure, the site checklist, its printed table and the library-type sheets; the editor frames are drawn first inside Story 14.7.

| Wave | Stories | What Bruno gets |
| --- | --- | --- |
| 0 | 14.1 | He approves the printed layout and the checklist surface |
| 1 | 14.2, 14.3, 14.4 | Local › Cabine › Coluna and the Verificações do local on the next job |
| 2 | 14.5 | The no-break de comando and the chave ASCO on their own sheets |
| 3, after real use | 14.6, 14.7, 14.8 | The office creates and adjusts types itself |

**Success signals:**
- **Waves 1 and 2:** on the next real relatório, every local carries its Verificações do local and no equipment is recorded outside the sheets.
- **Wave 3:** the counts recorded under Story 14.6 decide whether it is built and at what size.

## 10. Bruno's answers of 2026-10-09 and 2026-10-10

Bruno saw the Story 14.1 mocks and the printed section 9. He answered in three voice notes on 2026-10-09, transcribed in the session, and in a written reply on 2026-10-10. Matheus decided two open points on 2026-10-10.

| Question | Bruno | Consequence |
| --- | --- | --- |
| Is the structure Local › Cabine › Coluna right? | "Cada cabine é um local separado." "Cada painel pode ter várias colunas, e cada coluna tem vários equipamentos." By voice: equipment also goes straight into the local. | The level above the cabine, decided on 2026-10-09 (§ 8.1), is dropped. The tree is **Local › Painel › Coluna** |
| Is the site table printed once per local? | "É uma por local mesmo." He lists cabine primária, transformação and distribuição as locals. | One table per local, and the local is the cabine itself |
| Should item labels be in sentence case or uppercase? | "Maiúsculo chama mais atenção." | The site items print in uppercase |
| Should the no-break print in "Outros equipamentos"? | "O nobreak coloca apenas o item no disjuntor para checar (C/NC/NA)." | The "Fonte auxiliar da proteção" type (§ 8.3) is dropped. One item goes on the Disjuntor MT checklist in seed v4 |
| Does the mufla get a sheet of its own? | "Mufla podemos deixar somente no cabo mesmo." | Nothing to do: MUFLA is already an item of the cables checklist (`seed/v1.ts:125`) |

**Matheus, 2026-10-10:**
- Equipment sits on the local or on a coluna. A painel only groups its colunas.
- Story 14.5 stays, with the Chave de transferência automática as its only library type.

**The structure:**

| Level | Holds | Owns |
| --- | --- | --- |
| **Local** (the cabine; kernel `kind = cabine`) | Equipment directly, and zero or more painéis | Função, CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO, *Agrupar por tipo*, the Verificações do local |
| **Painel** | One or more colunas | Its name only |
| **Coluna** | Equipment | — |

Rows created before Story 14.2 (a coluna directly under a cabine) stay valid, and nothing is migrated.

**What this changes in Epic 14:**
- **Story 14.2:** it adds one grouping kind, `painel`, under the existing root, not a new root above it. Its effort stays high, because the print and the contract still change.
- **Story 14.3:** the checklist sits on the root row again, as the 2026-10-08 architecture note first said. Seed v4 gains the 19 site items and the NO-BREAK DE COMANDO item on the Disjuntor MT checklist.
- **Story 14.4:** the table prints once per local, after its own AMBIENTE DE ENSAIO, in uppercase.
- **Story 14.5:** one library type, the CTA. The measurement table no longer needs rows added on site or the derived Δ%, which were only for the battery bank.
- **Story 14.1:** the mocks approved on 2026-10-09 are redrawn, and screen 62 is removed.

Sections 7.2 and 8.3 stay in this document as research. They become useful again if a job ever needs a sheet for the auxiliary supply.

