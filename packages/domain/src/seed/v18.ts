import type { MeasurementValue } from './measurement.ts';
import type { BlockDefinition, ChecklistItem, FieldDef, NotTestedReason, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V17 } from './v17.ts';

/*
 * Seed version 18 (Epic 28, Bruno's answers of 2026-11-22; batch e28a opens it): seed v17 plus, story by
 * story, the sheet, plate and fixed-text changes of the epic. Seed v17 was deployed with Epics 26 and 27
 * (886af55e) and is frozen, so the epic's changes to its definitions go to a new version. Every new
 * behaviour is reached through a v18 definition key or a flag of the seed-level `rules` object
 * (`seedRule`), never through a version number, so v1 to v17 read as before in every reader (AD-21); no
 * relatório migrates its seed.
 *
 * The opening commit of batch e28a (Story 28.2) makes v18 equal to v17: the version only, the same content
 * and the same rule flags, so a v18 relatório concludes and prints exactly as a v17 one.
 *
 * Fenced sections: each later story adds one section below, headed by a fence line
 *   // --- Story 28.N: <the story's title> ---------------------------------------------
 * holding one `story28_N(seed: ReportSeed): void` that edits the clone in place (and the exported
 * constants its tests read), and calls it from `cabinePrimariaV18` in story order. Its undo is a
 * `withoutE28<N>` helper in `seed.test.ts`, named in `E28_STRIPS`, so `withoutE28(v18)` stays v17.
 *
 * Derived from v17 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V17_HASH`, frozen since the deploy of 886af55e).
 */

const v17 = CABINE_PRIMARIA_V17;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV18(): ReportSeed {
  const seed = structuredClone(v17);
  story28_3(seed);
  story28_4(seed);
  story28_5(seed);
  story28_6(seed);
  story28_7(seed);
  story28_8(seed);
  story28_9(seed);
  story28_10(seed);
  return seed;
}

/** The nameplate field `key` of the definition, or a seed error. */
function fieldOf(definition: BlockDefinition, key: string): FieldDef {
  const field = definition.nameplate.find((candidate) => candidate.key === key);
  if (field === undefined) throw new Error(`seed v18: ${definition.block_type} lacks the field ${key}`);
  return field;
}

// --- Story 28.3: The oil's names: "A SECO" or "A ÓLEO" on the transformer, "ÓLEO VEGETAL" on the TP and the TC ---

/** The transformer's TIPO DE ISOLAÇÃO on v18 (B-4; Bruno's Q-1: EPÓXI leaves it), its two options in this order. */
export const STORY_28_3_DRY = 'A SECO';
export const STORY_28_3_OIL = 'A ÓLEO';
export const STORY_28_3_TRANSFORMER_OPTIONS: readonly string[] = [STORY_28_3_DRY, STORY_28_3_OIL];
/** The v17 options the transformer's two now read: v6 to v17's oil spellings as "A ÓLEO", EPÓXI and "Á SECO" as "A SECO". */
export const STORY_28_3_TRANSFORMER_ALIASES: Readonly<Record<string, string>> = {
  ÓLEO: STORY_28_3_OIL,
  'ÓLEO MINERAL': STORY_28_3_OIL,
  'Á SECO': STORY_28_3_DRY,
  'ÓLEO ISOLANTE': STORY_28_3_OIL,
  EPÓXI: STORY_28_3_DRY,
};
/** The spelling v13 to v17 gave the oil option, which "A ÓLEO" takes the place of. */
export const STORY_28_3_OIL_BEFORE = 'ÓLEO ISOLANTE';
/** The EPÓXI option v1 to v17 offered on the transformer, now an alias of "A SECO" that implies its CONSTRUÇÃO. */
export const STORY_28_3_EPOXY = 'EPÓXI';

/**
 * The transformer's CONSTRUÇÃO on v18 (Bruno's Q-1, "se der", as in his test base): asked only while TIPO DE ISOLAÇÃO
 * is "A SECO" (shown while it is empty, as NATUREZA DO LÍQUIDO is), never required, a dry field of the oil rule (an oil
 * unit excuses it and prints "-"). Appended to the plate, so in print it takes the empty last pair after CLASSE
 * TÉRMICA and no v17 row moves; on screen it sits right after TIPO DE ISOLAÇÃO (Matheus, 2026-11-23). A unit copied
 * from a sheet that said EPÓXI arrives with "ENCAPSULADO EM RESINA EPÓXI". The helper is the frame's, listed for Bruno.
 */
