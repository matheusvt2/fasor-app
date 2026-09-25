import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { listPtBr } from '../text/plural.ts';
import { evaluatedCells, evaluateSheetReadings, worstReadings, type TestKey, type WorstReading } from './readings.ts';
import { checklistResultOf } from './sheet-progress.ts';
import { enabledSubBlocksOf, isCellFilled } from './sheet-state.ts';

/*
 * Story 5.8 (FR-29, FR-30, AR-11, UX-DR43-47): the sheet's conclusion. The pair the app
 * suggests, the paragraph it composes and the words around them are derived here, from the
 * same reading evaluation the Measurement table shows (`evaluateSheetReadings`), so a
 * reading out of criterion drives the field's helper, the "Com restrições" suggestion and
 * the criteria line identically. The app never sets a verdict: the pair is written only by
 * the engineer's tap, and Reprovado is never suggested. The conclusion text is derived on
 * read, never a row; what is stored is only what the engineer confirmed (`text`,
 * `text_status`, `text_basis`).
 */

export type ConclusionResult = 'aprovado' | 'reprovado';
export type ConclusionRestriction = 'sem_restricoes' | 'com_restricoes';
export type ConclusionTextStatus = 'confirmed' | 'edited';

export const CONCLUSION_RESULTS: readonly ConclusionResult[] = ['aprovado', 'reprovado'];
export const CONCLUSION_RESTRICTIONS: readonly ConclusionRestriction[] = ['sem_restricoes', 'com_restricoes'];

export interface ConclusionPair {
  result: ConclusionResult;
  restriction: ConclusionRestriction;
}

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition | null {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    return null;
  }
}

/** The stored result, or null. */
export function conclusionResultOf(block: Pick<BlockRow, 'sheet'>): ConclusionResult | null {
  const value = block.sheet.conclusion.result?.value;
  return value === 'aprovado' || value === 'reprovado' ? value : null;
}

/** The stored restriction, or null. */
export function conclusionRestrictionOf(block: Pick<BlockRow, 'sheet'>): ConclusionRestriction | null {
  const value = block.sheet.conclusion.restriction?.value;
  return value === 'sem_restricoes' || value === 'com_restricoes' ? value : null;
}

/** The checklist's NC rows of an enabled checklist: 1-based item number, label and observation. */
function ncItems(block: BlockRow, definition: BlockDefinition): { n: number; label: string; observation: string | null }[] {
  if (definition.checklist === null || !enabledSubBlocksOf(block).has('checklist')) return [];
  return definition.checklist.flatMap((item, index) => {
    if (checklistResultOf(block, item.key) !== 'NC') return [];
    const cell = block.sheet.checklist[item.key]?.observation;
    const observation = isCellFilled(cell) && typeof cell!.value === 'string' ? cell!.value.trim() : null;
    return [{ n: index + 1, label: item.label, observation }];
  });
}

/** E5-Q4: true when the enabled checklist holds at least one Conforme row. */
function anyConforme(block: BlockRow, definition: BlockDefinition): boolean {
  if (definition.checklist === null || !enabledSubBlocksOf(block).has('checklist')) return false;
  return definition.checklist.some((item) => checklistResultOf(block, item.key) === 'C');
}

/** True when any stored checklist result was answered by the engineer (a `na_defaults` NA alone is not an answer). */
function anyAnswered(block: BlockRow): boolean {
  return Object.values(block.sheet.checklist).some((item) => isCellFilled(item.result));
}

/**
 * The amber suggestion row's pair (Story 5.8 AC 1): Aprovado, with Com restrições when any
 * row is NC or any reading is out of criterion, else Sem restrições. Null when the sheet
 * is marked not tested, once any segment is set, or while nothing is measured and nothing
 * answered. Never Reprovado.
 */
export function suggestConclusionPair(block: BlockRow): ConclusionPair | null {
  if (block.not_tested !== null) return null;
  if (isCellFilled(block.sheet.conclusion.result) || isCellFilled(block.sheet.conclusion.restriction)) return null;
  const definition = definitionOf(block);
  if (definition === null) return null;
  const cells = evaluatedCells(evaluateSheetReadings(block, definition));
  const measured = cells.some((cell) => cell.role === 'capture' && cell.state === 'measured');
  if (!measured && !anyAnswered(block)) return null;
  const restricted = ncItems(block, definition).length > 0 || cells.some((cell) => cell.verdict === 'out');
  return { result: 'aprovado', restriction: restricted ? 'com_restricoes' : 'sem_restricoes' };
}

