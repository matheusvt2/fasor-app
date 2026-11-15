import type { AddedRowsKey } from './measurement.ts';
import type { MeasurementRow, MeasurementTest, MeasurementValue, PerformedKey } from './measurement.ts';
import type { BlockDefinition, ChecklistItem, FieldDef, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V15 } from './v15.ts';

/*
 * Seed version 16 (Epic 25 wave 3, batch e25s): seed v15 plus, story by story, the keys and rule
 * flags of the wave that change what a new relatório's sheets ask (items, test rows, options) and
 * how it concludes and prints. Seed v15 was deployed with waves 1, 2, 4 and 5 (8d5e9e2e) and is
 * frozen, so the wave's changes to its sheet definitions go to a new version. Every new behaviour is
 * reached through a v16 definition key or a flag of the seed-level `rules` object (`seedRule`),
 * never through a version number, so v1 to v15 read as before in every reader (AD-21); no relatório
 * migrates its seed.
 *
 * The opening commit of batch e25s makes v16 equal to v15: the version only, the same content and
 * the same rule flags, so a v16 relatório concludes and prints exactly as a v15 one.
 *
 * Fenced sections: each later story adds one section below, headed by a fence line
 *   // --- Story 25.N: <the story's title> ---------------------------------------------
 * holding one `story25_N(seed: ReportSeed): void` that edits the clone in place (and the exported
 * constants its tests read), and calls it from `cabinePrimariaV16` in story order. Its undo is a
 * `withoutE25s<N>` helper in `seed.test.ts`, named in `E25S_STRIPS`, so `withoutE25s(v16)` stays v15.
 *
 * Derived from v15 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V15_HASH`, frozen since the deploy of 8d5e9e2e).
 */

const v15 = CABINE_PRIMARIA_V15;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV16(): ReportSeed {
  const seed = structuredClone(v15);
  story25_15(seed);
  story25_16(seed);
  story25_18(seed);
  story25_19(seed);
  return seed;
}

/** The item `key` of the definition's checklist, or a seed error. */
function itemOf(definition: BlockDefinition, key: string): ChecklistItem {
  const item = definition.checklist?.find((candidate) => candidate.key === key);
  if (item === undefined) throw new Error(`seed v16: ${definition.block_type} lacks the item ${key}`);
  return item;
}

// --- Story 25.15: The thermography: "Não realizada" with a reason, printed, and points by equipment type ---

/** The thermography's test key, on the eight types (since v13) and the Inspeção de QGBT (since v14). */
export const STORY_25_15_TEST = 'termografia';
/** Every type whose v15 definition carries the thermography: each one changes on v16. */
export const STORY_25_15_TYPES = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca', 'inspecao_qgbt'] as const;

/**
 * The v16 thermography's values (M23, Bruno's answer 4, decision 3): one required choice, "Realizada" or "Não
 * realizada", in place of v13's "Equipamento em carga" (the coordinator's reading: "fora de carga" becomes a reason);
 * under "Não realizada" a reason from a closed list, required, and under "Outro" its text, required, as the oil
 * sampling's of seed v14 (Story 24.14). The choice's label is the frame's (`60-ficha.html` #/ficha/DJ-02).
 */
export const STORY_25_15_VALUES: readonly MeasurementValue[] = [
  {
    key: 'realizacao',
    label: 'Termografia',
    kind: 'choice',
    options: [
      { key: 'realizada', label: 'Realizada' },
      { key: 'nao_realizada', label: 'Não realizada' },
    ],
  },
  {
    key: 'motivo',
    label: 'Motivo',
    kind: 'choice',
    // authored (e25s, Story 25.15, listed for Bruno, B-17): the reasons of a thermography not done.
    options: [
      { key: 'fora_de_carga', label: 'Equipamento fora de carga' },
      { key: 'sem_acesso_seguro', label: 'Sem acesso seguro ao equipamento' },
      { key: 'sem_termovisor', label: 'Sem termovisor disponível' },
      { key: 'outro', label: 'Outro' },
    ],
    when: { value: 'realizacao', equals: 'nao_realizada' },
  },
  { key: 'motivo_texto', label: 'Descreva o motivo', kind: 'text', when: { value: 'motivo', equals: 'outro' } },
];

/** The v16 thermography is done by its `realizacao` answer, and says why not by `motivo` (`performedSchema`). */
export const STORY_25_15_PERFORMED: PerformedKey = { value: 'realizacao', done: 'realizada', reason: 'motivo' };

/** Story 25.14's key on every type's thermography: the action "Adicionar ponto", no stem, no plate count, the default maximum. */
export const STORY_25_15_ADDED_ROWS: AddedRowsKey = { label: 'Adicionar ponto' };

