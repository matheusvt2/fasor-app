import { artLabel } from '../print/document-control.ts';
import { pointsSummary } from '../points/summary.ts';
import type { BlockRow, RelatorioParecer } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition, getSeed } from '../seed/definitions.ts';
import { canonicalJson, fnv1a } from '../text/hash.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { conclusionRestrictionOf, conclusionResultOf } from './conclusion.ts';
import { naoEnsaiadasText } from './progress.ts';
import { checklistResultOf } from './sheet-progress.ts';
import { enabledSubBlocksOf, isEquipmentBlock, sheetState } from './sheet-state.ts';
import { locationTree, treeNodes } from './tree.ts';

/*
 * Story 7.4 (FR-71, UX-DR45): the relatório's parecer, the one verdict the engineer sets in
 * Dados do relatório › Etapa 6 and section 10 prints in its box. Everything the band and the
 * printed box say is derived here, once (AD-2): the suggestion ("Apto?" / "Apto com
 * restrições?", never Não apto, never set by the app), its hint line, the composed summary
 * with its Criteria line and basis (the same Generated text rules as Story 5.8's
 * conclusion), and what prints. The stored value is `setup.parecer`, one LWW object.
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

/** A sheet that carries a restriction: Com restrições, any NC row, or marked not tested. */
function restricted(block: BlockRow): boolean {
  if (block.not_tested !== null) return true;
  if (conclusionRestrictionOf(block) === 'com_restricoes') return true;
  return ncItemsOf(block).length > 0;
}

/** The enabled checklist's NC items of a live sheet: their 1-based number and label. */
function ncItemsOf(block: BlockRow): { n: number; label: string }[] {
  if (!enabledSubBlocksOf(block).has('checklist')) return [];
  let definition;
  try {
    definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    return [];
  }
  if (definition.checklist === null) return [];
  return definition.checklist.flatMap((item, index) => (checklistResultOf(block, item.key) === 'NC' ? [{ n: index + 1, label: item.label }] : []));
}

/** A not-tested sheet's reason as the summary names it: "impossibilidade de desligamento", the typed text for "Outro". */
function notTestedReason(block: BlockRow): string | null {
  const mark = block.not_tested;
  if (mark === null) return null;
  const typed = mark.text !== null && mark.text.trim() !== '' ? mark.text.trim() : null;
  if (mark.reason === 'outro' && typed !== null) return typed;
  let label: string | undefined;
  try {
    label = getSeed(block.seed_version, 'cabine_primaria').not_tested_reasons.find((reason) => reason.key === mark.reason)?.label;
  } catch {
    label = undefined;
  }
  return (label ?? mark.reason).toLocaleLowerCase('pt-BR');
}

// --- the suggestion ---------------------------------------------------------------------------

/**
 * The verdict the counts suggest (FR-71): "Apto com restrições" once any sheet is Com
 * restrições, holds an NC row or is marked not tested; "Apto" when every live sheet is
 * concluded Aprovado · Sem restrições; otherwise none (no sheet, sheets still open with no
 * restriction, or a Reprovado with no restriction). Never Não apto, never written.
 */
export function suggestParecer(snapshot: RelatorioSnapshot): ParecerVerdict | null {
  const sheets = countedSheets(snapshot);
  if (sheets.length === 0) return null;
  if (sheets.some(({ block }) => restricted(block))) return 'apto_com_restricoes';
  const allApto = sheets.every(
    ({ block }) => sheetState(block) === 'concluida' && conclusionResultOf(block) === 'aprovado' && conclusionRestrictionOf(block) === 'sem_restricoes',
  );
  return allApto ? 'apto' : null;
}

/**
 * `.conclusion-hint` under the verdict segments (mock `#setup-parecer-hint`): "Sugerido pelas
 * contagens: Apto com restrições? — 93 de 94 fichas concluídas, 2 com restrições, 1 não
 * ensaiada. A escolha é sua: um toque." The counts that are zero are left out; null with no
 * suggestion.
 */
export function parecerHintText(suggestion: ParecerVerdict | null, snapshot: RelatorioSnapshot): string | null {
  if (suggestion === null) return null;
  // E78-Q9: the counts `composeParecer` states, so the hint and the Critérios line never disagree.
  const counts = parecerCounts(snapshot);
  const parts = [
    `${counts.concluded} de ${counts.total} fichas concluídas`,
    counts.withRestriction.length > 0 ? `${counts.withRestriction.length} com restrições` : null,
    counts.notTested.length > 0 ? naoEnsaiadasText(counts.notTested.length) : null,
  ].filter((part): part is string => part !== null);
  return `Sugerido pelas contagens: ${parecerVerdictLabel(suggestion)}? — ${parts.join(', ')}. A escolha é sua: um toque.`;
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
}

