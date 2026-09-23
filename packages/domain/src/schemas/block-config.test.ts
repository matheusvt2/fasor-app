import { describe, expect, it } from 'vitest';
import { NOT_TESTED_REASON_KEYS, SEED_VERSIONS } from '../seed/definitions.ts';
import { blockConfigSchema, MAX_QUANTITY, skeletonNodeSchema, templateBlockSchema } from './block-config.ts';
import { locationRowSchema, notTestedSchema } from './entities.ts';

/* Epic 3 review K4 and K5: the kernel guards these shapes on its own, not only the UI. */

const equipmentBlock = (overrides: Record<string, unknown> = {}) => ({
  block_type: 'chave_seccionadora',
  subtype: 'manual',
  sub_blocks: {},
  na_defaults: ['motor', 'fusiveis'],
  quantity: 1,
  skeleton_location_ref: 'enel',
  section_text: null,
  ...overrides,
});

describe('K5 template block guards', () => {
  it('accepts a quantity from 1 to MAX_QUANTITY (99), the Quantity stepper limit', () => {
    expect(MAX_QUANTITY).toBe(99);
    expect(templateBlockSchema.safeParse(equipmentBlock({ quantity: 1 })).success).toBe(true);
    expect(templateBlockSchema.safeParse(equipmentBlock({ quantity: MAX_QUANTITY })).success).toBe(true);
  });

  it('refuses a quantity of 0 or above MAX_QUANTITY', () => {
    expect(templateBlockSchema.safeParse(equipmentBlock({ quantity: 0 })).success).toBe(false);
    expect(templateBlockSchema.safeParse(equipmentBlock({ quantity: MAX_QUANTITY + 1 })).success).toBe(false);
  });

  it('refuses a repeated na_defaults item, on a block config and on a template block', () => {
    const repeated = { block_type: 'chave_seccionadora', sub_blocks: {}, na_defaults: ['motor', 'fusiveis', 'motor'] };
    expect(blockConfigSchema.safeParse(repeated).success).toBe(false);
    expect(templateBlockSchema.safeParse(equipmentBlock({ na_defaults: ['motor', 'motor'] })).success).toBe(false);
    expect(blockConfigSchema.safeParse({ ...repeated, na_defaults: ['motor', 'fusiveis'] }).success).toBe(true);
  });
});

describe('K5 skeleton node and location name guards', () => {
  const cabine = (name: string) => ({ ref: 'enel', kind: 'cabine', parent_ref: null, name, agrupar_por_tipo: false });
  const coluna = (name: string) => ({ ref: 'c1', kind: 'coluna', parent_ref: 'enel', name });
  const location = (name: string) => ({
    id: '019966d0-0000-7000-8000-000000000001',
    relatorio_id: '019966d0-0000-7000-8000-000000000002',
    parent_id: '019966d0-0000-7000-8000-000000000003',
    kind: 'coluna',
    name,
    order_key: 'a0',
    removed_at: null,
  });

  it('refuses an empty or blank name on a cabine, a coluna and a location row', () => {
    for (const name of ['', ' ', '  \t ']) {
      expect(skeletonNodeSchema.safeParse(cabine(name)).success).toBe(false);
      expect(skeletonNodeSchema.safeParse(coluna(name)).success).toBe(false);
      expect(locationRowSchema.safeParse(location(name)).success).toBe(false);
    }
  });

  it('accepts a name with text, keeping it as written', () => {
    expect(skeletonNodeSchema.parse(cabine('Cubículo 1')).name).toBe('Cubículo 1');
    expect(skeletonNodeSchema.parse(coluna(' Coluna 2 ')).name).toBe(' Coluna 2 ');
    expect(locationRowSchema.parse(location('Coluna 3')).name).toBe('Coluna 3');
  });
});

describe('K4 not_tested.reason is a seed key', () => {
  const notTested = (reason: string) => ({ reason, text: null, at: '2026-09-06T08:00:00.000Z', by: '019966d0-0000-7000-8000-000000000004' });

  it('offers exactly the not_tested_reasons keys of every shipped seed version', () => {
    const seedKeys = new Set(Object.values(SEED_VERSIONS).flatMap((b) => Object.values(b.report_types).flatMap((s) => s.not_tested_reasons.map((r) => r.key))));
    expect([...NOT_TESTED_REASON_KEYS].sort()).toEqual([...seedKeys].sort());
    expect(NOT_TESTED_REASON_KEYS).toEqual(expect.arrayContaining(['impossibilidade_desligamento', 'solicitacao_cliente', 'outro']));
  });

  it('accepts every seed key', () => {
    for (const key of NOT_TESTED_REASON_KEYS) expect(notTestedSchema.safeParse(notTested(key)).success).toBe(true);
  });

  it('refuses a pt-BR label, an unknown key and an empty reason', () => {
    for (const reason of ['Solicitação do cliente', 'Impossibilidade de desligamento', 'sem_motivo', '']) {
      expect(notTestedSchema.safeParse(notTested(reason)).success).toBe(false);
    }
  });
});
