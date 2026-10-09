/*
 * Story 10.1 (FR-58): the names of the merge rules, the contract between the fold, the
 * info entries and Story 10.2. A leaf module (no imports), so the cell schema
 * (`schemas/entities.ts`) can name them without a cycle through `ops/`.
 */

export const MERGE_RULES = [
  'same_value',
  'filled_over_empty',
  'nc_over_c',
  'nc_observation',
  'latest_text',
  'contradiction',
  'latest_edit',
  'block_added',
] as const;

/**
 * - `same_value`: both sides wrote the same value (no info entry).
 * - `filled_over_empty`: exactly one side is empty; the filled one stands.
 * - `nc_over_c`: a checklist result NC against C; NC stands.
 * - `nc_observation`: the observation of an item merged to NC; the NC device's stands.
 * - `latest_text`: free text; the `seq`-later edit stands, the other is kept in the entry.
 *   Except (contract 16, PR #121 review 2026-10-09) a composed, confirmed conclusion text
 *   (`meta.composed`) over a standing edited one: a `contradiction`, a durable decision. Two
 *   concurrent edits stay `latest_text`. The basis follows the text (sequential) unless the
 *   status is in contradiction; it is never a decision of its own.
 * - `contradiction`: two different filled values (Story 10.2 turns it into a conflict).
 * - `latest_edit`: a non-cell field (block, location, equipment, file, point, setup);
 *   last-writer-wins by `seq`.
 * - `block_added`: Story 10.3, a block another device added, pulled after this device's
 *   first download of the stream (information only, no pair: `over_op_id` is null).
 */
export type MergeRule = (typeof MERGE_RULES)[number];

/** The rules a cell's `merge` record can carry: the ones a concurrent `sheet/*` fold writes. */
export const CELL_MERGE_RULES = ['filled_over_empty', 'nc_over_c', 'nc_observation', 'latest_text'] as const;
export type CellMergeRule = (typeof CELL_MERGE_RULES)[number];