const RESULT_WORDS: Readonly<Record<ConclusionResult, string>> = { aprovado: 'Aprovado', reprovado: 'Reprovado' };
const RESTRICTION_WORDS: Readonly<Record<ConclusionRestriction, string>> = { sem_restricoes: 'Sem restrições', com_restricoes: 'Com restrições' };

/** The suggestion row's words: "Aprovado · Sem restrições?". */
export function conclusionSuggestionText(pair: ConclusionPair): string {
  return `${RESULT_WORDS[pair.result]} · ${RESTRICTION_WORDS[pair.restriction]}?`;
}

/** The inline warning of Sem restrições beside an NC row (allowed, EXPERIENCE.md › Conclusion control). */
export function restrictionWarning(block: BlockRow): string | null {
  if (conclusionRestrictionOf(block) !== 'sem_restricoes') return null;
  const definition = definitionOf(block);
  return definition !== null && ncItems(block, definition).length > 0 ? 'Há itens não conformes' : null;
}

/**
 * Story 12.4 (J-10, D-7; `source-deltas.md` row 52): the sheet observation the NC items
 * already wrote, suggested while the sheet observation is empty: one line "Item ⟨n⟩:
 * ⟨observação⟩" per NC item that carries an observation, in checklist order, `n` the row
 * number. Null when the sheet observation holds text, the observation or checklist
 * sub-block is off, the sheet is marked not tested, or no NC item has an observation. It is
 * written only by its own "Confirmar" or with the conclusion text's confirm.
 */
export function suggestedSheetObservation(block: BlockRow, definition: BlockDefinition): string | null {
  if (block.not_tested !== null || !enabledSubBlocksOf(block).has('observations')) return null;
  if (isCellFilled(block.sheet.observations)) return null;
  const lines = ncItems(block, definition)
    .filter((item): item is { n: number; label: string; observation: string } => item.observation !== null && item.observation !== '')
    .map((item) => `Item ${item.n}: ${item.observation}`);
  return lines.length === 0 ? null : lines.join('\n');
}

/** Com restrições makes the sheet observation required (Story 5.8 AC 2). */
export function observationRequired(block: Pick<BlockRow, 'sheet'>): boolean {
  return conclusionRestrictionOf(block) === 'com_restricoes';
}

// --- the composed paragraph -----------------------------------------------------------

// authored: the subject of the paragraph, with its article, one per block type.
const NOUNS: Readonly<Record<EquipmentBlockType, { noun: string; plural: boolean }>> = {
  cabos_entrada: { noun: 'Os cabos de entrada', plural: true },
  para_raio: { noun: 'O para-raio', plural: false },
  chave_seccionadora: { noun: 'A seccionadora', plural: false },
  disjuntor_mt: { noun: 'O disjuntor', plural: false },
  tp: { noun: 'O TP', plural: false },
  tc: { noun: 'O TC', plural: false },
  cabos_saida: { noun: 'Os cabos de saída', plural: true },
  transformador_forca: { noun: 'O transformador', plural: false },
};

// authored: the recommendation that follows a restricted or failed result.
const RECOMMENDATION = 'Recomenda-se a correção dos pontos indicados antes da próxima manutenção.';

const TEST_WORDS: Readonly<Record<TestKey, { phrase: string; symbol: string }>> = {
  isolacao: { phrase: 'resistência de isolação mínima de', symbol: 'R_iso' },
  resistencia_contato: { phrase: 'resistência de contato máxima de', symbol: 'R_cont' },
  relacao_transformacao: { phrase: 'desvio de relação de transformação de', symbol: 'RT' },
};

const VOLTAGE_KEYS = ['tensao_de_placa', 'tensao_nominal', 'tensao_nominal_at'];

