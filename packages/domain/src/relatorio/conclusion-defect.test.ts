import { describe, expect, it, vi } from 'vitest';
import type { BlockRow } from '../schemas/entities.ts';

/*
 * Story 22.4: a Não ensaiado reason the seed flags `defect: true` concludes the sheet Reprovado
 * · Com restrições. No shipped seed has one (seed v12, Story 22.7, owns the real reason), so a
 * test seed stands behind `findSeed`: v11 with one more reason, parsed by the real schema.
 */

vi.mock('../seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../seed/definitions.ts')>();
  const { reportSeedSchema } = await import('../seed/schema.ts');
  const v11 = actual.getSeed('v11', 'cabine_primaria');
  const testSeed = reportSeedSchema.parse({
    ...v11,
    not_tested_reasons: [...v11.not_tested_reasons, { key: 'defeito_teste', label: 'Defeito constatado', justification: 'Equipamento com defeito constatado.', defect: true }],
  });
  return { ...actual, findSeed: (version: string) => (version === 'v11' ? testSeed : actual.findSeed(version)) };
});

const { conclusionFloor, effectiveConclusionPair } = await import('./conclusion.ts');
const { isDefectReason } = await import('../seed/defect-reason.ts');
const { getSeed } = await import('../seed/definitions.ts');
const { notTestedReasonSchema } = await import('../seed/schema.ts');
const { emptySheet } = await import('../schemas/entities.ts');
const { defaultBlockConfig } = await import('../seed/template.ts');

const ID = '019966b0-0052-7000-8000-000000000001';

function block(reason: string): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v11', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v11',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: { reason, text: null, at: '2026-11-06T12:00:00.000Z', by: ID },
    concluded_by: null,
    sheet: emptySheet(),
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

describe('22.4-UNIT a defect Não ensaiado reason (test seed)', () => {
  it('the schema takes the optional flag; no shipped seed sets it', () => {
    expect(notTestedReasonSchema.parse({ key: 'x', label: 'X', justification: null, defect: true }).defect).toBe(true);
    expect('defect' in notTestedReasonSchema.parse({ key: 'x', label: 'X', justification: null })).toBe(false);
    for (const version of ['v1', 'v5', 'v11']) expect(getSeed(version, 'cabine_primaria').not_tested_reasons.some((reason) => reason.defect === true)).toBe(false);
  });

  it('a sheet marked Não ensaiado for a defect reason concludes Reprovado · Com restrições; any other reason gives no floor', () => {
    expect(isDefectReason('v11', 'defeito_teste')).toBe(true);
    expect(isDefectReason('v11', 'solicitacao_cliente')).toBe(false);
    expect(isDefectReason('v5', 'defeito_teste')).toBe(false);
    expect(conclusionFloor(block('defeito_teste'))).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['defect'] });
    expect(effectiveConclusionPair(block('defeito_teste'))).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    expect(conclusionFloor(block('solicitacao_cliente'))).toBeNull();
  });
});
