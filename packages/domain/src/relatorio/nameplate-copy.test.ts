import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow, type Cell, type EquipmentRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { camposCopiadosText, lastNameplateCopy, nameplateCopyFields, nameplateIsEmpty, suggestNameplateCopy } from './nameplate-copy.ts';

const REL = '019966b0-0052-7000-8000-000000000001';
const OTHER_REL = '019966b0-0052-7000-8000-000000000002';
const LOC = '019966b0-0052-7000-8000-000000000003';
const PROJECT = '019966b0-0052-7000-8000-000000000004';
const OP = '019966b0-0052-7000-8000-000000000005';
const id = (n: number) => `019966b0-0052-7000-8000-0000000001${String(n).padStart(2, '0')}`;
const eqId = (n: number) => `019966b0-0052-7000-8000-0000000002${String(n).padStart(2, '0')}`;

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');

function block(n: number, nameplate: Record<string, unknown> = {}, over: Partial<BlockRow> = {}): BlockRow {
  return {
    id: id(n),
    relatorio_id: REL,
    location_id: LOC,
    equipment_id: eqId(n),
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v1',
    order_key: `a${n}`,
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), nameplate: Object.fromEntries(Object.entries(nameplate).map(([k, v]) => [k, cell(v)])) },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
    ...over,
  };
}

function equipment(n: number, over: Partial<EquipmentRow> = {}): EquipmentRow {
  return { id: eqId(n), project_id: PROJECT, tag: `SEC-C0${n}`, type: 'chave_seccionadora', last_nameplate: null, removed_at: null, ...over };
}

describe('5.3-UNIT suggestNameplateCopy (FR-34)', () => {
  it('offers the most recently edited same-type plate with a manufacturer when the target names none', () => {
    const older = block(1, { fabricacao: 'Celtta', n_serie: 'A1' }, { last_modified_at: '2026-09-06T10:00:00.000Z' });
    const newer = block(2, { fabricacao: 'ABB' }, { last_modified_at: '2026-09-06T11:00:00.000Z' });
    const target = block(3);
    const snapshot = { blocks: [older, newer, target], equipment: [equipment(1), equipment(2), equipment(3)] };
    expect(suggestNameplateCopy(snapshot, target.id)).toEqual({ sourceBlockId: newer.id, tag: 'SEC-C02' });
  });

  it('matches the manufacturer the target already knows (own cell, else its last issued plate)', () => {
    const celtta = block(1, { fabricacao: 'Celtta' }, { last_modified_at: '2026-09-06T10:00:00.000Z' });
    const abb = block(2, { fabricacao: 'ABB' }, { last_modified_at: '2026-09-06T11:00:00.000Z' });
    const own = block(3, { fabricacao: ' celtta ' });
    expect(suggestNameplateCopy({ blocks: [celtta, abb, own], equipment: [equipment(1), equipment(2), equipment(3)] }, own.id)?.sourceBlockId).toBe(celtta.id);
    const fromLast = block(4);
    const lastNameplate = { relatorio_id: OTHER_REL, revision_number: 1, issued_at: '2026-03-01T10:00:00.000Z', seed_version: 'v1', block_type: 'chave_seccionadora', fields: { fabricacao: 'Celtta' } };
    const snapshot = { blocks: [celtta, abb, fromLast], equipment: [equipment(1), equipment(2), equipment(4, { last_nameplate: lastNameplate })] };
    expect(suggestNameplateCopy(snapshot, fromLast.id)?.sourceBlockId).toBe(celtta.id);
    const nobody = block(5, { fabricacao: 'Siemens' });
    expect(suggestNameplateCopy({ blocks: [celtta, abb, nobody], equipment: [] }, nobody.id)).toBeNull();
  });

  it('is absent with no other live same-type block holding a manufacturer', () => {
    const target = block(1);
    const otherType = block(2, { fabricacao: 'ABB' }, { block_type: 'disjuntor_mt', config: defaultBlockConfig('v1', 'disjuntor_mt') });
    const removed = block(3, { fabricacao: 'ABB' }, { removed_at: '2026-09-06T10:00:00.000Z' });
    const noManufacturer = block(4, { n_serie: 'X' });
    const elsewhere = block(5, { fabricacao: 'ABB' }, { relatorio_id: OTHER_REL });
    expect(suggestNameplateCopy({ blocks: [target, otherType, removed, noManufacturer, elsewhere], equipment: [] }, target.id)).toBeNull();
    expect(suggestNameplateCopy({ blocks: [], equipment: [] }, target.id)).toBeNull();
  });

  it('copies the filled fields the target definition carries, in its order', () => {
    const source = block(1, { n_serie: 'A1', fabricacao: 'Celtta', corrente_nominal: { raw: '630', unit: 'A', state: 'measured' }, ghost: 'x', tipo: '' });
    expect(nameplateCopyFields(source, SEC)).toEqual([
      { fieldKey: 'fabricacao', value: 'Celtta' },
      { fieldKey: 'n_serie', value: 'A1' },
      { fieldKey: 'corrente_nominal', value: { raw: '630', unit: 'A', state: 'measured' } },
    ]);
    expect(nameplateIsEmpty(block(2))).toBe(true);
    expect(nameplateIsEmpty(block(2, { tipo: '  ' }))).toBe(true);
    expect(nameplateIsEmpty(source)).toBe(false);
  });
});

describe('5.3-UNIT lastNameplateCopy (AR-24)', () => {
  it('copies only the keys of the target definition, and nothing without a last plate', () => {
    const fields = { fabricacao: 'Celtta', n_serie: 'SU1', obsolete_key: 'x', tipo: null, corrente_nominal: { raw: '630', unit: 'A', state: 'measured' } };
    const row = equipment(1, { last_nameplate: { relatorio_id: OTHER_REL, revision_number: 2, issued_at: '2025-03-01T10:00:00.000Z', seed_version: 'v1', block_type: 'chave_seccionadora', fields } });
    expect(lastNameplateCopy(row, SEC)).toEqual([
      { fieldKey: 'fabricacao', value: 'Celtta' },
      { fieldKey: 'n_serie', value: 'SU1' },
      { fieldKey: 'corrente_nominal', value: { raw: '630', unit: 'A', state: 'measured' } },
    ]);
    expect(lastNameplateCopy(equipment(2), SEC)).toEqual([]);
    expect(camposCopiadosText(3)).toBe('3 campos copiados');
    expect(camposCopiadosText(1)).toBe('1 campo copiado');
  });
});
