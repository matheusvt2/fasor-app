import { describe, expect, it } from 'vitest';
import { blockOf, ctaRelatorio, ctaRows, CTA_BLOCK, CTA_EQUIPMENT, CTA_LOCAL, ctaLocal, E2, rowOf, colOf } from '../relatorio/measurement-test-support.ts';
import { equipmentRowSchema, registryRowSchemas, type EquipmentRow, type JsonValue, type LastResults } from '../schemas/entities.ts';
import { canonicalJson } from '../text/hash.ts';
import { opFactory, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { applyOp, entityKey, type EntityState } from './apply.ts';
import type { Op } from './op.ts';
import { blockPath, isServerOnly, parsePath, registryFieldPath, sheetTestCellPath } from './path.ts';
import { replay } from './replay.ts';
import { opValueIssue } from './value-limits.ts';

/*
 * Stories 22.10 and 22.12 (contract 32) through the fold: a test cell put in the `over_range`
 * state and the server-only `equipment/{id}/last_results` put apply as any other op, a replay of
 * the log gives the same rows byte for byte, a row written before parses to the same bytes, and the
 * push's value check refuses a malformed limit.
 */

const ENTRY: LastResults = {
  relatorio_id: '019966b0-2212-7000-8000-00000000000a',
  revision_number: 1,
  issued_at: '2026-10-05T15:00:00.000Z',
  seed_version: 'v5',
  block_type: 'chave_transferencia_automatica',
  readings: { [`${E2}|a_t|normal_fechada`]: { raw: '2', unit: 'TΩ', state: 'over_range' }, [`${E2}|b_t|normal_fechada`]: { raw: '9.8', unit: 'GΩ', state: 'measured' } },
  prior: null,
};

function log(): Op[] {
  const f = opFactory();
  const { equipment, block } = ctaRows();
  return [
    f.op({ kind: 'create', path: `relatorio/${TEST_RELATORIO}`, value: ctaRelatorio() as unknown as JsonValue }),
    f.op({ kind: 'create', path: `location/${CTA_LOCAL}`, value: ctaLocal() as unknown as JsonValue }),
    f.op({ kind: 'create', scope: 'project', path: `equipment/${CTA_EQUIPMENT}`, value: equipment as unknown as JsonValue }),
    f.op({ kind: 'create', path: blockPath(CTA_BLOCK), value: block as unknown as JsonValue }),
    f.op({ path: sheetTestCellPath(CTA_BLOCK, E2, rowOf(E2, 'a_t'), colOf(E2, 'normal_fechada')), value: { raw: '2', unit: 'TΩ', state: 'over_range' } }),
    f.op({ kind: 'put', scope: 'project', actor_id: 'system:generate', path: `equipment/${CTA_EQUIPMENT}/last_results`, value: ENTRY as unknown as JsonValue }),
  ];
}

describe('22.10/22.12-UNIT the fold and the replay', () => {
  it('applies an over-range cell and the last_results projection, and a replay is byte-equal', () => {
    const state = replay(log());
    const block = blockOf(state);
    expect(block.sheet.test[E2]!.cells[String(rowOf(E2, 'a_t'))]![String(colOf(E2, 'normal_fechada'))]!.value).toEqual({ raw: '2', unit: 'TΩ', state: 'over_range' });
    const equipment = state.get(entityKey('equipment', CTA_EQUIPMENT)) as EquipmentRow;
    expect(equipment.last_results).toEqual(ENTRY);
    expect(equipmentRowSchema.parse(equipment)).toEqual(equipment);
    const again = replay(log());
    expect(canonicalJson([...again.entries()])).toBe(canonicalJson([...state.entries()]));
  });

  it('a put of null clears it; an equipment row written before contract 32 parses to the same bytes (no key added)', () => {
    const f = opFactory();
    const before: EquipmentRow = { id: CTA_EQUIPMENT, project_id: TEST_PROJECT, tag: 'CTA-GER', type: 'chave_transferencia_automatica', last_nameplate: null, removed_at: null };
    expect(canonicalJson(equipmentRowSchema.parse(before))).toBe(canonicalJson(before));
    expect('last_results' in equipmentRowSchema.parse(before)).toBe(false);
    let state: EntityState = new Map([[entityKey('equipment', CTA_EQUIPMENT), before]]);
    state = applyOp(state, f.op({ kind: 'put', scope: 'project', path: `equipment/${CTA_EQUIPMENT}/last_results`, value: ENTRY as unknown as JsonValue }));
    state = applyOp(state, f.op({ kind: 'put', scope: 'project', path: `equipment/${CTA_EQUIPMENT}/last_results`, value: null }));
    expect((state.get(entityKey('equipment', CTA_EQUIPMENT)) as EquipmentRow).last_results).toBeNull();
  });

  it('an instrument row written before parses to the same bytes; the two ranges are optional put paths', () => {
    const instrument = {
      id: '019966b0-2210-7000-8000-000000000003',
      kind: 'instrument' as const,
      code: 'MEG-10',
      name: 'Megôhmetro 10 kV',
      manufacturer: null,
      model: null,
      serial: null,
      cert_number: null,
      laboratory: null,
      calibrated_at: null,
      calibration_interval_months: null,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    };
    expect(canonicalJson(registryRowSchemas.instrument.parse(instrument))).toBe(canonicalJson(instrument));
    expect(registryRowSchemas.instrument.parse({ ...instrument, range_isolacao: { raw: '2', unit: 'TΩ' } }).range_isolacao).toEqual({ raw: '2', unit: 'TΩ' });
    expect(parsePath(registryFieldPath('instrument', instrument.id, 'range_isolacao')).family).toBe('registry/field');
    expect(parsePath(registryFieldPath('instrument', instrument.id, 'range_resistencia_contato')).family).toBe('registry/field');
  });

  it('equipment/{id}/last_results is a server-only family, never an edit of a relatório', () => {
    expect(isServerOnly(`equipment/${CTA_EQUIPMENT}/last_results`)).toBe(true);
    expect(parsePath(`equipment/${CTA_EQUIPMENT}/last_results`)).toEqual({ family: 'equipment/last_results', id: CTA_EQUIPMENT });
  });
});

describe('22.10-UNIT the value check of an over-range cell (opValueIssue)', () => {
  const f = opFactory();
  const cellOp = (value: unknown) => f.op({ path: sheetTestCellPath(CTA_BLOCK, E2, 0, 0), value: value as JsonValue });
  const issue = (value: unknown) => {
    const op = cellOp(value);
    return opValueIssue(op, parsePath(op.path));
  };

  it('a positive plain decimal limit with a short unit passes', () => {
    expect(issue({ raw: '2', unit: 'TΩ', state: 'over_range' })).toBeNull();
    expect(issue({ raw: '2000.5', unit: 'µΩ', state: 'over_range' })).toBeNull();
    // Nothing changes for the other states.
    expect(issue({ raw: '-3', unit: 'MΩ', state: 'measured' })).toBeNull();
    expect(issue({ raw: '', unit: 'MΩ', state: 'not_measured' })).toBeNull();
  });

  it('a limit at zero, negative, in the pt-BR spelling or not a number, or with no short unit, is refused', () => {
    for (const raw of ['0', '-1', '2,5', 'abc', '', ' 2', 2]) expect(issue({ raw, unit: 'TΩ', state: 'over_range' }), String(raw)).not.toBeNull();
    expect(issue({ raw: '2', unit: null, state: 'over_range' })).not.toBeNull();
    expect(issue({ raw: '2', unit: '', state: 'over_range' })).not.toBeNull();
    expect(issue({ raw: '2', unit: 'x'.repeat(201), state: 'over_range' })).not.toBeNull();
  });

  it('a server-only last_results put has no client rule: the push refuses its family before', () => {
    const op = f.op({ kind: 'put', scope: 'project', path: `equipment/${CTA_EQUIPMENT}/last_results`, value: ENTRY as unknown as JsonValue });
    expect(opValueIssue(op, parsePath(op.path))).toBeNull();
  });
});
