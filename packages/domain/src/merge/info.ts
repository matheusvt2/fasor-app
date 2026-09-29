import { formatShortDateTime } from '../format/datetime.ts';
import { SERVER_DEVICE_ID } from '../ids.ts';
import { sheetCellAt } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { safeParsePath, type OpPath } from '../ops/path.ts';
import { blockTypeLabel } from '../relatorio/tree.ts';
import type { BlockRow, Cell, EquipmentRow, FileRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { canonicalJson } from '../text/hash.ts';
import { isEmptyValue } from './policy.ts';
import type { MergeRule } from './rules.ts';

/*
 * Story 10.1 (FR-58, epic-10 Conflict 3): each merge the fold made becomes one information
 * entry, derived here from the op pair and the row after the fold. The device keeps the
 * entries in its sync engine's memory for the tab session (a reload clears them); they are
 * never an entity and never synced. `syncCounts` counts them and `mergeInfoText` words them.
 */

export interface MergeInfo {
  /** The later op of the pair (the one that landed on the other). */
  op_id: string;
  /** The op it landed on: the latest op on the path before it; null for a `block_added` entry (no pair). */
  over_op_id: string | null;
  relatorio_id: string | null;
  block_id: string | null;
  path: string;
  rule: MergeRule;
  standing: { value: unknown; op_id: string; actor_id: string; client_ts: string };
  /** The version that did not stand; null when it was empty (nothing to read back). */
  overridden: { value: unknown; actor_id: string; client_ts: string } | null;
}

/** The families whose concurrent pairs are last-writer-wins by `seq` and still reported (`latest_edit`). */
const LATEST_EDIT_FAMILIES: ReadonlySet<OpPath['family']> = new Set([
  'block/field',
  'location/field',
  'location/se',
  'location/env',
  'location/agrupar_por_tipo',
  'equipment/field',
  'file/field',
  'point/field',
  'relatorio/setup',
]);

function blockIdOf(path: OpPath, rowAfter: unknown): string | null {
  if (path.family.startsWith('sheet/')) return (path as { block_id: string }).block_id;
  if (path.family === 'block/field') return path.id;
  if (path.family === 'file/field') {
    const blockId = (rowAfter as { block_id?: unknown } | null | undefined)?.block_id;
    return typeof blockId === 'string' ? blockId : null;
  }
  return null;
}

type OpSide = Pick<Op, 'op_id' | 'value' | 'actor_id' | 'client_ts'>;

function overriddenOf(op: OpSide): MergeInfo['overridden'] {
  return isEmptyValue(op.value) ? null : { value: op.value, actor_id: op.actor_id, client_ts: op.client_ts };
}

/**
 * The entry of one pair (`op` applied after `overOp` on the same path without having seen
 * it), read against the row after the fold. Null when nothing merged by rule: a same value,
 * a contradiction (Story 10.2 owns it), a sequential write, two ops of one device, a server
 * op on either side, a family that is not merged, or a cell a later op has moved on from.
 */
export function mergeInfoOf(
  op: Pick<Op, 'op_id' | 'path' | 'relatorio_id' | 'value' | 'actor_id' | 'device_id' | 'client_ts' | 'kind'>,
  overOp: Pick<Op, 'op_id' | 'value' | 'actor_id' | 'device_id' | 'client_ts'> & { kind?: Op['kind'] },
  rowAfter: unknown,
): MergeInfo | null {
  if (op.op_id === overOp.op_id || op.device_id === overOp.device_id) return null;
  if (op.device_id === SERVER_DEVICE_ID || overOp.device_id === SERVER_DEVICE_ID) return null;
  if (op.kind === 'create') return null;
  const path = safeParsePath(op.path);
  if (path === null) return null;
  const base = { op_id: op.op_id, over_op_id: overOp.op_id, relatorio_id: op.relatorio_id ?? null, block_id: blockIdOf(path, rowAfter), path: op.path };

  if (path.family.startsWith('sheet/')) {
    const sheet = (rowAfter as Pick<BlockRow, 'sheet'> | null | undefined)?.sheet;
    const cell: Cell | undefined = sheet === undefined ? undefined : sheetCellAt(sheet, path);
    const merge = cell?.merge;
    if (cell === undefined || merge === undefined || merge.head_op_id !== op.op_id) return null;
    const [standing, overridden] = merge.kept ? [overOp, op] : [op, overOp];
    if (cell.op_id !== standing.op_id) return null;
    return {
      ...base,
      rule: merge.rule,
      standing: { value: cell.value, op_id: cell.op_id, actor_id: standing.actor_id, client_ts: standing.client_ts },
      overridden: overriddenOf(overridden),
    };
  }

  if (!LATEST_EDIT_FAMILIES.has(path.family)) return null;
  // Both sides wrote the same value (two removes count as one): nothing merged.
  const written = (side: { kind?: Op['kind']; value: unknown }) => (side.kind === 'remove' ? 'remove' : canonicalJson(side.value));
  if (written(op) === written(overOp)) return null;
  return {
    ...base,
    rule: 'latest_edit',
    standing: { value: op.kind === 'remove' ? null : op.value, op_id: op.op_id, actor_id: op.actor_id, client_ts: op.client_ts },
    overridden: overriddenOf(overOp),
  };
}

type PairOp = Pick<Op, 'op_id' | 'path' | 'relatorio_id' | 'prev_op_id' | 'device_id' | 'kind' | 'seq'>;

const slotOf = (op: Pick<Op, 'path' | 'relatorio_id'>) => `${op.relatorio_id ?? ''}|${op.path}`;

/**
 * The pulled ops another device wrote without having seen the op before them on their path:
 * `previous` is what the device already held of the log (any order), `pulled` the new page.
 * The server's `superseded` rule restated for pulled ops (its "latest op on the path" is the
 * latest by `seq`), so the device that did not push the later op lists the merge too. The
 * device's own ops are left out (its push answer reported them) and so are server ops.
 */
export function pulledMergePairs(
  previous: readonly PairOp[],
  pulled: readonly PairOp[],
  ownDeviceId: string,
): { op_id: string; over_op_id: string }[] {
  const latest = new Map<string, PairOp>();
  const known = new Set<string>();
  const later = (a: PairOp | undefined, b: PairOp) => a === undefined || (b.seq ?? 0) >= (a.seq ?? 0);
  for (const op of previous) {
    known.add(op.op_id);
    if (later(latest.get(slotOf(op)), op)) latest.set(slotOf(op), op);
  }
  const pairs: { op_id: string; over_op_id: string }[] = [];
  for (const op of [...pulled].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (known.has(op.op_id)) continue;
    known.add(op.op_id);
    const slot = slotOf(op);
    const before = latest.get(slot);
    latest.set(slot, op);
    if (before === undefined || op.kind === 'create') continue;
    if (op.device_id === ownDeviceId || op.device_id === SERVER_DEVICE_ID) continue;
    if ((op.prev_op_id ?? null) !== before.op_id) pairs.push({ op_id: op.op_id, over_op_id: before.op_id });
  }
  return pairs;
}

type AdditionOp = Pick<Op, 'op_id' | 'kind' | 'path' | 'relatorio_id' | 'actor_id' | 'device_id' | 'client_ts' | 'seq'>;

/**
 * Story 10.3 (FR-59): the blocks another device added, among `pulled`, as information
 * entries (`block_added`, no pair: `over_op_id` is null). `previous` is what the device
 * already held of the log; a create it held already, the device's own and a server op are
 * left out. The caller applies the first-download rule (history is not this session's).
 */
export function pulledAdditions(previous: readonly Pick<Op, 'op_id'>[], pulled: readonly AdditionOp[], ownDeviceId: string): MergeInfo[] {
  const known = new Set(previous.map((op) => op.op_id));
  const out: MergeInfo[] = [];
  for (const op of [...pulled].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (known.has(op.op_id) || op.kind !== 'create') continue;
    known.add(op.op_id);
    if (op.device_id === ownDeviceId || op.device_id === SERVER_DEVICE_ID) continue;
    const path = safeParsePath(op.path);
    if (path === null || path.family !== 'block') continue;
    out.push({
      op_id: op.op_id,
      over_op_id: null,
      relatorio_id: op.relatorio_id ?? null,
      block_id: path.id,
      path: op.path,
      rule: 'block_added',
      standing: { value: null, op_id: op.op_id, actor_id: op.actor_id, client_ts: op.client_ts },
      overridden: null,
    });
  }
  return out;
}

/** What the words of an entry are read from: the device's own rows. */
export interface MergeInfoContext {
  blocks: readonly (Pick<BlockRow, 'id' | 'equipment_id' | 'block_type' | 'seed_version'> & { location_id?: string | null })[];
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[];
  users: readonly { id: string; name: string }[];
  files: readonly FileRow[];
  /** Story 10.3: the locations the blocks sit in (a `block_added` entry names its location); none when omitted. */
  locations?: readonly { id: string; name: string }[];
}

/** The block as the sheet names it: its equipment's TAG, else its type's name. authored: "Relatório" off any block. */
function blockName(blockId: string | null, context: MergeInfoContext): string {
  const block = blockId === null ? undefined : context.blocks.find((row) => row.id === blockId);
  if (block === undefined) return 'Relatório';
  const tag = block.equipment_id === null ? '' : (context.equipment.find((row) => row.id === block.equipment_id)?.tag.trim() ?? '');
  return tag === '' ? blockTypeLabel(block.seed_version, block.block_type) : tag;
}

/** The checklist item's number as the sheet shows it (1-based, the definition's order), or null. */
function itemNumber(blockId: string | null, itemKey: string, context: MergeInfoContext): number | null {
  const block = blockId === null ? undefined : context.blocks.find((row) => row.id === blockId);
  if (block === undefined) return null;
  try {
    const index = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).checklist?.findIndex((item) => item.key === itemKey) ?? -1;
    return index < 0 ? null : index + 1;
  } catch {
    return null;
  }
}

