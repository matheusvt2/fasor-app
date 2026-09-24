import { blockConfigSchema, isEquipmentBlockType, SUB_BLOCK_KEYS, type SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { enabledSubBlocks } from '../templates/compose.ts';

/*
 * AD-18: the completion state of one equipment sheet, in precedence order — marked not
 * tested, concluded by someone, any filled cell of an enabled sub-block, else empty. The
 * Sumário's section 9, the tree rows (Story 4.4), `progress` and the Export all read this
 * one function, so no surface decides a sheet's word on its own.
 */

export type SheetState = 'vazia' | 'em_preenchimento' | 'concluida' | 'nao_ensaiada';

const LABELS: Readonly<Record<SheetState, string>> = {
  vazia: 'Vazia',
  em_preenchimento: 'Em preenchimento',
  concluida: 'Concluída',
  nao_ensaiada: 'Não ensaiada',
};

/** The mock's word for a state (`40-relatorio-overview.html` `.s9-state`). */
export function sheetStateLabel(state: SheetState): string {
  return LABELS[state];
}

/**
 * A cell holds a value when it is not empty: a `number` value whose `state` is not
 * `empty`, a non-blank string, or any other non-null JSON. A cell only exists once its
 * value was written or confirmed (AD-12): a pending suggestion is a `suggestion` row, never
 * a cell, so it never counts.
 */
export function isCellFilled(cell: Cell | null | undefined): boolean {
  if (cell === null || cell === undefined) return false;
  const value = cell.value;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'object' && !Array.isArray(value) && 'state' in value) return value.state !== 'empty';
  return true;
}

/** The sub-blocks the block's own config enables; every one when the config does not parse. */
function enabledOf(block: BlockRow): ReadonlySet<SubBlockKey> {
  const parsed = blockConfigSchema.safeParse(block.config);
  if (!parsed.success) return new Set(SUB_BLOCK_KEYS);
  return new Set(enabledSubBlocks(parsed.data));
}

/** Every cell of the sheet's enabled sub-blocks. */
export function enabledCells(block: BlockRow): Cell[] {
  const enabled = enabledOf(block);
  const s = block.sheet;
  const cells: Cell[] = [];
  if (enabled.has('nameplate')) cells.push(...Object.values(s.nameplate));
  if (enabled.has('checklist')) {
    for (const item of Object.values(s.checklist)) for (const c of [item.result, item.observation]) if (c) cells.push(c);
  }
  for (const [key, test] of Object.entries(s.test)) {
    // A test keyed by a sub-block name follows its switch; any other key is always read.
    if ((SUB_BLOCK_KEYS as readonly string[]).includes(key) && !enabled.has(key as SubBlockKey)) continue;
    for (const c of [test.instrument, test.criterion_override]) if (c) cells.push(c);
    for (const row of Object.values(test.cells)) cells.push(...Object.values(row));
  }
  if (enabled.has('conclusion')) cells.push(...Object.values(s.conclusion).filter((c): c is Cell => c !== undefined));
  if (enabled.has('observations') && s.observations) cells.push(s.observations);
  return cells;
}

/** AD-18 precedence: `not_tested` > `concluded_by` > any filled enabled cell > empty. */
export function sheetState(block: BlockRow): SheetState {
  if (block.not_tested !== null) return 'nao_ensaiada';
  if (block.concluded_by !== null) return 'concluida';
  if (enabledCells(block).some(isCellFilled)) return 'em_preenchimento';
  return 'vazia';
}

/** True for a block that is an equipment sheet (a section block has no sheet state). */
export function isEquipmentBlock(block: Pick<BlockRow, 'block_type' | 'equipment_id'>): boolean {
  return block.equipment_id !== null || isEquipmentBlockType(block.block_type);
}