export const STORY_28_3_CONSTRUCAO: FieldDef = {
  key: 'construcao',
  label: 'CONSTRUÇÃO',
  kind: 'select',
  options: ['ENCAPSULADO EM RESINA EPÓXI', 'IMPREGNADO A VÁCUO (VPI)'],
  optional: true,
  // authored (Story 28.1's frame, listed for Bruno): the helper under CONSTRUÇÃO.
  help: 'Opcional',
  excused_unless: { field: 'tipo_de_isolacao', in: [STORY_28_3_DRY] },
  screen_after: 'tipo_de_isolacao',
  implied_by: { field: 'tipo_de_isolacao', values: { [STORY_28_3_EPOXY]: 'ENCAPSULADO EM RESINA EPÓXI' } },
};

/** The TP's and the TC's TIPO DE ISOLAÇÃO on v18: v17's three and "ÓLEO VEGETAL", both oils of their oil rule. */
export const STORY_28_3_VEGETAL = 'ÓLEO VEGETAL';
export const STORY_28_3_INSTRUMENT_TYPES = ['tp', 'tc'] as const;

/**
 * Story 28.3 (B-4, the oil half of Story 25.19, with Bruno's Q-1 and Matheus's Q-2 and his decision on the frames):
 * - the transformer's TIPO DE ISOLAÇÃO offers "A SECO" and "A ÓLEO" only; v17's ÓLEO ISOLANTE (and its own aliases ÓLEO
 *   and ÓLEO MINERAL) read "A ÓLEO", EPÓXI and "Á SECO" read "A SECO"; the oil rule's `oil_values` and the oil
 *   sampling's condition read "A ÓLEO";
 * - NATUREZA DO LÍQUIDO is not drawn while TIPO DE ISOLAÇÃO holds a value other than "A ÓLEO" (its `excused_unless`),
 *   and TIPO (ANP), which hangs on it, with it; the printed plate keeps both rows, "-" on a dry unit (Q-2, "como hoje");
 * - CONSTRUÇÃO joins the plate (above);
 * - the TP and the TC offer EPÓXI, A SECO, ÓLEO MINERAL and ÓLEO VEGETAL, both oils in their `oil_values`.
 * The subtypes (template config keys `epoxi` and `a_seco`) stay as v17's: a stored template keeps validating.
 */
function story28_3(seed: ReportSeed): void {
  const transformer = seed.blocks.transformador_forca;
  const insulation = fieldOf(transformer, 'tipo_de_isolacao');
  if (JSON.stringify(insulation.options) !== JSON.stringify([STORY_28_3_EPOXY, STORY_28_3_DRY, STORY_28_3_OIL_BEFORE])) throw new Error('seed v18: the transformer\'s TIPO DE ISOLAÇÃO is not v17\'s');
  insulation.options = [...STORY_28_3_TRANSFORMER_OPTIONS];
  insulation.option_aliases = { ...STORY_28_3_TRANSFORMER_ALIASES };
  const liquid = fieldOf(transformer, 'natureza_liquido');
  if (liquid.excused_unless !== undefined) throw new Error('seed v18: NATUREZA DO LÍQUIDO already hangs on a field');
  liquid.excused_unless = { field: 'tipo_de_isolacao', in: [STORY_28_3_OIL] };
  if (transformer.nameplate.some((field) => field.key === STORY_28_3_CONSTRUCAO.key)) throw new Error('seed v18: the transformer already asks CONSTRUÇÃO');
  transformer.nameplate = [...transformer.nameplate, structuredClone(STORY_28_3_CONSTRUCAO)];
  const rule = transformer.oil_rule!;
  if (JSON.stringify(rule.oil_values) !== JSON.stringify([STORY_28_3_OIL_BEFORE])) throw new Error('seed v18: the transformer\'s oil rule is not v17\'s');
  rule.oil_values = [STORY_28_3_OIL];
  rule.dry_fields = [...(rule.dry_fields ?? []), STORY_28_3_CONSTRUCAO.key];
  const sampling = transformer.measurement_tests?.find((test) => test.key === 'coleta_oleo');
  const condition = sampling?.applies_when;
  if (condition === undefined || !('field' in condition) || condition.op !== 'in' || condition.field !== 'tipo_de_isolacao' || JSON.stringify(condition.values) !== JSON.stringify([STORY_28_3_OIL_BEFORE])) {
    throw new Error('seed v18: the transformer\'s oil sampling does not apply on v17\'s oil option');
  }
  condition.values = [STORY_28_3_OIL];

  for (const type of STORY_28_3_INSTRUMENT_TYPES) {
    const definition = seed.blocks[type];
    const field = fieldOf(definition, 'tipo_de_isolacao');
    if (field.options?.includes(STORY_28_3_VEGETAL) || JSON.stringify(definition.oil_rule?.oil_values) !== JSON.stringify(['ÓLEO MINERAL'])) throw new Error(`seed v18: the ${type}'s insulation is not v17's`);
    field.options = [...field.options!, STORY_28_3_VEGETAL];
    definition.oil_rule!.oil_values = [...definition.oil_rule!.oil_values, STORY_28_3_VEGETAL];
  }
}