/**
 * E78-Q9: the one set of counts the parecer band states, read by both the suggestion hint
 * (`parecerHintText`) and the composed summary with its Critérios line (`composeParecer`).
 */
export function parecerCounts(snapshot: RelatorioSnapshot): ParecerCounts {
  const sheets = countedSheets(snapshot);
  const concluded = sheets.filter(({ block }) => sheetState(block) === 'concluida').length;
  const notTested = sheets.filter(({ block }) => block.not_tested !== null).map(({ block, name }) => ({ name, reason: notTestedReason(block) }));
  const withRestriction = sheets.filter(({ block }) => block.not_tested === null && restricted(block)).map(({ name }) => name);
  return { total: sheets.length, concluded, notTested, open: sheets.length - concluded - notTested.length, withRestriction };
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
 * FR-71: the summary the engineer confirms, edits or replaces, composed from the relatório's
 * own counts: fichas concluídas of the total, not tested sheets with TAG and reason, sheets
 * with restrictions by TAG, NC rows grouped by checklist item, and the points of attention.
 * No priority counts (source-deltas row 29), no verdict sentence.
 */
export function composeParecer(snapshot: RelatorioSnapshot): ComposedParecer {
  const sheets = countedSheets(snapshot);
  const { total, concluded, notTested, open, withRestriction } = parecerCounts(snapshot);
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
    if (withRestriction.length > 0) {
      sentences.push(
        `${withRestriction.length === 1 ? '1 ficha apresentou' : `${withRestriction.length} fichas apresentaram`} restrições (${listPtBr(withRestriction)}).`,
      );
    }
    if (nc.length > 0) {
      sentences.push(`Itens não conformes: ${listPtBr(nc.map((group) => `${ncItemName(group)} em ${plural(group.sheets, 'ficha', 'fichas')}`))}.`);
    }
  }
  if (points > 0) sentences.push(`${points === 1 ? 'Foi registrado 1 ponto de atenção' : `Foram registrados ${points} pontos de atenção`} na seção 8.`);
  const text = sentences.join(' ');

  const criteriaItems = [
    plural(total, 'ficha', 'fichas'),
    `${concluded} ${concluded === 1 ? 'concluída' : 'concluídas'}`,
    ...(notTested.length > 0 ? [`${naoEnsaiadasText(notTested.length)} (${notTested.map((entry) => entry.name).join(', ')})`] : []),
    ...(withRestriction.length > 0 ? [`${withRestriction.length} com restrições (${withRestriction.join(', ')})`] : []),
    ...nc.map((group) => `item ${group.n} NC (${group.sheets})`),
    ...(points > 0 ? [plural(points, 'ponto de atenção', 'pontos de atenção')] : []),
  ];

  const basis = fnv1a(canonicalJson({ total, concluded, open, notTested, withRestriction, nc, points }));
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
 * The summary section 10 prints in the box: the stored text once confirmed or edited, a
 * stale one included (the engineer confirmed it; open question); null while unconfirmed or
 * blank. Nothing unconfirmed prints.
 */
export function parecerTextForPrint(snapshot: Pick<RelatorioSnapshot, 'relatorio'>): string | null {
  const parecer = parecerOf(snapshot);
  if (parecer === null || parecer.text_status === null) return null;
  const text = parecer.text;
  return text === null || text.trim() === '' ? null : text;
}

/**
 * The Parecer box's `.pb-text` under the verdict (mock `#setup-parecer-box`): "Seguido do
 * resumo confirmado acima e, depois, dos itens fixos da conclusão e da assinatura de Rafael
 * Lamonde (ART 2620262602583)." The parenthesis is left out while the number is blank.
 */
export function parecerBoxText(snapshot: Pick<RelatorioSnapshot, 'relatorio' | 'responsible'>): string {
  const name = snapshot.responsible?.name.trim() ?? '';
  const number = snapshot.relatorio.setup.art_trt_number?.trim() ?? '';
  const label = artLabel(snapshot.responsible?.council ?? null);
  // authored: with no responsible yet, the signature is named by its role.
  const who = name === '' ? 'do responsável técnico' : `de ${name}`;
  return `Seguido do resumo confirmado acima e, depois, dos itens fixos da conclusão e da assinatura ${who}${number === '' ? '' : ` (${label} ${number})`}.`;
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