/** A nameplate value as the paragraph names it: numbers pt-BR with their unit, a voltage class with " kV". */
function identityPart(block: BlockRow, definition: BlockDefinition, keys: readonly string[]): string | null {
  for (const key of keys) {
    const field = definition.nameplate.find((f) => f.key === key);
    const cell = block.sheet.nameplate[key];
    if (field === undefined || !isCellFilled(cell)) continue;
    const value = cell!.value;
    if (typeof value === 'string') {
      const text = value.trim();
      if (field.kind === 'voltage_class' || field.unit === 'kV') return /kv$/i.test(text) ? text : `${text} kV`;
      return text;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'raw' in value) {
      const v = value as { raw: string; unit?: string | null; state?: string };
      if (v.state !== 'measured') continue;
      const unit = v.unit ?? field.unit ?? null;
      return unit === null ? formatDecimalGroupedPtBr(v.raw) : `${formatDecimalGroupedPtBr(v.raw)} ${unit}`;
    }
  }
  return null;
}

export interface ComposedConclusion {
  /** The paragraph ("A seccionadora SEC-C05 (Celtta, 15 kV, 630 A) apresentou …"). */
  text: string;
  /** The criteria line's items, in the order the text uses them ("R_iso T1–T2 330 MΩ · critério >400 MΩ", "item 8 NC"). */
  criteriaItems: string[];
  /** The criteria line: the items joined " · ". */
  criteriaLine: string;
  /** FNV-1a hex of the canonical JSON of every input used. */
  basis: string;
}

function readingClause(reading: WorstReading): string {
  return `${TEST_WORDS[reading.testKey].phrase} ${reading.valueText} em ${reading.where} (critério: ${reading.criterionText}, ${reading.sourceName})`;
}

/** Keys sorted at every level, so the same inputs always hash the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 32-bit FNV-1a over the UTF-16 code units, as 8 hex digits. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * FR-30: the conclusion paragraph composed on the device from the sheet's own values, one
 * fixed template per block type: the identity from the nameplate, each test's worst
 * reading when it is out of criterion (else "valores medidos dentro dos critérios de
 * aceitação", only when a capture was judged), the NC items with their observations (else
 * "todos os itens verificados conformes", only with a C row), a clause saying what was not
 * recorded (E5-Q4) and, when restricted or failed, the recommendation. No network, no model.
 */
export function composeConclusion(block: BlockRow, definition: BlockDefinition, equipmentTag: string): ComposedConclusion {
  const noun = NOUNS[definition.block_type];
  const fabricacao = identityPart(block, definition, ['fabricacao']);
  const tensao = identityPart(block, definition, VOLTAGE_KEYS);
  const corrente = identityPart(block, definition, ['corrente_nominal']);
  const identity = [fabricacao, tensao, corrente].filter((part): part is string => part !== null && part !== '');
  const tag = equipmentTag.trim();
  const subject = [noun.noun, tag === '' ? null : tag, identity.length === 0 ? null : `(${identity.join(', ')})`].filter((part) => part !== null).join(' ');

  const evaluations = evaluateSheetReadings(block, definition);
  const cells = evaluatedCells(evaluations);
  const worst = worstReadings(evaluations);
  const out = worst.filter((reading) => reading.verdict === 'out');
  // E5-Q4: "within the criteria" only when a capture was judged; "conformes" only with a C row.
  const judged = out.length > 0 || cells.some((cell) => cell.role === 'capture' && cell.verdict !== null);
  // A capture measured but never judged (a TTR row with no VAL CALCULADO) is still a measurement.
  const measured = cells.some((cell) => cell.role === 'capture' && cell.state === 'measured');
  // authored (OQ-3 placeholder): measured, no criterion applied.
  const unjudged = 'valores medidos sem comparação com o critério de aceitação';
  const readings = out.length > 0 ? listPtBr(out.map(readingClause)) : judged ? 'valores medidos dentro dos critérios de aceitação' : unjudged;
  const hasReadings = judged || measured;
  const ncs = ncItems(block, definition);
  const conformes = anyConforme(block, definition);
  const checked = ncs.length > 0 || conformes;
  const checklist =
    ncs.length === 0 ? 'todos os itens verificados conformes' : listPtBr(ncs.map((item) => `${item.observation ?? item.label.toLocaleLowerCase('pt-BR')} (item ${item.n}, NC)`));

  const result = conclusionResultOf(block);
  const restriction = conclusionRestrictionOf(block);
  const recommend = restriction === 'com_restricoes' || result === 'reprovado';
  const verb = noun.plural ? 'apresentaram' : 'apresentou';
  // authored (OQ-3 placeholder): the sentence states only what exists.
  const body =
    hasReadings && checked
      ? `${verb} ${readings} e ${checklist}`
      : hasReadings
        ? `${verb} ${readings}, sem itens verificados registrados`
        : checked
          ? `${verb} ${checklist}, sem valores medidos registrados`
          : `não ${verb} valores medidos nem itens verificados registrados`;
  const text = `${subject} ${body}.${recommend ? ` ${RECOMMENDATION}` : ''}`;

  const criteriaItems = [
    ...worst.map((reading) => `${TEST_WORDS[reading.testKey].symbol} ${reading.where} ${reading.valueText} · critério ${reading.criterionText}`),
    ...ncs.map((item) => `item ${item.n} NC`),
  ];

  const basis = fnv1a(
    canonicalJson({
      pair: { result, restriction },
      identity: { tag, fabricacao, tensao, corrente },
      judged,
      measured,
      conformes,
      readings: cells.map((cell) => ({ a: cell.address, s: cell.state, r: cell.raw, u: cell.unit, f: cell.fallback?.raw ?? null, v: cell.verdict })),
      nc: ncs,
    }),
  );

  return { text, criteriaItems, criteriaLine: criteriaItems.join(' · '), basis };
}