/** The input and output terminals, one row per phase, in the phase words the type's other tables use ("Fase A"). */
const terminalRows = (): MeasurementRow[] =>
  (['entrada', 'saida'] as const).flatMap((side) =>
    (['a', 'b', 'c'] as const).map((phase): MeasurementRow => ({ key: `terminal_${side}_fase_${phase}`, label: `Terminal de ${side === 'entrada' ? 'entrada' : 'saída'}, fase ${phase.toUpperCase()}`, optional: true })),
  );
const instrumentTransformerRows = (): MeasurementRow[] => [
  { key: 'terminais_primario', label: 'Terminais do primário', optional: true },
  { key: 'terminais_secundario', label: 'Terminais do secundário', optional: true },
];

/**
 * The points by type (Bruno's answer 4), each optional as v13's are and judged by v13's bands. The row names are
 * Bruno's words where he gave a label; where he gave a phrase they are authored (listed for Bruno): the breaker's and
 * the switch's six terminals, the TP's and the TC's two. The Cabos de entrada, the Cabos de saída and the Para-raio keep
 * v13's four rows until Bruno answers B-9, so they are not listed.
 */
export const STORY_25_15_ROWS: Readonly<Partial<Record<(typeof STORY_25_15_TYPES)[number], readonly MeasurementRow[]>>> = {
  transformador_forca: [
    { key: 'buchas_mt', label: 'Buchas MT', optional: true },
    { key: 'buchas_conexoes_bt', label: 'Buchas e conexões BT', optional: true },
    { key: 'tanque_bobinas', label: 'Tanque ou bobinas', optional: true },
  ],
  // authored (e25s, Story 25.15, listed for Bruno): the six terminal rows and the two rows of the TP and the TC.
  disjuntor_mt: terminalRows(),
  chave_seccionadora: terminalRows(),
  tp: instrumentTransformerRows(),
  tc: instrumentTransformerRows(),
  inspecao_qgbt: [
    { key: 'disjuntor_geral', label: 'Disjuntor geral', optional: true },
    { key: 'barramentos', label: 'Barramentos', optional: true },
    { key: 'saidas', label: 'Saídas', optional: true },
    { key: 'neutro', label: 'Neutro', optional: true },
  ],
};

/**
 * Story 25.15: on every type that carries it, the thermography asks "Realizada" or "Não realizada" in place of
 * "Equipamento em carga" and no longer applies by a condition (nothing makes it N.A. by itself, so the override band
 * never shows on it); it takes added points; and, on the six types Bruno's answer names, its rows are that type's
 * points. Its label, columns, bands, switch (a template may still switch it off) and help are v15's.
 */
function story25_15(seed: ReportSeed): void {
  for (const type of STORY_25_15_TYPES) {
    const test: MeasurementTest | undefined = seed.blocks[type]?.measurement_tests?.find((candidate) => candidate.key === STORY_25_15_TEST);
    if (test === undefined) throw new Error(`seed v16: the ${type} lacks the thermography`);
    if (test.applies_when === undefined || !(test.values ?? []).some((value) => value.key === 'em_carga')) throw new Error(`seed v16: the ${type}'s thermography lacks "Equipamento em carga"`);
    if (test.performed !== undefined || test.added_rows !== undefined) throw new Error(`seed v16: the ${type}'s thermography already asks whether it was done`);
    delete test.applies_when;
    test.values = structuredClone([...STORY_25_15_VALUES]);
    test.performed = structuredClone(STORY_25_15_PERFORMED);
    test.added_rows = structuredClone(STORY_25_15_ADDED_ROWS);
    const rows = STORY_25_15_ROWS[type];
    if (rows !== undefined) test.rows = structuredClone([...rows]);
  }
}

// --- Story 25.16: The ground grid takes continuity points beyond the five --------------------------

/** The Malha de aterramento's continuity test, which takes the points the technician adds on v16. */
export const STORY_25_16_TEST = 'continuidade_malha';

/**
 * Story 25.14's key on that test (Bruno's answer 6: the five points are a minimum; M30): the action "Adicionar
 * ponto", no stem (the technician names each point), no plate count, the default maximum. The action's label is
 * the story's.
 */
export const STORY_25_16_ADDED_ROWS: AddedRowsKey = { label: 'Adicionar ponto' };

/**
 * Story 25.16: the v16 Malha's continuity test takes added points (Story 25.14), each judged by the test's one
 * criterion ("≤ 0,5 Ω entre pontos"), as the five rows are. The five rows stay as they are, optional, the
 * suggested minimum; an added point is not optional (it exists because it was measured). Nothing else of the
 * Malha changes.
 */
function story25_16(seed: ReportSeed): void {
  const test = seed.blocks.malha_aterramento?.measurement_tests?.find((candidate) => candidate.key === STORY_25_16_TEST);
  if (test === undefined) throw new Error(`seed v16: the Malha de aterramento lacks ${STORY_25_16_TEST}`);
  if (test.added_rows !== undefined) throw new Error('seed v16: the Malha\'s continuity test already takes added rows');
  test.added_rows = structuredClone(STORY_25_16_ADDED_ROWS);
}

// --- Story 25.18: The TC asks about its secondary, and the oil transformer's items say what they mean ---

