import { fileFieldPath, sheetChecklistPath, sheetNameplatePath } from '../ops/path.ts';
import type { BlockRow, Cell, FileRow } from '../schemas/entities.ts';
import { findDefinition } from '../seed/definitions.ts';
import type { OilRule } from '../seed/schema.ts';
import { plural } from '../text/plural.ts';
import { isCellFilled } from './sheet-state.ts';

/*
 * Story 14.11 (seed v6; Bruno 2026-10-20, answers 1 to 4 and the follow-up): the insulation (or,
 * on a Disjuntor MT, the extinction medium) decides the oil items and fields. ONE rule, read by
 * the sheet, its progress, the pre-issue list, the conclusion text, the gallery and the print
 * (through `checklistResultOf` and `nameplateMissingKeys`), never derived in `apps/*`.
 *
 * - The unit's oil state is the stored value of the rule's field when one is filled (an oil
 *   value is oil, any other value is not), else the block's config subtype (`epoxi`, `a_seco`:
 *   not oil), else unknown, and an unknown unit has no rule applied (as an oil unit today).
 * - A non-oil unit shows every oil item NA while the item's own result cell is not filled
 *   (derived, never written: no op, no chip, no tap), and its oil fields excused (never
 *   missing) and printed "-" whatever is stored. A result the engineer stored wins and prints.
 * - A write of the field that crosses between oil and non-oil (both states known and different)
 *   clears, in the same undoable batch, the result and observation of every oil item holding a
 *   value, every filled oil field, and the tie of every live photo of the block to an oil item
 *   (`file/{id}/item_key` put to null: the photo stays on the block and in the gallery, never
 *   deleted, its `reading_target` never rewritten). A write between two non-oil values, from or
 *   to an unknown state, clears nothing.
 *
 * Only a definition with an `oil_rule` (seed v6 on) has any of this; v1 to v5 keep the "Marcar N
 * itens de óleo como NA" chip and their own rules (`dry-insulation.ts`).
 */

/** The subtype keys that name a dry unit (FR-11). */
const DRY_SUBTYPES: ReadonlySet<string> = new Set(['epoxi', 'a_seco']);

type RuleBlock = Pick<BlockRow, 'seed_version' | 'block_type'>;
type StateBlock = Pick<BlockRow, 'seed_version' | 'block_type' | 'config' | 'sheet'>;

/** The block's oil rule, or null for a type or seed version that has none. */
export function oilRuleOf(block: Partial<RuleBlock>): OilRule | null {
  if (block.seed_version === undefined || block.block_type === undefined) return null;
  return findDefinition(block.seed_version, block.block_type)?.oil_rule ?? null;
}

function subtypeOf(config: unknown): string | null {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;
  const subtype = (config as { subtype?: unknown }).subtype;
  return typeof subtype === 'string' ? subtype : null;
}

/** The oil state a stored cell of the rule's field and a config subtype give. */
function oilStateOf(rule: OilRule, cell: Cell | null | undefined, config: unknown): boolean | null {
  if (isCellFilled(cell) && typeof cell!.value === 'string') return rule.oil_values.includes(cell!.value.trim());
  if (isCellFilled(cell)) return false;
  const subtype = subtypeOf(config);
  return subtype !== null && DRY_SUBTYPES.has(subtype) ? false : null;
}

/** True for an oil unit, false for a non-oil one, null when unknown or the block has no oil rule. */
export function isOilUnit(block: StateBlock): boolean | null {
  const rule = oilRuleOf(block);
  if (rule === null) return null;
  return oilStateOf(rule, block.sheet.nameplate[rule.field], block.config);
}

const NONE: ReadonlySet<string> = new Set();

/** The checklist items a non-oil unit shows NA while their own result is not filled; none otherwise. */
export function oilDerivedNaKeys(block: Partial<StateBlock>): ReadonlySet<string> {
  const rule = oilRuleOf(block);
  if (rule === null || block.sheet === undefined) return NONE;
  return oilStateOf(rule, block.sheet.nameplate[rule.field], block.config) === false ? new Set(rule.items) : NONE;
}

