import { formatShortDateTime } from '../format/datetime.ts';
import { entityKey, type EntityKey } from '../ops/apply.ts';
import { formatPath, type OpPath } from '../ops/path.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { avatarInitial } from '../registration.ts';
import { composeConclusion } from '../relatorio/conclusion.ts';
import { sheetOrder, fieldValueText } from '../relatorio/ficha.ts';
import { evaluateTest } from '../relatorio/reading-evaluation.ts';
import { screenLabel } from '../relatorio/screen-label.ts';
import { sheetState, sheetStateLabel } from '../relatorio/sheet-state.ts';
import { integrityFindings } from '../relatorio/integrity.ts';
import { isTagTaken } from '../relatorio/tag.ts';
import { blockTypeLabel } from '../relatorio/tree.ts';
import { equipmentBlockName } from './info.ts';
import type { OpDraft } from '../ops/op.ts';
import { relatorioOpEnvelope, type Author } from '../relatorio/ops.ts';
import type { BlockRow, Cell, EquipmentRow, JsonValue, LocationRow } from '../schemas/entities.ts';
import { findDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import type { SyncDecisionRow } from '../sync/status.ts';
import { plural } from '../text/plural.ts';

/*
 * Stories 10.2 and 10.3 (FR-59, AD-1, AD-2): the open decisions of one relatório, derived
 * once here from the rows the fold wrote (`cell.conflict`, `block.removal_conflict`) and
 * the project's duplicate TAGs (`integrityFindings`), plus every word the conflict Banner,
 * the Sync status "Decisões" rows, the Conflict view and the resolution toasts show. The
 * rows hold op ids only; who wrote each side, on which device and when is read from the op
 * log by the caller (`opOf`, `createOpOf`), which the device holds in `remote_ops` and its
 * outbox.
 */

/** What the caller's op log says of one op. */
export interface OpFacts {
  actor_id: string;
  device_id: string;
  client_ts: string;
  /** Absent while the op is not on the server yet. */
  seq?: number;
}

/** One side of a contradicting cell: its op and value, and (when the log holds the op) who, where and when. */
export interface DecisionSide {
  op_id: string;
  value: unknown;
  source_suggestion_id: string | null;
  actor_id: string | null;
  device_id: string | null;
  client_ts: string | null;
}

/** One contradicting cell of a sheet. */
export interface CellConflict {
  /** The op path of the cell ("sheet/{block}/test/isolacao/cell/0/1"): what "Aplicar" writes. */
  path: string;
  /** The sheet section the cell sits in ("Verificações", "Ensaio de isolação"). */
  section: string;
  /** The cell as the sheet names it ("Fase A · 1 minuto", "Item 10 · Fusíveis"). */
  label: string;
  /** The value the cell shows (the `seq`-later side). */
  standing: DecisionSide;
  /** The side it displaced (`cell.conflict`). */
  displaced: DecisionSide;
  /**
   * Contract 16 (PR #121 review, 2026-10-09): the conclusion text is decided as one unit
   * with its status and basis. These are the two other paths, with each side's value;
   * "Aplicar" writes them with the text (`applyPickOps`).
   */
  companions?: { path: string; standing: unknown; displaced: unknown }[];
}

export interface CellDecision {
  kind: 'cell';
  relatorio_id: string;
  block_id: string;
  cells: CellConflict[];
}

export interface BlockRemovalDecision {
  kind: 'block_removal';
  relatorio_id: string;
  block_id: string;
  equipment_id: string | null;
  removed_by: string | null;
  removed_at: string;
  edited_by: string | null;
  edited_at: string | null;
}

export interface DuplicateTagDecision {
  kind: 'duplicate_tag';
  relatorio_id: string;
  /** The TAG as the earlier equipment row writes it. */
  tag: string;
  earlier_equipment_id: string;
  later_equipment_id: string;
  /** The live block of this relatório holding the later equipment, or null when none does. */
  later_block_id: string | null;
  earlier: OpFacts;
  later: OpFacts;
}

export type Decision = CellDecision | BlockRemovalDecision | DuplicateTagDecision;

export interface OpenDecisionsInput {
  relatorioId: string;
  /** The relatório's blocks, removed ones included. */
  blocks: readonly BlockRow[];
  /** The relatório's locations (tree order). */
  locations: readonly LocationRow[];
  /** The project's equipment, removed rows included. */
  equipment: readonly EquipmentRow[];
  /** The op log lookup, by op id. */
  opOf: (opId: string) => OpFacts | undefined;
  /** The create op of one entity (`equipment:{id}`), from the same log. */
  createOpOf: (key: EntityKey) => OpFacts | undefined;
}

// --- listing -----------------------------------------------------------------------------

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition | null {
  return findDefinition(block.seed_version, block.block_type);
}

/** One side of a contradiction, named by the op whose value it shows (E10-Q2: `shown_op_id`, after the undo of "Aplicar"). */
function sideOf(cell: Pick<Cell, 'op_id' | 'value' | 'source_suggestion_id' | 'shown_op_id'>, opOf: OpenDecisionsInput['opOf']): DecisionSide {
  const opId = cell.shown_op_id ?? cell.op_id;
  const facts = opOf(opId);
  return {
    op_id: opId,
    value: cell.value,
    source_suggestion_id: cell.source_suggestion_id,
    actor_id: facts?.actor_id ?? null,
    device_id: facts?.device_id ?? null,
    client_ts: facts?.client_ts ?? null,
  };
}

const SECTION_NAMEPLATE = 'Dados de placa';
const SECTION_CHECKLIST = 'Verificações';
const SECTION_CONCLUSION = 'Conclusão';
const SECTION_OBSERVATIONS = 'Observações';

const CONCLUSION_LABELS: Readonly<Record<string, string>> = {
  result: 'Resultado',
  restriction: 'Restrição',
  text: 'Texto da conclusão',
  text_status: 'Estado do texto',
  text_basis: 'Base do texto',
};

/**
 * Contract 16 (PR #121 review, 2026-10-09): the conclusion text, its status and its basis as
 * ONE contradiction, when any of the three holds a `conflict`, so no pick leaves an edited
 * text marked confirmed or a composed text marked edited. The standing side is the three
 * values the cells show; the displaced side is each cell's `conflict` value, else its value,
 * except that a displaced `confirmed` status whose text has no `conflict` (an edited text
 * arrived later and stood as latest text) is the text the app composes now, with its basis.
 * Both sides' authors come from the first of the three cells holding a `conflict`.
 */
function conclusionTextConflict(block: BlockRow, definition: BlockDefinition | null, tag: string, opOf: OpenDecisionsInput['opOf']): CellConflict | null {
  const fields = ['text', 'text_status', 'text_basis'] as const;
  const cells = fields.map((field) => block.sheet.conclusion[field]);
  const marked = cells.find((cell) => cell?.conflict !== undefined);
  if (marked === undefined) return null;
  const standingValues = cells.map((cell) => cell?.value ?? null);
  const displacedValues = cells.map((cell) => (cell?.conflict === undefined ? (cell?.value ?? null) : cell.conflict.value));
  if (displacedValues[1] === 'confirmed' && cells[0]?.conflict === undefined && definition !== null) {
    const composed = composeConclusion(block, definition, tag);
    displacedValues[0] = composed.text;
    displacedValues[2] = composed.basis;
  }
  const path = (field: (typeof fields)[number]) => formatPath({ family: 'sheet/conclusion', block_id: block.id, field });
  return {
    path: path('text'),
    section: SECTION_CONCLUSION,
    label: CONCLUSION_LABELS.text!,
    standing: { ...sideOf(marked!, opOf), value: standingValues[0], source_suggestion_id: null },
    displaced: { ...sideOf(marked!.conflict!, opOf), value: displacedValues[0], source_suggestion_id: null },
    companions: [1, 2].map((i) => ({ path: path(fields[i]!), standing: standingValues[i], displaced: displacedValues[i] })),
  };
}

/** Every cell of a block holding a `conflict`, in the sheet's order, with its section and name. */
function cellConflictsOf(block: BlockRow, opOf: OpenDecisionsInput['opOf'], equipment: OpenDecisionsInput['equipment'] = []): CellConflict[] {
  const definition = definitionOf(block);
  const out: CellConflict[] = [];
  const push = (path: OpPath, cell: Cell | undefined, section: string, label: string) => {
    if (cell?.conflict === undefined) return;
    out.push({ path: formatPath(path), section, label, standing: sideOf(cell, opOf), displaced: sideOf(cell.conflict, opOf) });
  };
  const sheet = block.sheet;
  const blockId = block.id;

  const nameplateKeys = [...(definition?.nameplate.map((field) => field.key) ?? []), ...Object.keys(sheet.nameplate)];
  for (const key of new Set(nameplateKeys)) {
    const field = definition?.nameplate.find((row) => row.key === key);
    push({ family: 'sheet/nameplate', block_id: blockId, field_key: key }, sheet.nameplate[key], SECTION_NAMEPLATE, field === undefined ? key : screenLabel(field.label));
  }

  const items = definition?.checklist ?? [];
  const itemKeys = [...items.map((item) => item.key), ...Object.keys(sheet.checklist)];
  for (const key of new Set(itemKeys)) {
    const index = items.findIndex((item) => item.key === key);
    const name = index < 0 ? key : `Item ${index + 1} · ${screenLabel(items[index]!.label)}`;
    const entry = sheet.checklist[key];
    push({ family: 'sheet/checklist', block_id: blockId, item_key: key, field: 'result' }, entry?.result, SECTION_CHECKLIST, name);
    push(
      { family: 'sheet/checklist', block_id: blockId, item_key: key, field: 'observation' },
      entry?.observation,
      SECTION_CHECKLIST,
      index < 0 ? `Observação · ${key}` : `Observação do item ${index + 1}`,
    );
  }

  const tests = definition?.tests ?? [];
  const testKeys = [...tests.map((test) => test.key), ...Object.keys(sheet.test)];
  for (const key of new Set(testKeys)) {
    const stored = sheet.test[key];
    if (stored === undefined) continue;
    const test = tests.find((row) => row.key === key);
    const evaluation = test === undefined ? null : evaluateTest(block, definition!, test);
    const title = evaluation?.title ?? key;
    push({ family: 'sheet/test', block_id: blockId, test_key: key, field: 'instrument' }, stored.instrument, title, 'Instrumento');
    push({ family: 'sheet/test', block_id: blockId, test_key: key, field: 'criterion_override' }, stored.criterion_override, title, 'Critério');
    const rows = Object.keys(stored.cells).map(Number).sort((a, b) => a - b);
    for (const row of rows) {
      const cols = Object.keys(stored.cells[String(row)] ?? {}).map(Number).sort((a, b) => a - b);
      for (const col of cols) {
        const evaluated = evaluation?.tables.flatMap((table) => table.rows).find((r) => r.row === row);
        const cell = evaluated?.cells.find((c) => c.address.col === col);
        const label = evaluated === undefined || cell === undefined ? `Linha ${row + 1} · coluna ${col + 1}` : [evaluated.label, cell.column].filter((part) => part !== '').join(' · ');
        push({ family: 'sheet/test/cell', block_id: blockId, test_key: key, row, col }, stored.cells[String(row)]?.[String(col)], title, label);
      }
    }
  }

  for (const field of ['result', 'restriction'] as const) {
    push({ family: 'sheet/conclusion', block_id: blockId, field }, sheet.conclusion[field], SECTION_CONCLUSION, CONCLUSION_LABELS[field]!);
  }
  const tag = block.equipment_id === null ? '' : (equipment.find((row) => row.id === block.equipment_id)?.tag ?? '');
  const text = conclusionTextConflict(block, definition, tag, opOf);
  if (text !== null) out.push(text);
  push({ family: 'sheet/observations', block_id: blockId }, sheet.observations ?? undefined, SECTION_OBSERVATIONS, 'Observações da ficha');
  return out;
}

/** The creates of `ids` ordered earliest first: a create with a `seq` before one without, then `seq`, then time. */
function byCreateOrder(a: OpFacts, b: OpFacts): number {
  const sa = a.seq ?? Number.POSITIVE_INFINITY;
  const sb = b.seq ?? Number.POSITIVE_INFINITY;
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : 0;
}

/**
 * The open decisions of one relatório, in tree order within each kind: every sheet with a
 * contradicting cell (one decision per sheet, its cells in sheet order), then every block
 * removed on one device and edited on another, then every TAG created on two devices (a
 * duplicate whose creates carry two distinct devices; one typed twice on one device is
 * refused inline and is only the pre-issue row).
 */
export function openDecisions(input: OpenDecisionsInput): Decision[] {
  const own = input.blocks.filter((block) => block.relatorio_id === input.relatorioId);
  // Tree order, the removed blocks placed where they stood.
  const order = new Map(
    sheetOrder({ locations: [...input.locations], blocks: own.map((block) => ({ ...block, removed_at: null })), equipment: [...input.equipment] }).map((node, i) => [node.blockId, i]),
  );
  const rank = (block: BlockRow) => order.get(block.id) ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...own].sort((a, b) => rank(a) - rank(b));

  const cells: CellDecision[] = [];
  const removals: BlockRemovalDecision[] = [];
  for (const block of sorted) {
    // A removed block's cells are not decided: its sheet is out of the tree (and a put on it
    // would mark a removal conflict); its removal decision, if any, comes first.
    const conflicts = block.removed_at === null ? cellConflictsOf(block, input.opOf, input.equipment) : [];
    if (conflicts.length > 0) cells.push({ kind: 'cell', relatorio_id: input.relatorioId, block_id: block.id, cells: conflicts });
    const mark = block.removal_conflict;
    if (mark !== undefined && block.removed_at !== null) {
      removals.push({ kind: 'block_removal', relatorio_id: input.relatorioId, block_id: block.id, equipment_id: block.equipment_id, ...mark });
    }
  }

  const tags: DuplicateTagDecision[] = [];
  const liveHere = own.filter((block) => block.removed_at === null && block.equipment_id !== null);
  const referenced = new Set(liveHere.map((block) => block.equipment_id!));
  for (const finding of integrityFindings({ equipment: input.equipment })) {
    if (!finding.equipment_ids.some((id) => referenced.has(id))) continue;
    const creates = finding.equipment_ids
      .map((id) => ({ id, facts: input.createOpOf(entityKey('equipment', id)) }))
      .filter((row): row is { id: string; facts: OpFacts } => row.facts !== undefined)
      .sort((a, b) => byCreateOrder(a.facts, b.facts));
    if (new Set(creates.map((row) => row.facts.device_id)).size < 2) continue;
    const earlier = creates[0]!;
    const later = creates.at(-1)!;
    const tag = input.equipment.find((row) => row.id === earlier.id)?.tag.trim() ?? finding.tag;
    const laterBlock = liveHere.find((block) => block.equipment_id === later.id)?.id ?? null;
    tags.push({
      kind: 'duplicate_tag',
      relatorio_id: input.relatorioId,
      tag,
      earlier_equipment_id: earlier.id,
      later_equipment_id: later.id,
      later_block_id: laterBlock,
      earlier: earlier.facts,
      later: later.facts,
    });
  }
  const tagRank = (decision: DuplicateTagDecision) => order.get(decision.later_block_id ?? '') ?? Number.MAX_SAFE_INTEGER;
  tags.sort((a, b) => tagRank(a) - tagRank(b));
  return [...cells, ...removals, ...tags];
}