export type ConclusionTextState = 'unconfirmed' | 'confirmed' | 'edited' | 'stale';

function storedText(block: Pick<BlockRow, 'sheet'>, key: 'text' | 'text_status' | 'text_basis'): string | null {
  const value = block.sheet.conclusion[key]?.value;
  return typeof value === 'string' ? value : null;
}

/** The stored text status, or null while unconfirmed. */
export function conclusionTextStatusOf(block: Pick<BlockRow, 'sheet'>): ConclusionTextStatus | null {
  const status = storedText(block, 'text_status');
  return status === 'confirmed' || status === 'edited' ? status : null;
}

/**
 * Where the Generated text field stands (AR-11): `unconfirmed` (the composed text shows and
 * recomposes), `confirmed` or `edited` (the stored text shows), `stale` (stored, but the
 * values changed since: "Sugerido: texto atualizado — Substituir", never an overwrite).
 */
export function conclusionTextState(block: Pick<BlockRow, 'sheet'>, composed: Pick<ComposedConclusion, 'basis'>): ConclusionTextState {
  const status = conclusionTextStatusOf(block);
  if (status === null) return 'unconfirmed';
  return storedText(block, 'text_basis') === composed.basis ? status : 'stale';
}

/**
 * E5-A4: true when the pair is complete, the way the sheet's progress counts it
 * (`sheet-progress.ts`): a result and a restriction are both set.
 */
export function conclusionPairComplete(block: Pick<BlockRow, 'sheet'>): boolean {
  return conclusionResultOf(block) !== null && conclusionRestrictionOf(block) !== null;
}

/**
 * The stored text the renderer prints, or null ("not printable") while the text is
 * unconfirmed or the pair it concludes is incomplete (E5-A4: a result or a restriction
 * cleared after the confirm leaves the confirmed text unprintable until the pair is set again).
 */
export function conclusionTextForPrint(block: Pick<BlockRow, 'sheet'>): string | null {
  if (conclusionTextStatusOf(block) === null || !conclusionPairComplete(block)) return null;
  const text = storedText(block, 'text');
  return text === null || text.trim() === '' ? null : text;
}

/**
 * E5-A4: true when the text composed from `block` now still has `basis`, the basis of the
 * text the engineer saw. A confirm checks it against the freshest block before it writes, so
 * a value changed between the render and the tap never stores a text under a basis it was
 * not composed from.
 */
export function conclusionBasisMatches(block: BlockRow, definition: BlockDefinition, equipmentTag: string, basis: string): boolean {
  return composeConclusion(block, definition, equipmentTag).basis === basis;
}

/** The stored conclusion text, or null. */
export function conclusionStoredText(block: Pick<BlockRow, 'sheet'>): string | null {
  return storedText(block, 'text');
}
