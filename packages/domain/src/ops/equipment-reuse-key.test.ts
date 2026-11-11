import { describe, expect, it } from 'vitest';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { equipmentRowSchema, type BlockRow, type EquipmentRow, type LocationRow } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { applyOp, entityKey, type EntityState } from './apply.ts';
import { makeOp, type OpDraft } from './op.ts';
import { parsePath, PathError } from './path.ts';
import { replay } from './replay.ts';

/*
 * Story 24.21 (batch e24b, contract 42): the equipment's `reuse_key` is written once, in its
 * create, and nothing writes it after: a rename, a move of its sheet, a remove and a restore keep
 * it, and a put to `equipment/{id}/reuse_key` has no path. A row written before parses to the same
 * bytes.
 */

const ids = idSequence('019966b0-0080-7000-8000-');
const stamp = (draft: OpDraft, n: number) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: ids, now: T0 }), seq: n });

function obra(): { state: EntityState; relatorioId: string; drafts: OpDraft[] } {
  const made = instantiateTemplate(
    standardTemplate({ id: '019966b0-0081-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0082-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  return { state: replay(made.drafts.map((d, i) => stamp(d, i + 1))), relatorioId: made.relatorioId, drafts: made.drafts };
}

const put = (scope: 'project' | 'relatorio', relatorioId: string, path: string, value: unknown): OpDraft => ({
  scope,
  company_id: TEST_COMPANY,
  project_id: scope === 'project' ? TEST_PROJECT : null,
  relatorio_id: scope === 'relatorio' ? relatorioId : null,
  prev_op_id: null,
  batch_id: null,
  meta: null,
  actor_id: TEST_USER,
  kind: 'put',
  path,
  value: value as never,
});

describe('24.21-UNIT the fold keeps the reuse key', () => {
  it('a create keeps the key; a rename, a move of its sheet, a remove and a restore leave it unchanged', () => {
    const { state: start, relatorioId } = obra();
    const rows = [...start.values()];
    const equipment = rows.filter((row): row is EquipmentRow => 'last_nameplate' in row);
    const breaker = equipment.find((row) => row.reuse_key === 'DJ-C05')!;
    expect(breaker.tag).toMatch(/^DJ-\d{2}$/);
    const key = entityKey('equipment', breaker.id);
    const block = rows.find((row): row is BlockRow => 'equipment_id' in row && (row as BlockRow).equipment_id === breaker.id)!;
    const coluna9 = rows.find((row): row is LocationRow => 'kind' in row && (row as LocationRow).name === 'Coluna 9')!;
    let state = start;
    const steps: [string, OpDraft][] = [
      ['rename', put('project', relatorioId, `equipment/${breaker.id}/tag`, '52-1')],
      ['move', put('relatorio', relatorioId, `block/${block.id}/location_id`, coluna9.id)],
      ['remove', put('project', relatorioId, `equipment/${breaker.id}/removed_at`, '2026-10-01T10:00:00.000Z')],
      ['restore', put('project', relatorioId, `equipment/${breaker.id}/removed_at`, null)],
    ];
    for (const [n, [name, draft]] of steps.entries()) {
      state = applyOp(state, stamp(draft, 1000 + n));
      expect((state.get(key) as EquipmentRow).reuse_key, name).toBe('DJ-C05');
    }
    expect((state.get(key) as EquipmentRow).tag).toBe('52-1');
  });

  it('a put to a key path is refused: no family parses it, and the fold throws', () => {
    const { state, relatorioId } = obra();
    const breaker = [...state.values()].find((row): row is EquipmentRow => 'last_nameplate' in row && (row as EquipmentRow).reuse_key === 'DJ-C05')!;
    expect(() => parsePath(`equipment/${breaker.id}/reuse_key`)).toThrow(PathError);
    expect(() => applyOp(state, { ...stamp(put('project', relatorioId, `equipment/${breaker.id}/tag`, 'X'), 2000), path: `equipment/${breaker.id}/reuse_key` })).toThrow();
  });

  it('a row written before the key parses to the same bytes, and a keyed row keeps its key through the schema', () => {
    const old: EquipmentRow = { id: '019966b0-0083-7000-8000-000000000001', project_id: TEST_PROJECT, tag: 'DJ-C05', type: 'disjuntor_mt', last_nameplate: null, removed_at: null };
    expect(JSON.stringify(equipmentRowSchema.parse(old))).toBe(JSON.stringify(old));
    expect('reuse_key' in equipmentRowSchema.parse(old)).toBe(false);
    const keyed = { ...old, reuse_key: 'DJ-C05' };
    expect(equipmentRowSchema.parse(keyed)).toEqual(keyed);
  });
});