/** Every cell of a sheet, in no particular order (the walk `conflictOpIds` and `holdsConflictMarks` need). */
function sheetCells(block: Pick<BlockRow, 'sheet'>): Cell[] {
  const sheet = block.sheet;
  const cells: (Cell | undefined | null)[] = [
    ...Object.values(sheet.nameplate),
    ...Object.values(sheet.checklist).flatMap((entry) => [entry.result, entry.observation]),
    ...Object.values(sheet.test).flatMap((test) => [test.instrument, test.criterion_override, ...Object.values(test.cells).flatMap((row) => Object.values(row))]),
    ...Object.values(sheet.conclusion),
    sheet.observations,
  ];
  return cells.filter((cell): cell is Cell => cell !== undefined && cell !== null);
}

/** Whether a block carries a mark `openDecisions` lists: a contradicting cell, or a removal conflict on its tombstone. */
export function holdsConflictMarks(block: Pick<BlockRow, 'sheet' | 'removed_at' | 'removal_conflict'>): boolean {
  if (block.removal_conflict !== undefined && block.removed_at !== null) return true;
  return sheetCells(block).some((cell) => cell.conflict !== undefined);
}

/** The ops `openDecisions` asks the log about for these blocks: both sides of every contradicting cell. */
export function conflictOpIds(blocks: readonly Pick<BlockRow, 'sheet'>[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    for (const cell of sheetCells(block)) {
      if (cell.conflict === undefined) continue;
      ids.add(cell.shown_op_id ?? cell.op_id);
      ids.add(cell.conflict.op_id);
    }
  }
  return [...ids];
}