/** The author's first name ("Eduardo"); authored: "um colega" when the device does not hold the user. */
function authorName(actorId: string, context: MergeInfoContext): string {
  const name = context.users.find((row) => row.id === actorId)?.name.trim() ?? '';
  return name === '' ? 'um colega' : name.split(/\s+/)[0]!;
}

function hasLivePhoto(blockId: string | null, itemKey: string, context: MergeInfoContext): boolean {
  return context.files.some((file) => file.kind === 'photo' && file.removed_at === null && file.block_id === blockId && file.item_key === itemKey);
}

function quoted(value: unknown): string {
  return typeof value === 'string' ? `"${value.trim()}"` : '';
}

/**
 * The Sync status row of one entry, pt-BR. The NC/C merge is the story's verbatim example,
 * "SEC-C12: item 10 NC de Eduardo (com foto) mesclado" (TAG, item number, standing value,
 * the standing value's author, "(com foto)" when a live photo sits on that item). The other
 * sentences are authored.
 */
export function mergeInfoText(info: MergeInfo, context: MergeInfoContext): string {
  const path = safeParsePath(info.path);
  const name = blockName(info.block_id, context);
  const who = authorName(info.standing.actor_id, context);
  const other = info.overridden === null ? null : authorName(info.overridden.actor_id, context);
  if (path === null) return `${name}: alteração de ${who} mesclada`; // authored

  if (info.rule === 'block_added') {
    // Story 10.3, verbatim from `85-sync.html`: "Eduardo adicionou TP-C09 em Coluna 9".
    const block = context.blocks.find((row) => row.id === info.block_id);
    const location = block?.location_id == null ? undefined : context.locations?.find((row) => row.id === block.location_id);
    const where = location === undefined || location.name.trim() === '' ? '' : ` em ${location.name.trim()}`;
    return `${who} adicionou ${name}${where}`;
  }

  if (path.family === 'sheet/checklist') {
    const n = itemNumber(info.block_id, path.item_key, context);
    const item = n === null ? 'item' : `item ${n}`;
    if (path.field === 'result') {
      const photo = hasLivePhoto(info.block_id, path.item_key, context) ? ' (com foto)' : '';
      const value = typeof info.standing.value === 'string' ? `${info.standing.value} ` : '';
      return `${name}: ${item} ${value}de ${who}${photo} mesclado`;
    }
    if (info.rule === 'nc_observation') {
      // authored
      return `${name}: observação do ${item} de ${who} mantida (NC vence C)`;
    }
    if (info.rule === 'latest_text') return latestText(`observação do ${item}`, info, name, who, other);
  }
  if (info.rule === 'latest_text') {
    const what = path.family === 'sheet/observations' ? 'observações da ficha' : 'texto da conclusão';
    return latestText(what, info, name, who, other);
  }
  if (info.rule === 'filled_over_empty') {
    // authored
    return `${name}: valor de ${who} mantido (preenchido vence vazio)`;
  }
  // authored: `latest_edit` and anything else.
  return `${name}: alteração de ${who} mantida (a mais recente prevalece)`;
}

/** authored: "SEC-C12: observações da ficha — versão de Ana (07/09 14:20); a de Eduardo (07/09 14:05) era "…"". */
function latestText(what: string, info: MergeInfo, name: string, who: string, other: string | null): string {
  const head = `${name}: ${what} — versão de ${who} (${formatShortDateTime(info.standing.client_ts)})`;
  if (info.overridden === null || other === null) return head;
  return `${head}; a de ${other} (${formatShortDateTime(info.overridden.client_ts)}) era ${quoted(info.overridden.value)}`;
}
