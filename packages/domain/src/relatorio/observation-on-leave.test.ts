import { describe, expect, it } from 'vitest';
import { learnedBefore } from '../registry/nc-phrase-row.ts';
import type { RegistryRow } from '../schemas/entities.ts';
import { ncObservationOnLeave } from './ficha.ts';

/*
 * Review of batch e24b (Story 24.6): the server learns the typed pieces of an NC observation after
 * its push, so the row judges its observation against the phrases learned before its own write.
 */
describe('24.6-UNIT learnedBefore: a phrase learned from this very observation never makes it automatic', () => {
  const row = (id: string, name: string) => ({ id, kind: 'nc_phrase', name, block_type: 'disjuntor_mt', item_key: 'estado_geral', removed_at: null }) as unknown as RegistryRow;
  const before = row('019966b0-0400-7000-8000-000000000001', 'Oxidação nos terminais');
  const after = row('019966b0-0400-7000-8000-000000000009', 'Trinca fina vista de cima');
  const opId = '019966b0-0400-7000-8000-000000000005';
  it('keeps the rows learned before the cell\'s op, all rows with no op id', () => {
    expect(learnedBefore([before, after], opId)).toEqual([before]);
    expect(learnedBefore([before, after], null)).toEqual([before, after]);
    expect(learnedBefore([before, after], undefined)).toEqual([before, after]);
  });
  it('a typed observation learned after its push stays "keep"; one made of a phrase learned before is "clear"', () => {
    const offered = (rows: RegistryRow[]) => rows.map((one) => (one as unknown as { name: string }).name);
    expect(ncObservationOnLeave('NC', 'C', 'Trinca fina vista de cima', offered([before, after]))).toBe('clear');
    expect(ncObservationOnLeave('NC', 'C', 'Trinca fina vista de cima', offered(learnedBefore([before, after], opId)))).toBe('keep');
    expect(ncObservationOnLeave('NC', 'NA', 'Oxidação nos terminais.', offered(learnedBefore([before, after], opId)))).toBe('clear');
  });
});