/** True when the block's rule names `itemKey` (the rule, not the config's NA defaults, decides it). */
export function isOilItem(block: Partial<RuleBlock>, itemKey: string): boolean {
  return oilRuleOf(block)?.items.includes(itemKey as OilRule['items'][number]) ?? false;
}

/** An oil field of a non-oil unit: shown excused, never missing, printed "-". */
export function isOilFieldExcused(block: StateBlock, fieldKey: string): boolean {
  const rule = oilRuleOf(block);
  return rule !== null && rule.fields.includes(fieldKey) && isOilUnit(block) === false;
}

/** One put of the crossing batch. */
export interface OilCrossingPut {
  path: string;
  value: null;
}

/**
 * The puts a write of `next` to the block's nameplate `fieldKey` brings with it, in the same
 * batch: none unless the field is the rule's and the write crosses between oil and non-oil.
 * `next` is the value about to be stored (null clears the field). Read on the fresh block.
 */
export function oilCrossingPuts(snapshot: { readonly blocks: readonly BlockRow[]; readonly files: readonly FileRow[] }, blockId: string, fieldKey: string, next: unknown): OilCrossingPut[] {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  if (block === undefined) return [];
  const rule = oilRuleOf(block);
  if (rule === null || rule.field !== fieldKey) return [];
  const before = oilStateOf(rule, block.sheet.nameplate[fieldKey], block.config);
  const after = oilStateOf(rule, { value: (next ?? null) as Cell['value'] } as Cell, block.config);
  if (before === null || after === null || before === after) return [];
  const puts: OilCrossingPut[] = [];
  for (const itemKey of rule.items) {
    const entry = block.sheet.checklist[itemKey];
    if (isCellFilled(entry?.result)) puts.push({ path: sheetChecklistPath(block.id, itemKey, 'result'), value: null });
    if (isCellFilled(entry?.observation)) puts.push({ path: sheetChecklistPath(block.id, itemKey, 'observation'), value: null });
  }
  for (const key of rule.fields) if (isCellFilled(block.sheet.nameplate[key])) puts.push({ path: sheetNameplatePath(block.id, key), value: null });
  const items = new Set<string>(rule.items);
  for (const file of snapshot.files) {
    if (file.kind !== 'photo' || file.removed_at !== null || file.block_id !== block.id || file.item_key === null || !items.has(file.item_key)) continue;
    puts.push({ path: fileFieldPath(file.id, 'item_key'), value: null });
  }
  return puts;
}

/**
 * What a crossing batch cleared, as its toast counts it: each oil item that held a result, an
 * observation or a photo once, and each oil field once.
 */
export function oilCrossingClearedCount(puts: readonly OilCrossingPut[], snapshot: { readonly files: readonly FileRow[] }): number {
  const cleared = new Set<string>();
  const photoItem = new Map(snapshot.files.flatMap((file) => (file.kind === 'photo' && file.item_key !== null ? [[file.id, file.item_key] as const] : [])));
  for (const put of puts) {
    const segments = put.path.split('/');
    if (segments[0] === 'sheet' && segments[2] === 'checklist') cleared.add(`item:${segments[3]}`);
    else if (segments[0] === 'sheet' && segments[2] === 'nameplate') cleared.add(`field:${segments[3]}`);
    else if (segments[0] === 'file') cleared.add(`item:${photoItem.get(segments[1]!) ?? segments[1]}`);
  }
  return cleared.size;
}

// authored: the undo toast of a crossing between oil and non-oil (Bruno 2026-10-20 answer 4).
/** "1 item de óleo apagado", "8 itens de óleo apagados". */
export function oilItemsClearedText(n: number): string {
  return plural(n, 'item de óleo apagado', 'itens de óleo apagados');
}