/**
 * The TC's item 7 on v16 (Bruno's answer 11 to B-11 of Epic 24, M22), appended after BUCHAS. The label is
 * Bruno's wording; the three NC phrases are authored from its two parts (the secondary never open, the test
 * terminals in good order), listed for Bruno. The TP does not get it: its rule is the opposite one.
 */
export const STORY_25_18_TC_ITEM: ChecklistItem = {
  key: 'secundario_fechado_ou_curto_circuitado',
  label: 'SECUNDÁRIO FECHADO OU CURTO-CIRCUITADO NOS BORNES (NUNCA ABERTO); BORNES DE AFERIÇÃO EM BOM ESTADO',
  // authored (e25s, Story 25.18, listed for Bruno): the NC phrases of the TC's item 7.
  nc_phrases: ['secundário aberto nos bornes', 'bornes de aferição danificados', 'bornes de aferição oxidados ou com conexão frouxa'],
};

/**
 * The hints of six items of the transformer's list on v16 (M21, the story's wording), by item key: shown under
 * the label on the sheet only, never printed. No label, key or order changes.
 */
export const STORY_25_18_TRANSFORMER_HINTS: Readonly<Record<string, string>> = {
  oleo_isolante_indicador_de_nivel: 'NÍVEL DE ÓLEO',
  juntas_vedacoes_e_vazamentos: 'VAZAMENTOS DE ÓLEO',
  elemento_secante: 'SÍLICA GEL DO SECADOR',
  termometro: 'TERMÔMETRO DE ÓLEO',
  rele_de_gas_funcionamento: 'RELÉ BUCHHOLZ, QUANDO HOUVER',
  valvula_de_alivio: 'VÁLVULA DE ALÍVIO DE PRESSÃO, QUANDO HOUVER',
};

/**
 * Story 25.18: the TC's list gains item 7 (no subtype marks it NA and the oil rule does not name it: it is
 * asked on every TC); the transformer's six items gain their hints. The TP and every printed label are v15's.
 */
function story25_18(seed: ReportSeed): void {
  const tc = seed.blocks.tc;
  if (tc.checklist?.some((item) => item.key === STORY_25_18_TC_ITEM.key)) throw new Error('seed v16: the TC already asks its secondary');
  tc.checklist = [...tc.checklist!, structuredClone(STORY_25_18_TC_ITEM)];
  const transformer = seed.blocks.transformador_forca;
  for (const [key, hint] of Object.entries(STORY_25_18_TRANSFORMER_HINTS)) {
    const item = itemOf(transformer, key);
    if (item.hint !== undefined) throw new Error(`seed v16: the transformer's ${key} already has a hint`);
    item.hint = hint;
  }
}

// --- Story 25.19: One name for the insulating medium, and "A SECO" (the "A SECO" half) ---------------

/** The dry option and subtype label on v16 (M11), and the spelling it replaces, its alias. */
export const STORY_25_19_DRY = 'A SECO';
export const STORY_25_19_DRY_ALIAS = 'Á SECO';
/** The three types whose TIPO DE ISOLAÇÃO and subtype read the dry option. */
export const STORY_25_19_TYPES = ['transformador_forca', 'tp', 'tc'] as const;

/**
 * Story 25.19, the "A SECO" half only (the oil option's name waits for Bruno's answer to B-4): on the three
 * types TIPO DE ISOLAÇÃO's dry option and the dry subtype (key `a_seco`, kept) read "A SECO", in place, and
 * "Á SECO" becomes the field's alias of it, so a value copied from a v1 to v15 sheet, a template moved to v16
 * and a plate reading land on it (`selectOptionFor`). The oil option, its aliases, the oil rule and every
 * condition are v15's.
 */
function story25_19(seed: ReportSeed): void {
  for (const type of STORY_25_19_TYPES) {
    const definition = seed.blocks[type];
    const field: FieldDef | undefined = definition.nameplate.find((candidate) => candidate.key === 'tipo_de_isolacao');
    const at = field?.options?.indexOf(STORY_25_19_DRY_ALIAS) ?? -1;
    if (field === undefined || at < 0) throw new Error(`seed v16: the ${type}'s TIPO DE ISOLAÇÃO lacks ${STORY_25_19_DRY_ALIAS}`);
    field.options![at] = STORY_25_19_DRY;
    field.option_aliases = { ...(field.option_aliases ?? {}), [STORY_25_19_DRY_ALIAS]: STORY_25_19_DRY };
    const subtype = definition.subtypes.find((candidate) => candidate.key === 'a_seco');
    if (subtype === undefined || subtype.label !== STORY_25_19_DRY_ALIAS) throw new Error(`seed v16: the ${type} lacks the subtype ${STORY_25_19_DRY_ALIAS}`);
    subtype.label = STORY_25_19_DRY;
  }
}

export const CABINE_PRIMARIA_V16: ReportSeed = cabinePrimariaV16();
