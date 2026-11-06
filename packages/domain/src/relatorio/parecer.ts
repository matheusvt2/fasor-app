import { artLabel } from '../print/document-control.ts';
import { pointsSummary } from '../points/summary.ts';
import type { BlockRow, RelatorioParecer } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition, findSeed } from '../seed/definitions.ts';
import { canonicalJson, fnv1a } from '../text/hash.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { effectiveConclusionPair } from './conclusion.ts';
import { naoEnsaiadasText } from './progress.ts';
import { evaluateSheetMeasurements, measurementCells } from './measurement-evaluation.ts';
import { evaluatedCells, evaluateSheetReadings, failedRatioRows, type FailedRatioRow } from './readings.ts';
import { sectionRefText } from './section-position.ts';
import { checklistResultOf } from './sheet-progress.ts';
import { siteNcCount, siteNcItems } from './site-checklist.ts';
import { enabledSubBlocksOf, isEquipmentBlock, sheetState } from './sheet-state.ts';
import { locationTree, treeNodes } from './tree.ts';

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
  /** The TAG, else the block type's name. */
  name: string;
}

/** The live equipment sheets in tree order (the section 9 order), each with the name the text uses. */
function countedSheets(snapshot: RelatorioSnapshot): CountedSheet[] {
  const order = new Map<string, { index: number; name: string }>();
  treeNodes(locationTree(snapshot)).forEach((node, index) => {
    if (node.kind === 'equipment') order.set(node.blockId, { index, name: node.name });
  });
  const tags = new Map(snapshot.equipment.map((row) => [row.id, row.tag]));
  return snapshot.blocks
    .filter((block) => block.removed_at === null && isEquipmentBlock(block))
    .map((block) => {
      const known = order.get(block.id);
      const tag = block.equipment_id === null ? '' : (tags.get(block.equipment_id)?.trim() ?? '');
      return { block, name: known?.name ?? (tag === '' ? block.block_type : tag), index: known?.index ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((a, b) => a.index - b.index || (a.block.id < b.block.id ? -1 : 1))
    .map(({ block, name }) => ({ block, name }));
}

/**
 * A sheet that carries a restriction: marked not tested, or (Story 22.4) its effective
 * restriction is Com restrições, which an NC row, an observation, a failed ratio row or any
 * reading out of criterion sets through the floor whatever the stored pair says.
 */
function restricted(block: BlockRow): boolean {
  if (block.not_tested !== null) return true;
  return effectiveConclusionPair(block).restriction === 'com_restricoes';
}

/** Story 22.6: a sheet whose effective result is Reprovado (a not tested sheet with a defect reason included). */
function reprovado(block: BlockRow): boolean {
  return effectiveConclusionPair(block).result === 'reprovado';
}

/**
 * Story 22.6: a tested sheet with a reading out of criterion other than a ratio row (an
 * insulation or contact capture, a measurement-table cell); the failed ratio has its own clause.
 */
function outReading(block: BlockRow): boolean {
  if (block.not_tested !== null) return false;
  const definition = findDefinition(block.seed_version, block.block_type);
  if (definition === null) return false;
  const plain = evaluateSheetReadings(block, definition).filter((test) => test.testKey !== 'relacao_transformacao');
  return evaluatedCells(plain).some((cell) => cell.verdict === 'out') || measurementCells(evaluateSheetMeasurements(block, definition)).some((cell) => cell.verdict === 'out');
}

/**
 * Story 17.5: the ratio rows INSATISFATÓRIO of a live sheet, read through the one kernel
 * reader (`failedRatioRows`); empty when its seed is unknown or its ratio sub-block is off.
 */
function failedRatioRowsOf(block: BlockRow): FailedRatioRow[] {
  const definition = findDefinition(block.seed_version, block.block_type);
  if (definition === null) return [];
  return failedRatioRows(evaluateSheetReadings(block, definition));
}

/** The enabled checklist's NC items of a live sheet: their 1-based number and label. */
function ncItemsOf(block: BlockRow): { n: number; label: string }[] {
  if (!enabledSubBlocksOf(block).has('checklist')) return [];
  const definition = findDefinition(block.seed_version, block.block_type);
  if (definition === null || definition.checklist === null) return [];
  return definition.checklist.flatMap((item, index) => (checklistResultOf(block, item.key) === 'NC' ? [{ n: index + 1, label: item.label }] : []));
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
 * the derived ones included); Apto otherwise. Always one: the "Parecer não preenchido" row
 * retires with it.
 */
export function derivedParecer(snapshot: RelatorioSnapshot): ParecerVerdict {
  const sheets = countedSheets(snapshot);
  if (sheets.some(({ block }) => reprovado(block))) return 'nao_apto';
  if (sheets.some(({ block }) => restricted(block))) return 'apto_com_restricoes';
  if (siteNcCount(snapshot) > 0 || pointsSummary(snapshot).total > 0) return 'apto_com_restricoes';
  return 'apto';
}

/** Story 22.6: whether a verdict is looser than the derived one, so Etapa 6 disables its segment. */
export function parecerLooser(snapshot: RelatorioSnapshot, verdict: ParecerVerdict): boolean {
  return VERDICT_RANK[verdict] < VERDICT_RANK[derivedParecer(snapshot)];
}

/**
 * Story 22.6: the verdict every reader shows and section 10 prints: the stored one when it is
 * stricter than the derived one (the engineer chose it), else the derived one. A stored verdict
 * looser than what the fichas now give is never shown.
 */
export function effectiveParecer(snapshot: RelatorioSnapshot): ParecerVerdict {
  const derived = derivedParecer(snapshot);
  const stored = parecerOf(snapshot)?.verdict ?? null;
  return stored !== null && VERDICT_RANK[stored] > VERDICT_RANK[derived] ? stored : derived;
}

/**
 * Story 22.6: the line under the verdict segments naming why the looser ones are disabled:
 * "O relatório exige no mínimo Não apto: 1 ficha reprovada (TR-1)." Null under Apto (nothing
 * is disabled). The counts are `parecerCounts`', so the line and the Critérios line agree.
 */
export function parecerReasonText(snapshot: RelatorioSnapshot): string | null {
  const derived = derivedParecer(snapshot);
  if (derived === 'apto') return null;
  const counts = parecerCounts(snapshot);
  const points = pointsSummary(snapshot).total;
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
  /** The TAGs of the tested sheets with a restriction, in tree order. */
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
  const withRestriction = sheets.filter(({ block }) => block.not_tested === null && restricted(block)).map(({ name }) => name);
  const reprovados = sheets.filter(({ block }) => reprovado(block)).map(({ name }) => name);
  const outReadings = sheets.filter(({ block }) => outReading(block)).map(({ name }) => name);
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
  const { total, concluded, notTested, open, withRestriction, reprovado: reprovados, outReadings } = parecerCounts(snapshot);
  const ncGroups = new Map<string, { n: number; label: string; sheets: number }>();
  for (const { block } of sheets) {
    if (block.not_tested !== null) continue;
    for (const item of ncItemsOf(block)) {
      const key = `${item.n}:${item.label}`;
      const group = ncGroups.get(key);
      if (group === undefined) ncGroups.set(key, { ...item, sheets: 1 });
      else group.sheets += 1;
    }
  }
  const nc = [...ncGroups.values()].sort((a, b) => a.n - b.n || (a.label < b.label ? -1 : 1));
  // Story 17.5: the tested sheets with a ratio row INSATISFATÓRIO, by name in tree order.
  const ratio = sheets.filter(({ block }) => block.not_tested === null && failedRatioRowsOf(block).length > 0).map(({ name }) => name);
  const site = siteNcItems(snapshot).map((item) => ({ n: item.number, label: item.label, locals: item.locals.length }));
  const points = pointsSummary(snapshot).total;

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
    if (reprovados.length > 0) {
      // authored (Story 22.6, open for Bruno): the Reprovado sheets sentence.
      sentences.push(`${reprovados.length === 1 ? '1 ficha foi reprovada' : `${reprovados.length} fichas foram reprovadas`} (${listPtBr(reprovados)}).`);
    }
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
    if (outReadings.length > 0) {
      // authored (Story 22.6, open for Bruno): the out-of-criterion readings sentence.
      sentences.push(`Leituras fora do critério de aceitação em ${plural(outReadings.length, 'ficha', 'fichas')} (${listPtBr(outReadings)}).`);
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
    // authored (Story 22.6, open for Bruno): the Critérios item of the out-of-criterion readings.
    ...(outReadings.length > 0 ? [`leituras fora do critério (${outReadings.join(', ')})`] : []),
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
      ...(reprovados.length > 0 ? { reprovado: reprovados } : {}),
      ...(outReadings.length > 0 ? { outReadings } : {}),
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
