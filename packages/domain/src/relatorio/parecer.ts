import { artLabel } from '../print/document-control.ts';
import { livePoints } from '../points/checks.ts';
import { hasPointSource } from '../points/derived.ts';
import type { BlockRow, RelatorioParecer } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { isCompanyBlockType } from '../schemas/block-config.ts';
import { blockDefinitionIn, findSeed, snapshotDefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { isDefectReason } from '../seed/defect-reason.ts';
import { canonicalJson, fnv1a } from '../text/hash.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { effectiveConclusionPair } from './conclusion.ts';
import { naoEnsaiadasText } from './progress.ts';
import { measurementCells } from './measurement-evaluation.ts';
import { choiceOnlyFailureText, evaluatedCells, failedRatioRows, type FailedRatioRow } from './readings.ts';
import { failedPrerequisites } from './restriction.ts';
import { sheetMeasurements, sheetReadings } from './sheet-evaluation.ts';
import { sectionRefText } from './section-position.ts';
import { checklistResultUnder } from './sheet-progress.ts';
import { siteNcCount, siteNcItems } from './site-checklist.ts';
import { enabledSubBlocksOf, isEquipmentBlock, sheetState } from './sheet-state.ts';
import { locationTree, treeNodes } from './tree.ts';
import { visitContextOf, type VisitContext } from './visit-context.ts';

/*
 * Story 7.4 (FR-71, UX-DR45): the relatório's parecer, the one verdict section 10 prints in
 * its box. Everything the band and the printed box say is derived here, once (AD-2).
 * ~~The suggestion ("Apto?" / "Apto com restrições?", never Não apto, never set by the app)~~
 * Story 22.6 (2026-11-06, Bruno; amends FR-71 and NFR-10): the verdict is derived from the
 * fichas' effective pairs (`derivedParecer`), the engineer may only choose a stricter one
 * (`effectiveParecer`), and the summary is always the composed one (`composeParecer`); a
 * summary typed before keeps printing after it as "Observações do responsável"
 * (`parecerOwnText`). NFR-12 holds: all of it is computed on the device, never by a model.
 * The stored value is `setup.parecer`, one LWW object.
 */

export type ParecerVerdict = RelatorioParecer['verdict'];
export type ParecerTextStatus = NonNullable<RelatorioParecer['text_status']>;

export const PARECER_VERDICTS: readonly ParecerVerdict[] = ['apto', 'apto_com_restricoes', 'nao_apto'];

// Verbatim from `50-relatorio-setup.html` `#setup-parecer` (the segments and the box's verdict line).
const VERDICT_LABELS: Readonly<Record<ParecerVerdict, string>> = {
  apto: 'Apto',
  apto_com_restricoes: 'Apto com restrições',
  nao_apto: 'Não apto',
};

/** The verdict word: "Apto", "Apto com restrições", "Não apto". */
export function parecerVerdictLabel(verdict: ParecerVerdict): string {
  return VERDICT_LABELS[verdict];
}

export type ParecerBoxTone = 'apto' | 'restricoes' | 'nao-apto';

const TONES: Readonly<Record<ParecerVerdict, ParecerBoxTone>> = {
  apto: 'apto',
  apto_com_restricoes: 'restricoes',
  nao_apto: 'nao-apto',
};

/** The `data-verdict` of the Parecer box and the `data-value` of its segment (`components.css`). */
export function parecerBoxTone(verdict: ParecerVerdict): ParecerBoxTone {
  return TONES[verdict];
}

/** The stored parecer, or null while no verdict was tapped. */
export function parecerOf(snapshot: Pick<RelatorioSnapshot, 'relatorio'>): RelatorioParecer | null {
  return snapshot.relatorio.setup.parecer ?? null;
}

// --- the sheets the parecer counts --------------------------------------------------------

interface CountedSheet {
  block: BlockRow;
  /** Story 14.6: the block's definition, a company type's through the snapshot's context; null when none resolves. */
  definition: BlockDefinition | null;
  /** The TAG, else the block type's name. */
  name: string;
  /** Batch e23v (Stories 23.5 and 23.6): the sheet's visit context (`visitContextOf`), which every judgement below reads. */
  visit: VisitContext;
}

/** The live equipment sheets in tree order (the section 9 order), each with the name the text uses. */
function countedSheets(snapshot: RelatorioSnapshot): CountedSheet[] {
  const order = new Map<string, { index: number; name: string }>();
  treeNodes(locationTree(snapshot)).forEach((node, index) => {
    if (node.kind === 'equipment') order.set(node.blockId, { index, name: node.name });
  });
  const tags = new Map(snapshot.equipment.map((row) => [row.id, row.tag]));
  const ctx = snapshotDefinitionContext(snapshot);
  return snapshot.blocks
    .filter((block) => block.removed_at === null && isEquipmentBlock(block))
    .map((block) => {
      const known = order.get(block.id);
      const tag = block.equipment_id === null ? '' : (tags.get(block.equipment_id)?.trim() ?? '');
      const definition = blockDefinitionIn(ctx, block);
      // A company type is named by its label, never its `type:` key.
      const typeName = isCompanyBlockType(block.block_type) ? (definition?.label ?? block.block_type) : block.block_type;
      return { block, definition, name: known?.name ?? (tag === '' ? typeName : tag), index: known?.index ?? Number.MAX_SAFE_INTEGER, visit: visitContextOf(snapshot, block) };
    })
    .sort((a, b) => a.index - b.index || (a.block.id < b.block.id ? -1 : 1))
    .map(({ block, definition, name, visit }) => ({ block, definition, name, visit }));
}

/**
 * A sheet that carries a restriction: marked not tested, or (Story 22.4) its effective
 * restriction is Com restrições, which an NC row, an observation, a failed ratio row or any
 * reading out of criterion sets through the floor whatever the stored pair says.
 */
function restricted(block: BlockRow, definition: BlockDefinition | null, visit: VisitContext): boolean {
  if (block.not_tested !== null) return true;
  return effectiveConclusionPair(block, definition, visit).restriction === 'com_restricoes';
}

/** Story 22.6: a sheet whose effective result is Reprovado (a not tested sheet with a defect reason included). */
function reprovado(block: BlockRow, definition: BlockDefinition | null, visit: VisitContext): boolean {
  return effectiveConclusionPair(block, definition, visit).result === 'reprovado';
}

/**
 * Story 22.6: a tested sheet with a reading out of criterion other than a ratio row (an
 * insulation or contact capture, a measurement-table cell); the failed ratio has its own clause.
 */
function outReading(block: BlockRow, definition: BlockDefinition | null, visit: VisitContext): boolean {
  if (block.not_tested !== null) return false;
  if (definition === null) return false;
  const plain = sheetReadings(block, definition, visit).filter((test) => test.testKey !== 'relacao_transformacao');
  return evaluatedCells(plain).some((cell) => cell.verdict === 'out') || measurementCells(sheetMeasurements(block, definition, visit)).some((cell) => cell.verdict === 'out');
}

/**
 * Story 17.5: the ratio rows INSATISFATÓRIO of a live sheet, read through the one kernel
 * reader (`failedRatioRows`); empty when its seed is unknown or its ratio sub-block is off.
 */
function failedRatioRowsOf(block: BlockRow, definition: BlockDefinition | null, visit: VisitContext): FailedRatioRow[] {
  if (definition === null) return [];
  return failedRatioRows(sheetReadings(block, definition, visit));
}

/** The enabled checklist's NC items of a live sheet: their 1-based number and label. */
function ncItemsOf(block: BlockRow, definition: BlockDefinition | null): { n: number; label: string }[] {
  if (!enabledSubBlocksOf(block).has('checklist')) return [];
  if (definition === null || definition.checklist === null) return [];
  return definition.checklist.flatMap((item, index) => (checklistResultUnder(block, item.key, definition) === 'NC' ? [{ n: index + 1, label: item.label }] : []));
}

/** A not-tested sheet's reason as the summary names it: "impossibilidade de desligamento", the typed text for "Outro". */
function notTestedReason(block: BlockRow): string | null {
  const mark = block.not_tested;
  if (mark === null) return null;
  const typed = mark.text !== null && mark.text.trim() !== '' ? mark.text.trim() : null;
  if (mark.reason === 'outro' && typed !== null) return typed;
  const label = findSeed(block.seed_version)?.not_tested_reasons.find((reason) => reason.key === mark.reason)?.label;
  return (label ?? mark.reason).toLocaleLowerCase('pt-BR');
}

// --- the derived verdict -----------------------------------------------------------------

const VERDICT_RANK: Readonly<Record<ParecerVerdict, number>> = { apto: 1, apto_com_restricoes: 2, nao_apto: 3 };

/**
 * Story 22.6 (Bruno, 2026-11-06, item 26; amends FR-71 and NFR-10): the verdict the fichas
 * give. Não apto when any live sheet is effectively Reprovado (Story 22.4); Apto com
 * restrições when any sheet is Com restrições, any sheet is Não ensaiado (another reason), any
 * live local holds an NC site item, or any point of attention exists (section 8's entries,
 * ~~the derived ones included~~); Apto otherwise. Fix batch e24h (2026-11-10): the findings a
 * point can be written from no longer list as points, and still floor the verdict
 * (`hasPointSource`), so no verdict moves: a finding with no point of its own floored it before
 * through its automatic entry. ~~Always one: the "Parecer não preenchido" row
 * retires with it.~~ e22f S5 (integrated review): "Apto" needs a judged sheet: while no sheet is
 * concluded and nothing gives a stricter verdict, there is none (null), so a relatório nothing
 * was judged in never reads "Apto", and issuing stays blocked by "Parecer não preenchido" until a
 * sheet is concluded or the engineer taps a verdict. A stricter verdict stands without a
 * concluded sheet: it is a floor (an NC site item, a point, a defect, a reading out).
 */
export function derivedParecer(snapshot: RelatorioSnapshot): ParecerVerdict | null {
  const sheets = countedSheets(snapshot);
  if (sheets.some(({ block, definition, visit }) => reprovado(block, definition, visit))) return 'nao_apto';
  if (sheets.some(({ block, definition, visit }) => restricted(block, definition, visit))) return 'apto_com_restricoes';
  if (siteNcCount(snapshot) > 0 || livePoints(snapshot.points).length > 0 || hasPointSource(snapshot)) return 'apto_com_restricoes';
  return sheets.some(({ block }) => sheetState(block) === 'concluida') ? 'apto' : null;
}

/** Story 22.6: whether a verdict is looser than the derived one, so Etapa 6 disables its segment. */
export function parecerLooser(snapshot: RelatorioSnapshot, verdict: ParecerVerdict): boolean {
  const derived = derivedParecer(snapshot);
  return derived !== null && VERDICT_RANK[verdict] < VERDICT_RANK[derived];
}

/**
 * Story 22.6: the verdict every reader shows and section 10 prints: the stored one when it is
 * stricter than the derived one (the engineer chose it), else the derived one. A stored verdict
 * looser than what the fichas now give is never shown. e22f S5: null while neither exists
 * (nothing judged, no verdict tapped): "Parecer não preenchido" blocks issuing, section 10
 * prints `[Parecer]`.
 */
export function effectiveParecer(snapshot: RelatorioSnapshot): ParecerVerdict | null {
  const derived = derivedParecer(snapshot);
  const stored = parecerOf(snapshot)?.verdict ?? null;
  if (derived === null) return stored;
  return stored !== null && VERDICT_RANK[stored] > VERDICT_RANK[derived] ? stored : derived;
}

/**
 * Story 22.6: the line under the verdict segments naming why the looser ones are disabled:
 * "O relatório exige no mínimo Não apto: 1 ficha reprovada (TR-1)." Null under Apto (nothing
 * is disabled). The counts are `parecerCounts`', so the line and the Critérios line agree.
 */
export function parecerReasonText(snapshot: RelatorioSnapshot): string | null {
  const derived = derivedParecer(snapshot);
  if (derived === null || derived === 'apto') return null;
  const counts = parecerCounts(snapshot);
  // Fix batch e24h: the stored live points only.
  const points = livePoints(snapshot.points).length;
  // authored (Story 22.6, open for Bruno): the reason line of the disabled verdicts.
  const parts =
    derived === 'nao_apto'
      ? [`${plural(counts.reprovado.length, 'ficha reprovada', 'fichas reprovadas')} (${listPtBr(counts.reprovado)})`]
      : [
          counts.withRestriction.length > 0 ? `${counts.withRestriction.length} com restrições` : null,
          counts.notTested.length > 0 ? naoEnsaiadasText(counts.notTested.length) : null,
          counts.siteNc > 0 ? `${plural(counts.siteNc, 'NC', 'NC')} nas verificações do local` : null,
          points > 0 ? plural(points, 'ponto de atenção', 'pontos de atenção') : null,
        ].filter((part): part is string => part !== null);
  return `O relatório exige no mínimo ${parecerVerdictLabel(derived)}: ${listPtBr(parts)}.`;
}

// --- the counts ------------------------------------------------------------------------------

export interface ParecerCounts {
  /** The live equipment sheets. */
  total: number;
  /** Sheets concluded (`sheetState === 'concluida'`); a not tested sheet is counted apart, never here. */
  concluded: number;
  /** The not tested sheets, in tree order, with the reason the summary names. */
  notTested: { name: string; reason: string | null }[];
  /** Sheets neither concluded nor not tested. */
  open: number;
  /** The TAGs of the tested sheets with a restriction, in tree order; e22f N1: a Reprovado sheet is named under `reprovado` alone. */
  withRestriction: string[];
  /** 2026-10-14: the site items answered NC on the live locals (`siteNcCount`). */
  siteNc: number;
  /** Story 22.6: the names of the sheets effectively Reprovado, in tree order (a not tested one with a defect reason included). */
  reprovado: string[];
  /** Story 22.6: the names of the tested sheets with a reading out of criterion other than a ratio row, in tree order. */
  outReadings: string[];
}

/**
 * E78-Q9: the one set of counts the parecer band states, read by both the reason line
 * (`parecerReasonText`) and the composed summary with its Critérios line (`composeParecer`).
 */
export function parecerCounts(snapshot: RelatorioSnapshot): ParecerCounts {
  const sheets = countedSheets(snapshot);
  const concluded = sheets.filter(({ block }) => sheetState(block) === 'concluida').length;
  const notTested = sheets.filter(({ block }) => block.not_tested !== null).map(({ block, name }) => ({ name, reason: notTestedReason(block) }));
  const withRestriction = sheets.filter(({ block, definition, visit }) => block.not_tested === null && restricted(block, definition, visit) && !reprovado(block, definition, visit)).map(({ name }) => name);
  const reprovados = sheets.filter(({ block, definition, visit }) => reprovado(block, definition, visit)).map(({ name }) => name);
  const outReadings = sheets.filter(({ block, definition, visit }) => outReading(block, definition, visit)).map(({ name }) => name);
  return {
    total: sheets.length,
    concluded,
    notTested,
    open: sheets.length - concluded - notTested.length,
    withRestriction,
    siteNc: siteNcCount(snapshot),
    reprovado: reprovados,
    outReadings,
  };
}

// --- the composed summary -------------------------------------------------------------------

export interface ComposedParecer {
  /** The summary paragraph: counts only, never a sentence stating a verdict. */
  text: string;
  /** The Criteria line's items, in the order the text uses them. */
  criteriaItems: string[];
  /** The items joined " · ". */
  criteriaLine: string;
  /** FNV-1a hex of the canonical JSON of every count and name the text used. */
  basis: string;
}

// authored (e22f N1, open for Bruno): why a Reprovado sheet was reprovada, as its sentence names it.
// authored (e22g, review N4, listed for Bruno): a sheet Não ensaiado for a defect reason (`isDefectReason`) is "por defeito no equipamento", never "outro motivo".
const REPROVADO_REASONS = {
  ratio: 'relação de transformação insatisfatória',
  // Batch e23e (Story 23.18, review fix): a ratio failed by its choice alone; its words are the kernel's choice texts (`choiceOnlyFailureText`), set per summary.
  choice: '',
  reading: 'leituras fora do critério de aceitação',
  // authored (e23w, listed for Bruno): a sheet reprovada only by a test's failed prerequisite, the floor's word
  // (`FLOOR_REASON_WORDS.prerequisite`, W2-K1), repeated here: the parecer loads before the conclusion in the import order.
  prerequisite: 'pré-requisito do ensaio não atendido',
  defect: 'defeito no equipamento',
  other: 'outro motivo',
} as const;

/**
 * e22f N1: the Reprovado sentence, each sheet named once with the reason that reproved it (a
 * failed ratio first, then a reading out of criterion, then any other: a defect reason, the
 * engineer's own Reprovado): "1 ficha foi reprovada por relação de transformação
 * insatisfatória (TR-1).", "3 fichas foram reprovadas: 1 por relação de transformação
 * insatisfatória (TR-1) e 2 por leituras fora do critério de aceitação (PR-ENEL e DJ-01).";
 * with no ratio or reading reason, the names alone, as Story 22.6 printed them.
 */
function reprovadoSentence(count: number, byReason: Record<keyof typeof REPROVADO_REASONS, string[]>, choiceWords: string): string {
  // authored (Story 22.6, open for Bruno): the Reprovado sheets sentence.
  const head = count === 1 ? '1 ficha foi reprovada' : `${count} fichas foram reprovadas`;
  const words: Record<keyof typeof REPROVADO_REASONS, string> = { ...REPROVADO_REASONS, choice: choiceWords };
  const groups = (Object.keys(REPROVADO_REASONS) as (keyof typeof REPROVADO_REASONS)[]).filter((key) => byReason[key].length > 0);
  if (groups.length === 1 && groups[0] === 'other') return `${head} (${listPtBr(byReason.other)}).`;
  if (groups.length === 1) return `${head} por ${words[groups[0]!]} (${listPtBr(byReason[groups[0]!])}).`;
  return `${head}: ${listPtBr(groups.map((key) => `${byReason[key].length} por ${words[key]} (${listPtBr(byReason[key])})`))}.`;
}

/** "item 8 (contatos)", the checklist item as the summary groups it. */
function ncItemName(item: { n: number; label: string }): string {
  return `item ${item.n} (${item.label.toLocaleLowerCase('pt-BR')})`;
}

/**
 * FR-71: the summary, composed from the relatório's own counts (Story 22.6: always this
 * text, never confirmed, edited or replaced; it names the Reprovado sheets and the readings
 * out of criterion too): fichas concluídas of the total, not tested sheets with TAG and reason, sheets
 * with restrictions by TAG, NC rows grouped by checklist item, the live locals' NC site items
 * (2026-10-14) grouped by item, and the points of attention. No priority counts (source-deltas
 * row 29), no verdict sentence.
 */
export function composeParecer(snapshot: RelatorioSnapshot): ComposedParecer {
  const sheets = countedSheets(snapshot);
  const { total, concluded, notTested, open, withRestriction, reprovado: reprovados } = parecerCounts(snapshot);
  const ncGroups = new Map<string, { n: number; label: string; sheets: number }>();
  for (const { block, definition } of sheets) {
    if (block.not_tested !== null) continue;
    for (const item of ncItemsOf(block, definition)) {
      const key = `${item.n}:${item.label}`;
      const group = ncGroups.get(key);
      if (group === undefined) ncGroups.set(key, { ...item, sheets: 1 });
      else group.sheets += 1;
    }
  }
  const nc = [...ncGroups.values()].sort((a, b) => a.n - b.n || (a.label < b.label ? -1 : 1));
  // Story 17.5: the tested sheets with a ratio row INSATISFATÓRIO, by name in tree order.
  const ratioSheets = sheets.filter(({ block, definition, visit }) => block.not_tested === null && failedRatioRowsOf(block, definition, visit).length > 0);
  // e22f N1: a Reprovado sheet is named once, in the Reprovado sentence with its reason; the
  // ratio and out-reading sentences name only the others.
  const reprovadoSet = new Set(sheets.filter(({ block, definition, visit }) => reprovado(block, definition, visit)).map(({ block }) => block.id));
  // Batch e23e (Story 23.18, review fix): a sheet whose every failed ratio row fails by its choice alone (a polarity INVERTIDA)
  // is named by the choice's words, never "relação de transformação insatisfatória"; none on v1 to v12.
  const choiceTexts = new Map(ratioSheets.flatMap(({ block, definition, visit }) => {
    const text = choiceOnlyFailureText(failedRatioRowsOf(block, definition, visit));
    return text === null ? [] : [[block.id, text] as const];
  }));
  const choiceWords = listPtBr([...new Set(choiceTexts.values())]);
  const ratio = ratioSheets.filter(({ block }) => !reprovadoSet.has(block.id) && !choiceTexts.has(block.id)).map(({ name }) => name);
  const choiceOnly = ratioSheets.filter(({ block }) => !reprovadoSet.has(block.id) && choiceTexts.has(block.id)).map(({ name }) => name);
  const outOthers = sheets.filter(({ block, definition, visit }) => !reprovadoSet.has(block.id) && outReading(block, definition, visit)).map(({ name }) => name);
  const ratioIds = new Set(ratioSheets.map(({ block }) => block.id));
  const byReason = { ratio: [] as string[], choice: [] as string[], reading: [] as string[], prerequisite: [] as string[], defect: [] as string[], other: [] as string[] };
  for (const { block, definition, name, visit } of sheets) {
    if (!reprovadoSet.has(block.id)) continue;
    if (choiceTexts.has(block.id)) byReason.choice.push(name);
    else if (ratioIds.has(block.id)) byReason.ratio.push(name);
    else if (outReading(block, definition, visit)) byReason.reading.push(name);
    // Fix batch e23w (W2-K1, seed v13): reprovada by a failed prerequisite (the arrester's disconnector) and by no ratio or reading.
    else if (block.not_tested === null && definition !== null && failedPrerequisites(block, definition).length > 0) byReason.prerequisite.push(name);
    else if (block.not_tested !== null && isDefectReason(block.seed_version, block.not_tested.reason)) byReason.defect.push(name);
    else byReason.other.push(name);
  }
  const site = siteNcItems(snapshot).map((item) => ({ n: item.number, label: item.label, locals: item.locals.length }));
  // Fix batch e24h: the stored live points only (the sentence, the Critérios item and the basis).
  const points = livePoints(snapshot.points).length;

  // authored (open question for Bruno): the summary states counts only, never a verdict.
  const sentences: string[] = [];
  if (total === 0) {
    sentences.push('Nenhuma ficha de ensaio registrada neste relatório.');
  } else {
    const done = concluded === 0 ? null : `${concluded} ${concluded === 1 ? 'concluída' : 'concluídas'}`;
    const untested =
      notTested.length === 0
        ? null
        : `${naoEnsaiadasText(notTested.length)} (${notTested.map((entry) => (entry.reason === null ? entry.name : `${entry.name}, por ${entry.reason}`)).join('; ')})`;
    const pending = open > 0 ? `${open} ${open === 1 ? 'ainda não concluída' : 'ainda não concluídas'}` : null;
    const registered = total === 1 ? 'Foi registrada 1 ficha de ensaio' : `Foram registradas ${total} fichas de ensaio`;
    sentences.push(`${registered}: ${listPtBr([done, untested, pending].filter((part): part is string => part !== null))}.`);
    if (reprovados.length > 0) sentences.push(reprovadoSentence(reprovados.length, byReason, choiceWords));
    if (withRestriction.length > 0) {
      sentences.push(
        `${withRestriction.length === 1 ? '1 ficha apresentou' : `${withRestriction.length} fichas apresentaram`} restrições (${listPtBr(withRestriction)}).`,
      );
    }
    if (nc.length > 0) {
      sentences.push(`Itens não conformes: ${listPtBr(nc.map((group) => `${ncItemName(group)} em ${plural(group.sheets, 'ficha', 'fichas')}`))}.`);
    }
    if (ratio.length > 0) {
      // authored (Story 17.5, open for Bruno): the failed ratio sentence.
      sentences.push(`Relação de transformação insatisfatória em ${plural(ratio.length, 'ficha', 'fichas')} (${listPtBr(ratio)}).`);
    }
    if (choiceOnly.length > 0) {
      // authored (Story 23.18, listed for Bruno): a ratio failed by its choice alone, "Polaridade invertida em 1 ficha (TC-ENEL)."
      sentences.push(`${choiceWords.charAt(0).toLocaleUpperCase('pt-BR')}${choiceWords.slice(1)} em ${plural(choiceOnly.length, 'ficha', 'fichas')} (${listPtBr(choiceOnly)}).`);
    }
    if (outOthers.length > 0) {
      // authored (Story 22.6, open for Bruno): the out-of-criterion readings sentence.
      sentences.push(`Leituras fora do critério de aceitação em ${plural(outOthers.length, 'ficha', 'fichas')} (${listPtBr(outOthers)}).`);
    }
  }
  if (site.length > 0) {
    // authored: 2026-10-14, the site NC sentence (open for Bruno).
    sentences.push(`Verificações do local não conformes: ${listPtBr(site.map((item) => `${ncItemName(item)} em ${plural(item.locals, 'local', 'locais')}`))}.`);
  }
  // F43 (UX pass 2026-10-22): section 8 named by its Sumário position.
  if (points > 0) sentences.push(`${points === 1 ? 'Foi registrado 1 ponto de atenção' : `Foram registrados ${points} pontos de atenção`} na ${sectionRefText(snapshot, 8)}.`);
  const text = sentences.join(' ');

  const criteriaItems = [
    plural(total, 'ficha', 'fichas'),
    `${concluded} ${concluded === 1 ? 'concluída' : 'concluídas'}`,
    ...(notTested.length > 0 ? [`${naoEnsaiadasText(notTested.length)} (${notTested.map((entry) => entry.name).join(', ')})`] : []),
    // authored (Story 22.6, open for Bruno): the Critérios item of the Reprovado sheets.
    ...(reprovados.length > 0 ? [`${plural(reprovados.length, 'reprovada', 'reprovadas')} (${reprovados.join(', ')})`] : []),
    ...(withRestriction.length > 0 ? [`${withRestriction.length} com restrições (${withRestriction.join(', ')})`] : []),
    ...nc.map((group) => `item ${group.n} NC (${group.sheets})`),
    // authored (Story 17.5, open for Bruno): the Critérios item of the failed ratios.
    ...(ratio.length > 0 ? [`relação de transformação insatisfatória (${ratio.join(', ')})`] : []),
    // authored (Story 23.18, listed for Bruno): the Critérios item of a ratio failed by its choice alone.
    ...(choiceOnly.length > 0 ? [`${choiceWords} (${choiceOnly.join(', ')})`] : []),
    // authored (Story 22.6, open for Bruno): the Critérios item of the out-of-criterion readings.
    ...(outOthers.length > 0 ? [`leituras fora do critério (${outOthers.join(', ')})`] : []),
    // authored: 2026-10-14, a Critérios item per NC site item (open for Bruno).
    ...site.map((item) => `verificações do local, item ${item.n} NC (${item.locals})`),
    ...(points > 0 ? [plural(points, 'ponto de atenção', 'pontos de atenção')] : []),
  ];

  // The keys are added only when non-empty, so a relatório with no site NC, no failed ratio, no
  // Reprovado sheet and no out reading keeps its basis byte-identical (Stories 17.5, 22.6).
  const basis = fnv1a(
    canonicalJson({
      total,
      concluded,
      open,
      notTested,
      withRestriction,
      nc,
      points,
      ...(site.length > 0 ? { site } : {}),
      ...(ratio.length > 0 ? { ratio } : {}),
      // Batch e23e (Story 23.18): only where a sheet fails by its choice alone, so every basis written before keeps its bytes.
      ...(choiceOnly.length > 0 ? { choiceOnly } : {}),
      ...(reprovados.length > 0 ? { reprovado: reprovados } : {}),
      ...(outOthers.length > 0 ? { outReadings: outOthers } : {}),
      // e22g N4: the defect group joins the basis only where it holds a sheet, so a basis written before keeps its bytes.
      // Fix batch e23w (W2-K1): the prerequisite group likewise, so every basis written before keeps its bytes.
      ...(byReason.ratio.length + byReason.choice.length + byReason.reading.length + byReason.prerequisite.length + byReason.defect.length > 0
        ? {
            reprovadoBy: {
              ratio: byReason.ratio,
              ...(byReason.choice.length > 0 ? { choice: byReason.choice } : {}),
              reading: byReason.reading,
              ...(byReason.prerequisite.length > 0 ? { prerequisite: byReason.prerequisite } : {}),
              ...(byReason.defect.length > 0 ? { defect: byReason.defect } : {}),
              other: byReason.other,
            },
          }
        : {}),
    }),
  );
  return { text, criteriaItems, criteriaLine: criteriaItems.join(' · '), basis };
}

export type ParecerTextState = 'unconfirmed' | 'confirmed' | 'edited' | 'stale';

/**
 * Where the summary field stands (AR-11, as Story 5.8's conclusion): `unconfirmed` while no
 * text was confirmed (the composed text shows), `confirmed`/`edited` while the stored basis
 * is the current one, `stale` once the counts moved since ("Sugerido: texto atualizado —
 * Substituir"; the stored text is never overwritten on its own).
 */
export function parecerTextState(parecer: RelatorioParecer | null, composed: Pick<ComposedParecer, 'basis'>): ParecerTextState {
  if (parecer === null || parecer.text_status === null) return 'unconfirmed';
  return parecer.text_basis === composed.basis ? parecer.text_status : 'stale';
}

/**
 * Story 22.6: the summary section 10 prints in the box, always the composed one
 * (`composeParecer`). ~~The stored text once confirmed or edited~~.
 */
export function parecerTextForPrint(snapshot: RelatorioSnapshot): string {
  return composeParecer(snapshot).text;
}

/**
 * Story 22.6 (coordinator's reading): a summary the engineer typed before the summary became
 * the composed one (`text_status` `edited`) keeps printing, after the composed text, as
 * "Observações do responsável"; null when there is none or it is blank. It can be cleared
 * (`parecerWithoutOwnText`), never added.
 */
export function parecerOwnText(snapshot: Pick<RelatorioSnapshot, 'relatorio'>): string | null {
  const parecer = parecerOf(snapshot);
  if (parecer === null || parecer.text_status !== 'edited') return null;
  const text = parecer.text?.trim() ?? '';
  return text === '' ? null : text;
}

/** Story 22.6: the value "Limpar" of the own text writes: the parecer with no text, status or basis. */
export function parecerWithoutOwnText(current: RelatorioParecer): RelatorioParecer {
  return { ...current, text: null, text_status: null, text_basis: null };
}

/**
 * The Parecer box's `.pb-text` under the verdict (mock `#setup-parecer-box`; Story 22.6 drops
 * the mock's "confirmado" with the confirm): "Seguido do resumo acima e, depois, dos itens fixos da conclusão e da assinatura de Rafael
 * Lamonde (ART 2620262602583)." The parenthesis is left out while the number is blank.
 */
export function parecerBoxText(snapshot: Pick<RelatorioSnapshot, 'relatorio' | 'responsible'>): string {
  const name = snapshot.responsible?.name.trim() ?? '';
  const number = snapshot.relatorio.setup.art_trt_number?.trim() ?? '';
  const label = artLabel(snapshot.responsible?.council ?? null);
  // authored: with no responsible yet, the signature is named by its role.
  const who = name === '' ? 'do responsável técnico' : `de ${name}`;
  // Story 22.6: the summary is the composed one, no longer confirmed.
  return `Seguido do resumo acima e, depois, dos itens fixos da conclusão e da assinatura ${who}${number === '' ? '' : ` (${label} ${number})`}.`;
}

/**
 * The value a verdict tap writes (Design Notes: one LWW object, the whole of it, built from
 * the store's value at write time): the new verdict with the summary as it stood.
 */
export function parecerWithVerdict(current: RelatorioParecer | null, verdict: ParecerVerdict): RelatorioParecer {
  return current === null ? { verdict, text: null, text_status: null, text_basis: null } : { ...current, verdict };
}

/** The value a Confirmar, Editar or Substituir writes: the text, its status and the basis it was composed from. */
export function parecerWithText(current: RelatorioParecer, text: string, status: ParecerTextStatus, basis: string): RelatorioParecer {
  return { ...current, text, text_status: status, text_basis: basis };
}