// --- Story 28.4: Two items on the transformer, two reasons for a thermography not done, and the reason "Equipamento da concessionária" ---

/**
 * The transformer's items 18 and 19 on v18 (B-5, B-17; Bruno's Q-3: asked on both kinds, with their own words). `label` is
 * the oil unit's, `dry_label` the dry unit's; the kernel picks the words by the oil rule (`checklistItemLabel`), so the
 * answer stays one when TIPO DE ISOLAÇÃO changes. Neither is an oil item. The NC phrases are authored, listed for Bruno.
 */
export const STORY_28_4_TRANSFORMER_ITEMS: readonly ChecklistItem[] = [
  {
    key: 'temperatura_alarme_e_desligamento',
    label: 'RELÉ/TERMÔMETRO DE TEMPERATURA: ALARME E DESLIGAMENTO',
    dry_label: 'SENSORES DE TEMPERATURA (PT100) E RELÉ TÉRMICO: ALARME E DESLIGAMENTO',
    // authored (Story 28.4, listed for Bruno): the NC phrases of item 18, true of both kinds.
    nc_phrases: ['alarme de temperatura não atua', 'desligamento por temperatura não atua', 'sensor de temperatura danificado ou desconectado'],
  },
  {
    key: 'aterramento_carcaca_tanque_e_neutro',
    label: 'ATERRAMENTO DO TANQUE E DO NEUTRO',
    dry_label: 'ATERRAMENTO DA CARCAÇA E DO NEUTRO',
    // authored (Story 28.4, listed for Bruno): the NC phrases of item 19, true of both kinds.
    nc_phrases: ['aterramento do neutro desconectado', 'conexão de aterramento oxidada ou frouxa', 'cordoalha de aterramento danificada'],
  },
];

/** The two reasons of a thermography not done that v18 adds before "Outro" (B-17, Bruno's words), on every type that carries it. */
export const STORY_28_4_THERMOGRAPHY_REASONS: readonly { key: string; label: string }[] = [
  { key: 'carga_insuficiente', label: 'Carga insuficiente para avaliação' },
  { key: 'fora_do_escopo', label: 'Fora do escopo contratado' },
];

/**
 * The not-tested reason "Equipamento da concessionária" (B-8, B-15; Bruno's Q-4), before "Outro". Its default
 * justification is Bruno's sentence: `{tag}` is the sheet's TAG, filled by the kernel, and `{concessionaria}` the
 * utility's name, typed on the ficha (`notTestedJustification`); the engineer may rewrite the whole text there.
 */
export const STORY_28_4_UTILITY_REASON: NotTestedReason = {
  key: 'equipamento_concessionaria',
  label: 'Equipamento da concessionária',
  justification:
    'Ensaios não realizados no(s) equipamento(s) {tag}, de propriedade da concessionária {concessionaria} e destinado(s) à medição de faturamento, por não haver autorização da concessionária para intervenção.',
  utility: true,
};