/** How many decisions wait: one per contradicting cell, one per structure case. */
export function decisionCount(decisions: readonly Decision[]): number {
  return decisions.reduce((sum, decision) => sum + (decision.kind === 'cell' ? decision.cells.length : 1), 0);
}

/**
 * The held relatórios' decisions with each duplicate TAG kept once: the same two equipment
 * rows of one project are listed by every held relatório that references them, but they are
 * one decision (the first relatório's). For the badge count and the Sync status rows.
 */
export function uniqueHeldDecisions<T extends { projectId: string; decisions: readonly Decision[] }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.map((entry) => ({
    ...entry,
    decisions: entry.decisions.filter((decision) => {
      if (decision.kind !== 'duplicate_tag') return true;
      const key = `${entry.projectId}:${decisionKey(decision)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  }));
}

/** The badge's count over every held relatório (`uniqueHeldDecisions`, then `decisionCount`). */
export function decisionTotal(entries: readonly { projectId: string; decisions: readonly Decision[] }[]): number {
  return uniqueHeldDecisions(entries).reduce((sum, entry) => sum + decisionCount(entry.decisions), 0);
}

/**
 * E10-Q4: the badge's total split for the words: `contradictions`, one per contradicting cell,
 * and `decisions`, one per structure case (a block removed versus edited, a duplicate TAG),
 * over `uniqueHeldDecisions(entries)`. Their sum is `decisionTotal`.
 */
export function decisionSplit(entries: readonly { projectId: string; decisions: readonly Decision[] }[]): { contradictions: number; decisions: number } {
  let contradictions = 0;
  let decisions = 0;
  for (const entry of uniqueHeldDecisions(entries)) {
    for (const decision of entry.decisions) {
      if (decision.kind === 'cell') contradictions += decision.cells.length;
      else decisions += 1;
    }
  }
  return { contradictions, decisions };
}

/**
 * The Sync status "Decisões" rows (the X/S seam, `SyncDecisionRow`): one per decision of
 * `uniqueHeldDecisions(entries)`, keyed `⟨relatório⟩:⟨decisionKey⟩`, worded by `decisionText`
 * against each relatório's own rows.
 */
export function syncDecisionRows(
  entries: readonly ({ relatorioId: string; projectId: string; decisions: readonly Decision[] } & Pick<DecisionTextContext, 'blocks' | 'equipment' | 'locations'>)[],
  viewer: Pick<DecisionTextContext, 'users' | 'viewerActorId' | 'viewerDeviceId'>,
): SyncDecisionRow[] {
  return uniqueHeldDecisions(entries).flatMap((entry) =>
    entry.decisions.map((decision) => ({
      key: `${entry.relatorioId}:${decisionKey(decision)}`,
      kind: decision.kind === 'block_removal' ? ('removal' as const) : decision.kind,
      text: decisionText(decision, { blocks: entry.blocks, equipment: entry.equipment, locations: entry.locations, ...viewer }),
    })),
  );
}

/** A stable key of one decision (for a list row). */
export function decisionKey(decision: Decision): string {
  if (decision.kind === 'duplicate_tag') return `tag:${decision.earlier_equipment_id}:${decision.later_equipment_id}`;
  return `${decision.kind}:${decision.block_id}`;
}

/**
 * "Manter as duas": the later equipment's next free TAG, by `suggestTag`'s suffix rule
 * (`-2`, then `-3`, ...) on the TAG both carry; removed rows never count.
 */
export function keepBothTag(decision: Pick<DuplicateTagDecision, 'tag'>, equipment: readonly Pick<EquipmentRow, 'tag' | 'removed_at'>[]): string {
  for (let n = 2; ; n++) {
    const tag = `${decision.tag}-${n}`;
    if (!isTagTaken(tag, equipment)) return tag;
  }
}

/** Which side of a contradicting cell the user picked. */
export type ConflictPick = 'standing' | 'displaced';

/**
 * "Aplicar": one put per cell, the picked side's value and (when it came from a reading)
 * its `source_suggestion_id`. The device stamps `prev_op_id` and `standing_op_id` at commit,
 * so the puts are sequential and clear each cell's `conflict`. Null until every cell has a pick.
 * Contract 16: the conclusion text's pick also writes its companions (status and basis) with
 * the same side's values; a text picked with a `confirmed` status is flagged `composed`.
 */
export function applyPickOps(author: Author, decision: CellDecision, picks: Readonly<Record<string, ConflictPick>>): OpDraft[] | null {
  if (decision.cells.some((cell) => picks[cell.path] === undefined)) return null;
  const put = (path: string, value: unknown, meta: OpDraft['meta']): OpDraft => ({
    ...relatorioOpEnvelope(author, decision.relatorio_id),
    kind: 'put' as const,
    path,
    value: (value ?? null) as JsonValue,
    meta,
  });
  return decision.cells.flatMap((cell) => {
    const pick = picks[cell.path]!;
    const side = pick === 'standing' ? cell.standing : cell.displaced;
    const companions = (cell.companions ?? []).map((companion) => ({ path: companion.path, value: pick === 'standing' ? companion.standing : companion.displaced }));
    const composed = companions.some((companion) => companion.path.endsWith('/text_status') && companion.value === 'confirmed');
    const meta = side.source_suggestion_id !== null ? { source_suggestion_id: side.source_suggestion_id } : composed ? { composed: true } : null;
    return [put(cell.path, side.value, meta), ...companions.map((companion) => put(companion.path, companion.value, null))];
  });
}

// --- words -------------------------------------------------------------------------------

/** What the words of a decision are read from: the device's rows and who is looking. */
export interface DecisionTextContext {
  blocks: readonly Pick<BlockRow, 'id' | 'equipment_id' | 'block_type' | 'seed_version' | 'location_id'>[];
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[];
  locations: readonly Pick<LocationRow, 'id' | 'name'>[];
  users: readonly { id: string; name: string }[];
  /** The signed-in user ("você", "A minha"). */
  viewerActorId: string | null;
  /** This device ("este aparelho"). */
  viewerDeviceId: string | null;
}

/** The block as the sheet names it: its equipment's TAG, else its type's name. */
export function decisionBlockName(blockId: string | null, context: Pick<DecisionTextContext, 'blocks' | 'equipment'>): string {
  const block = context.blocks.find((row) => row.id === blockId);
  if (block === undefined) return 'Ficha'; // authored: a block this device does not hold
  return equipmentBlockName(block, context.equipment);
}

function locationName(blockId: string | null, context: Pick<DecisionTextContext, 'blocks' | 'locations'>): string {
  const block = context.blocks.find((row) => row.id === blockId);
  return context.locations.find((row) => row.id === block?.location_id)?.name.trim() ?? '';
}

function firstName(actorId: string | null, context: Pick<DecisionTextContext, 'users'>): string {
  const name = context.users.find((row) => row.id === actorId)?.name.trim() ?? '';
  return name === '' ? 'um colega' : name.split(/\s+/)[0]!; // authored: "um colega" when the device does not hold the user
}

/** "você" for the viewer, else the author's first name. */
function personName(actorId: string | null, context: Pick<DecisionTextContext, 'users' | 'viewerActorId'>): string {
  return actorId !== null && actorId === context.viewerActorId ? 'você' : firstName(actorId, context);
}

/**
 * The conflict Banner and the Sync status "Decisões" row of one decision (`EXPERIENCE.md`,
 * the story ACs): "SEC-C12: 1 célula em contradição", "SEC-C12: removido por Eduardo,
 * alterado por você", "SEC-C09 foi criada em dois aparelhos".
 */
export function decisionText(decision: Decision, context: DecisionTextContext): string {
  switch (decision.kind) {
    case 'cell':
      return `${decisionBlockName(decision.block_id, context)}: ${plural(decision.cells.length, 'célula', 'células')} em contradição`;
    case 'block_removal':
      return `${decisionBlockName(decision.block_id, context)}: removido por ${personName(decision.removed_by, context)}, alterado por ${personName(decision.edited_by, context)}`;
    case 'duplicate_tag':
      return `${decision.tag} foi criada em dois aparelhos`;
  }
}

/** The Conflict view's title: "SEC-C12 · Chave seccionadora · Coluna 12" (`86-sync-conflito.html`). */
export function conflictViewTitle(blockId: string, context: Pick<DecisionTextContext, 'blocks' | 'equipment' | 'locations'>): string {
  const block = context.blocks.find((row) => row.id === blockId);
  const parts = [decisionBlockName(blockId, context)];
  if (block !== undefined) {
    const type = blockTypeLabel(block.seed_version, block.block_type);
    if (type !== parts[0]) parts.push(type);
  }
  const where = locationName(blockId, context);
  if (where !== '') parts.push(where);
  return parts.join(' · ');
}

/** A cell row's label: "1 célula em contradição · Ensaio de isolação" (the count of the section's contradicting cells). */
export function conflictCellHeading(cell: CellConflict, cells: readonly CellConflict[]): string {
  const inSection = cells.filter((row) => row.section === cell.section).length;
  return `${plural(inSection, 'célula', 'células')} em contradição · ${cell.section}`;
}

/** The cell's radiogroup name: "Fase A, 1 minuto: qual valor fica". */
export function conflictPickLabel(cell: CellConflict): string {
  return `${cell.label.split(' · ').join(', ')}: qual valor fica`;
}

const CHECKLIST_WORDS: Readonly<Record<string, string>> = { C: 'Conforme', NC: 'Não conforme', NA: 'Não se aplica' };
const CONCLUSION_WORDS: Readonly<Record<string, string>> = {
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  sem_restricoes: 'Sem restrições',
  com_restricoes: 'Com restrições',
  // authored: the conclusion text's status (review 2026-10-09, r8conc-consistency-2).
  confirmed: 'Confirmado',
  edited: 'Editado',
};

/** A side's value as the sheet displays it ("3.300 MΩ", "Conforme", "Aprovado"); "—" when empty. */
export function conflictValueText(cell: Pick<CellConflict, 'path'>, value: unknown, block?: Pick<BlockRow, 'seed_version' | 'block_type'>): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object' && !Array.isArray(value) && 'raw' in value) {
    const number = value as { raw: string; unit?: string | null; state?: string };
    if (number.state === 'empty') return '—';
    if (number.state === 'not_measured') return '-';
    const unit = typeof number.unit === 'string' && number.unit !== '' ? ` ${number.unit}` : '';
    return `${formatDecimalGroupedPtBr(number.raw)}${unit}`;
  }
  if (typeof value === 'string') {
    if (cell.path.includes('/checklist/') && cell.path.endsWith('/result')) return CHECKLIST_WORDS[value] ?? value;
    if (cell.path.includes('/conclusion/')) return CONCLUSION_WORDS[value] ?? value;
    if (cell.path.includes('/nameplate/') && block !== undefined) {
      const key = cell.path.split('/').at(-1)!;
      const field = definitionOf(block)?.nameplate.find((row) => row.key === key);
      if (field !== undefined) return fieldValueText(field, value) || '—';
    }
    return value.trim() === '' ? '—' : value;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const cert = (value as { cert_number?: unknown }).cert_number;
    if (typeof cert === 'string' && cert.trim() !== '') return cert.trim();
  }
  return String(value);
}

/** One side of a contradicting cell as the Conflict view shows it (`.cvo-who`, `.cvo-value`, `.cvo-meta`). */
export interface ConflictSideView {
  initial: string;
  who: string;
  value: string;
  meta: string;
}

/** "A minha" / "A de Eduardo"; "Ler visor" or "Digitado" · "07/09 14:05" · "este aparelho". */
export function conflictSideView(
  cell: CellConflict,
  side: DecisionSide,
  context: DecisionTextContext,
  block?: Pick<BlockRow, 'seed_version' | 'block_type'>,
): ConflictSideView {
  const mine = side.actor_id !== null && side.actor_id === context.viewerActorId;
  const name = context.users.find((row) => row.id === side.actor_id)?.name.trim() ?? '';
  const meta = [side.source_suggestion_id === null ? 'Digitado' : 'Ler visor'];
  // Contract 16: the conclusion text's side says its status ("Confirmado", "Editado").
  const status = cell.companions?.find((companion) => companion.path.endsWith('/text_status'));
  const statusValue = status === undefined ? undefined : side === cell.displaced ? status.displaced : status.standing;
  if (typeof statusValue === 'string' && CONCLUSION_WORDS[statusValue] !== undefined) meta.push(CONCLUSION_WORDS[statusValue]!);
  if (side.client_ts !== null) meta.push(formatShortDateTime(side.client_ts));
  if (side.device_id !== null && side.device_id === context.viewerDeviceId) meta.push('este aparelho');
  return {
    initial: avatarInitial(name === '' ? '?' : name),
    who: mine ? 'A minha' : `A de ${firstName(side.actor_id, context)}`,
    value: conflictValueText(cell, side.value, block),
    meta: meta.join(' · '),
  };
}

/** The removal variant's two column titles: "Removido por Eduardo · 07/09 13:50" / "Alterado por você · 07/09 14:12". */
export function removalColumnTitles(decision: BlockRemovalDecision, context: DecisionTextContext): { removed: string; edited: string } {
  const when = (iso: string | null) => (iso === null ? '' : ` · ${formatShortDateTime(iso)}`);
  return {
    removed: `Removido por ${personName(decision.removed_by, context)}${when(decision.removed_at)}`,
    edited: `Alterado por ${personName(decision.edited_by, context)}${when(decision.edited_at)}`,
  };
}

/** The removal variant's block card lines: TAG, location and the sheet's state word. */
export function removalCardLines(decision: BlockRemovalDecision, block: BlockRow | undefined, context: DecisionTextContext): { removed: string[]; edited: string[] } {
  const name = decisionBlockName(decision.block_id, context);
  const where = locationName(decision.block_id, context);
  const head = where === '' ? [name] : [name, where];
  const state = block === undefined ? '' : sheetStateLabel(sheetState({ ...block, removed_at: null }));
  return {
    removed: [...head, 'Ficha removida'], // authored
    edited: state === '' ? head : [...head, state],
  };
}

// --- toasts (`85-sync.html` lines 119-124) --------------------------------------------------

/** "Manter": "DJ-C09 mantido na Coluna 9 com as alterações de Eduardo". */
export function removalKeptText(decision: BlockRemovalDecision, context: DecisionTextContext): string {
  const where = locationName(decision.block_id, context);
  const place = where === '' ? '' : ` na ${where}`;
  const whose = decision.edited_by !== null && decision.edited_by === context.viewerActorId ? 'as suas alterações' : `as alterações de ${firstName(decision.edited_by, context)}`;
  return `${decisionBlockName(decision.block_id, context)} mantido${place} com ${whose}`;
}

/** "Remover": "DJ-C09 removido — a edição de Eduardo fica recuperável". */
export function removalRemovedText(decision: BlockRemovalDecision, context: DecisionTextContext): string {
  const whose = decision.edited_by !== null && decision.edited_by === context.viewerActorId ? 'a sua edição' : `a edição de ${firstName(decision.edited_by, context)}`;
  return `${decisionBlockName(decision.block_id, context)} removido — ${whose} fica recuperável`;
}

/** "Manter as duas": "A ficha de Eduardo passou a SEC-C09-2". */
export function keptBothText(decision: DuplicateTagDecision, tag: string, context: DecisionTextContext): string {
  const whose = decision.later.actor_id === context.viewerActorId ? 'A sua ficha' : `A ficha de ${firstName(decision.later.actor_id, context)}`; // authored: "A sua ficha"
  return `${whose} passou a ${tag}`;
}
