import type { BlockRow } from '../schemas/entities.ts';

/*
 * AC4's `integrity` rule: an instrument a sheet still points to can only be archived,
 * never removed. AD-19 copies the instrument's whole header into `sheet.test[key].instrument`
 * at selection time (`{instrument_id, code, manufacturer, ...}`), so the reference this
 * checks is `cell.value.instrument_id` — the same shape `schemas/snapshot.ts` reads to
 * collect an issued relatório's instruments. No block exists before Epic 5, so this is
 * always `false` today; the function is correct the day a block does.
 */

/** True when at least one live block's sheet still points at this instrument. */
export function isInstrumentReferenced(instrumentId: string, blocks: readonly BlockRow[]): boolean {
  for (const block of blocks) {
    if (block.removed_at !== null) continue;
    for (const test of Object.values(block.sheet.test)) {
      const picked = test.instrument?.value as { instrument_id?: unknown } | null | undefined;
      if (picked && typeof picked === 'object' && picked.instrument_id === instrumentId) return true;
    }
  }
  return false;
}