/** The No-break de comando's battery date on v18 (Bruno's Q-5, B-13): the label only, same key and value. */
export const STORY_28_4_BATTERY_DATE_KEY = 'baterias_data_de_fabricacao_ou_instalacao';
export const STORY_28_4_BATTERY_DATE_LABEL = 'BATERIAS: DATA DE FABRICAÇÃO, INSTALAÇÃO OU TROCA';
export const STORY_28_4_BATTERY_DATE_LABEL_BEFORE = 'BATERIAS: DATA DE FABRICAÇÃO OU INSTALAÇÃO';
/** The types whose v18 thermography takes the two reasons: every type that carries it since v16. */
export const STORY_28_4_THERMOGRAPHY_TYPES = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca', 'inspecao_qgbt'] as const;

/**
 * Story 28.4 (B-5, B-17, B-8, B-15, with Bruno's Q-3, Q-4 and Q-5): the transformer asks items 18 and 19 on both kinds;
 * every thermography's "Motivo" offers the two new reasons before "Outro"; the relatório's not-tested reasons offer
 * "Equipamento da concessionária" before "Outro"; the No-break de comando's battery date names the exchange. No label,
 * key or order of an existing item or reason changes.
 */
function story28_4(seed: ReportSeed): void {
  const transformer = seed.blocks.transformador_forca;
  if (transformer.checklist === null || transformer.checklist.length !== 17) throw new Error('seed v18: the transformer does not ask v17\'s seventeen items');
  transformer.checklist = [...transformer.checklist, ...structuredClone(STORY_28_4_TRANSFORMER_ITEMS)];

  for (const type of STORY_28_4_THERMOGRAPHY_TYPES) {
    const motivo: MeasurementValue | undefined = seed.blocks[type]?.measurement_tests?.find((test) => test.key === 'termografia')?.values?.find((value) => value.key === 'motivo');
    const options = motivo?.options;
    if (motivo === undefined || motivo.kind !== 'choice' || options === undefined || options.at(-1)?.key !== 'outro') throw new Error(`seed v18: the ${type}'s thermography lacks its reasons`);
    motivo.options = [...options.slice(0, -1), ...structuredClone([...STORY_28_4_THERMOGRAPHY_REASONS]), options.at(-1)!];
  }

  const reasons = seed.not_tested_reasons;
  if (reasons.at(-1)?.key !== 'outro' || reasons.some((reason) => reason.key === STORY_28_4_UTILITY_REASON.key)) throw new Error('seed v18: the not-tested reasons are not v17\'s');
  seed.not_tested_reasons = [...reasons.slice(0, -1), structuredClone(STORY_28_4_UTILITY_REASON), reasons.at(-1)!];

  const noBreak = seed.blocks.no_break_comando;
  if (noBreak === undefined) throw new Error('seed v18: the No-break de comando is missing');
  const battery = fieldOf(noBreak, STORY_28_4_BATTERY_DATE_KEY);
  if (battery.label !== STORY_28_4_BATTERY_DATE_LABEL_BEFORE) throw new Error('seed v18: the battery date is not v17\'s');
  battery.label = STORY_28_4_BATTERY_DATE_LABEL;

  // Fix batch e28w (S3 of the pass of 2026-11-23): item 18's "PT100", and every acronym of the list, kept when a label is
  // lowered into a sentence; a flag, since v14 to v17's "DISPLAY, ALARMES E LEDS" printed "leds" there.
  if (seed.rules?.label_acronyms_inline !== undefined) throw new Error('seed v18: the e28w rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), label_acronyms_inline: true };
}

// --- Story 28.5: A point starts with a priority and an action, and its deadline counts from the issue date ---

/**
 * Story 28.5 (B-8, the second half of Story 25.10, with Matheus's Q-6): two rule flags, read by the kernel only
 * (`points/priority.ts`, `points/derived.ts`, `print/section-8.ts`, `relatorio/pre-issue.ts`). `point_start_priority`: a
 * tapped point opens with its origin's priority and Bruno's default action; `deadline_from_issue`: a suggested deadline
 * counts from the issue date. The rule that offers no point for the utility's equipment needs no flag: only v18 has the
 * reason (Story 28.4).
 */
function story28_5(seed: ReportSeed): void {
  if (seed.rules?.point_start_priority !== undefined || seed.rules?.deadline_from_issue !== undefined) throw new Error('seed v18: a Story 28.5 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), point_start_priority: true, deadline_from_issue: true };
}

// --- Story 28.6: The insulation rows take the header's test voltage -------------------------------

/**
 * Story 28.6 (B-16): one rule flag, `row_voltage_from_header`, read by `rowTestVoltage` and `rowVoltageSourceText`
 * (`relatorio/row-voltage.ts`): a row's voltage is the typed cell, else its seeded default, else the header's TENSÃO
 * ENSAIO when it is one of the options, else its winding's or its table's rating default, else none.
 */
function story28_6(seed: ReportSeed): void {
  if (seed.rules?.row_voltage_from_header !== undefined) throw new Error('seed v18: the Story 28.6 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), row_voltage_from_header: true };
}

// --- Story 28.7: A reading above the instrument's limit prints with its note -----------------------

/**
 * Story 28.7 (B-6): one rule flag, `over_range_note`, read by `overRangeNoteLines` (`print/over-range-note.ts`): under a
 * seeded insulation test with a reading above the limit, Bruno's line per limit, in the place of Story 23.4's note.
 */
function story28_7(seed: ReportSeed): void {
  if (seed.rules?.over_range_note !== undefined) throw new Error('seed v18: the Story 28.7 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), over_range_note: true };
}

// --- Story 28.8: The variation note names only what matters, by Bruno's numbers ---------------------

/**
 * Story 28.8 (B-7, Matheus's Q-7): one rule flag, `history_note_relevant`, read by `sheetVariationNotes`
 * (`print/history-note.ts`): the note against the previous visit by Bruno's numbers and the change of level, in the short
 * form, one line at three or more. No verdict rule changes.
 */
function story28_8(seed: ReportSeed): void {
  if (seed.rules?.history_note_relevant !== undefined) throw new Error('seed v18: the Story 28.8 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), history_note_relevant: true };
}

// --- Story 28.9: Etapa 6 takes the relatório's additional items, printed as topics in section 10 ---

/**
 * Story 28.9 (B-15): one rule flag, `additional_items`, read by `offersAdditionalItems` (`relatorio/additional-items.ts`)
 * for Etapa 6 and by `section10Layout` (`print/section-10.ts`): the relatório's own items print as topics after section
 * 10's fixed items. The items are the relatório's (`setup.additional_items`, contract 59), not the seed's.
 */
function story28_9(seed: ReportSeed): void {
  if (seed.rules?.additional_items !== undefined) throw new Error('seed v18: the Story 28.9 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), additional_items: true };
}

// --- Story 28.10: The fixed texts and the band: the earth paragraph with the Malha, "de ⟨cliente⟩", and the applied band ---

/** Story 28.10 (B-14): section 1's one edit on v18, "da {cliente}" read "de {cliente}"; it replaces exactly one occurrence. */
export const STORY_28_10_SECTION_1_EDIT = { section: 1, from: 'Transformação da {cliente}, unidade {obra}.', to: 'Transformação de {cliente}, unidade {obra}.' } as const;

/**
 * Story 28.10 (B-14, B-12; the band B-3 is screen-only, on every seed, and needs no seed change): section 1 reads "de
 * {cliente}" in the text in force since the base date, and the rule flag `earth_paragraph_with_malha`, read by
 * `section2Blocks` (`relatorio/section-variables.ts`), prints section 2's paragraph on earth resistance only with a live
 * Malha de aterramento sheet. Section 2's seeded text itself stays v17's.
 */
function story28_10(seed: ReportSeed): void {
  const BASE = '2000-01-01';
  const edit = STORY_28_10_SECTION_1_EDIT;
  const entry = seed.sections.find((candidate) => candidate.section === edit.section && candidate.effective_from === BASE);
  const hits = entry?.blocks?.filter((block) => block.text.includes(edit.from)) ?? [];
  if (hits.length !== 1 || hits[0]!.text.split(edit.from).length !== 2) throw new Error(`seed v18: section 1 holds "${edit.from}" ${hits.length} times`);
  hits[0]!.text = hits[0]!.text.replace(edit.from, edit.to);
  if (seed.rules?.earth_paragraph_with_malha !== undefined) throw new Error('seed v18: the Story 28.10 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), earth_paragraph_with_malha: true };
}

export const CABINE_PRIMARIA_V18: ReportSeed = cabinePrimariaV18();
