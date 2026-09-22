import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow } from '../schemas/entities.ts';
import { isInstrumentReferenced } from './references.ts';

const INSTRUMENT_ID = '019966b0-0004-7000-8000-000000000001';
const OTHER_INSTRUMENT_ID = '019966b0-0004-7000-8000-000000000002';

function block(overrides: Partial<BlockRow> = {}): BlockRow {
  return {
    id: '019966b0-0004-7000-8000-000000000010',
    relatorio_id: '019966b0-0004-7000-8000-000000000011',
    location_id: '019966b0-0004-7000-8000-000000000012',
    equipment_id: null,
    block_type: 'transformador_forca',
    config: {},
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: emptySheet(),
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
    ...overrides,
  };
}

function withInstrumentCell(instrumentId: string): BlockRow {
  const sheet = emptySheet();
  sheet.test['isolamento'] = {
    instrument: {
      value: { instrument_id: instrumentId, code: 'MEG-01' },
      source_suggestion_id: null,
      op_id: '019966b0-0004-7000-8000-0000000000ff',
    },
    cells: {},
  };
  return block({ sheet });
}

describe('isInstrumentReferenced', () => {
  it('is false with no blocks', () => {
    expect(isInstrumentReferenced(INSTRUMENT_ID, [])).toBe(false);
  });

  it('is false when no cell references this instrument', () => {
    expect(isInstrumentReferenced(INSTRUMENT_ID, [withInstrumentCell(OTHER_INSTRUMENT_ID)])).toBe(false);
  });

  it('is true when a live block still points at this instrument', () => {
    expect(isInstrumentReferenced(INSTRUMENT_ID, [withInstrumentCell(INSTRUMENT_ID)])).toBe(true);
  });

  it('ignores a removed block', () => {
    const removed = { ...withInstrumentCell(INSTRUMENT_ID), removed_at: '2026-09-22T00:00:00.000Z' };
    expect(isInstrumentReferenced(INSTRUMENT_ID, [removed])).toBe(false);
  });
});
