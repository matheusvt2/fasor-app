import { describe, expect, it } from 'vitest';
import { opSchema, type Op } from './op.ts';
import { parsePath } from './path.ts';
import { createProjectOf, referenceRowVerdict, responsibleUserIdOf, targetLookupOf, targetRowVerdict, valueReferencesOf } from './targets.ts';
import type { EntityRow } from '../schemas/entities.ts';

/*
 * Story 20.10 (contract 29, security pass S5): what the server must find before a client op
 * applies, and whether the row it finds may take it. Written red-first.
 */

const COMPANY = '019966c1-0000-7000-8000-00000000000c';
const R1 = '019966c1-0000-7000-8000-0000000000a1';
const R2 = '019966c1-0000-7000-8000-0000000000a2';
const PROJECT = '019966c1-0000-7000-8000-0000000000d1';
const OTHER_PROJECT = '019966c1-0000-7000-8000-0000000000d2';
const BLOCK = '019966c1-0000-7000-8000-0000000000b1';
const EQUIPMENT = '019966c1-0000-7000-8000-0000000000e1';
const CLIENT = '019966c1-0000-7000-8000-0000000000c1';
const USER = '019966c1-0000-7000-8000-0000000000f1';

let seq = 0;
function op(input: Partial<Op> & Pick<Op, 'path' | 'kind'>): Op {
  seq += 1;
  return opSchema.parse({
    op_id: `019966c1-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: R1,
    value: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER,
    device_id: 'tablet-1',
    client_ts: '2026-11-03T12:00:00.000Z',
    ...input,
  });
}

const lookup = (o: Op) => targetLookupOf(o, parsePath(o.path));
const block = (relatorioId: string) => ({ id: BLOCK, relatorio_id: relatorioId }) as unknown as EntityRow;

describe('targetLookupOf (Story 20.10)', () => {
  it('a put or remove looks for its target row; an implicit family for the op\'s own relatório', () => {
    expect(lookup(op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x' }))).toEqual({ kind: 'row', entity: 'block', id: BLOCK });
    expect(lookup(op({ kind: 'put', path: 'relatorio/setup/local', value: 'x' }))).toEqual({ kind: 'row', entity: 'relatorio', id: R1 });
    expect(lookup(op({ kind: 'remove', path: 'relatorio/removed_at' }))).toEqual({ kind: 'row', entity: 'relatorio', id: R1 });
  });

  it('a create naming a relatório needs that relatório; a relatório create must be filed under its own id', () => {
    expect(lookup(op({ kind: 'create', path: `point/${BLOCK}`, value: { id: BLOCK, relatorio_id: R1, text: 'x', equipment_id: null, origin: 'manual', order_key: 'a', removed_at: null } }))).toEqual({ kind: 'relatorio', id: R1 });
    const relatorio = (id: string, filedUnder: string) =>
      op({
        kind: 'create',
        path: `relatorio/${id}`,
        relatorio_id: filedUnder,
        value: { id, project_id: PROJECT, template_id: null, template_version: null, seed_version: 'v1', status: 'rascunho', setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null }, export: { scheme: 'por_local_e_tipo' }, preview_file_id: null, removed_at: null },
      });
    expect(lookup(relatorio(R1, R1))).toEqual({ kind: 'none' });
    expect(lookup(relatorio(R1, R2))).toEqual({ kind: 'refused' });
    expect(lookup(op({ kind: 'create', scope: 'company', relatorio_id: null, path: `registry/client/${CLIENT}`, value: { id: CLIENT, kind: 'client', name: 'C', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null } }))).toEqual({ kind: 'none' });
  });
});

describe('targetRowVerdict (Story 20.10)', () => {
  it('S5 missing row: a put on a row the server does not hold is refused', () => {
    expect(targetRowVerdict(op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x' }), 'block', undefined)).toBe('refused');
  });

  it('S5 misfiled: a put on R1\'s block filed under R2 is refused; under R1 it applies, tombstoned or not', () => {
    const put = op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x', relatorio_id: R2 });
    expect(targetRowVerdict(put, 'block', block(R1))).toBe('refused');
    const own = op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x' });
    expect(targetRowVerdict(own, 'block', block(R1))).toBe('allowed');
    expect(targetRowVerdict(own, 'block', { ...(block(R1) as object), removed_at: '2026-11-01T00:00:00.000Z' } as unknown as EntityRow)).toBe('allowed');
  });

  it('an equipment row belongs to the op\'s obra; a company-scope row has no parent to check', () => {
    const tag = op({ kind: 'put', scope: 'project', relatorio_id: null, project_id: PROJECT, path: `equipment/${EQUIPMENT}/tag`, value: 'TR-01' });
    expect(targetRowVerdict(tag, 'equipment', { id: EQUIPMENT, project_id: PROJECT } as unknown as EntityRow)).toBe('allowed');
    expect(targetRowVerdict(tag, 'equipment', { id: EQUIPMENT, project_id: OTHER_PROJECT } as unknown as EntityRow)).toBe('refused');
    const name = op({ kind: 'put', scope: 'company', relatorio_id: null, path: `registry/client/${CLIENT}/name`, value: 'C' });
    expect(targetRowVerdict(name, 'registry', { id: CLIENT, kind: 'client' } as unknown as EntityRow)).toBe('allowed');
  });

  it('the relatório itself, for an implicit family, is its own relatório', () => {
    const local = op({ kind: 'put', path: 'relatorio/setup/local', value: 'x' });
    expect(targetRowVerdict(local, 'relatorio', { id: R1, project_id: PROJECT } as unknown as EntityRow)).toBe('allowed');
  });
});

describe('createProjectOf (Story 20.10, review)', () => {
  it('names the obra an equipment or a relatório create files its row under, and nothing for any other op', () => {
    const equipment = op({ kind: 'create', scope: 'project', relatorio_id: null, project_id: PROJECT, path: `equipment/${EQUIPMENT}`, value: { id: EQUIPMENT, project_id: PROJECT, tag: 'TR-01', type: 'transformador_forca', last_nameplate: null, removed_at: null } });
    expect(createProjectOf(equipment, parsePath(equipment.path))).toBe(PROJECT);
    const relatorio = op({
      kind: 'create',
      path: `relatorio/${R1}`,
      value: { id: R1, project_id: OTHER_PROJECT, template_id: null, template_version: null, seed_version: 'v1', status: 'rascunho', setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null }, export: { scheme: 'por_local_e_tipo' }, preview_file_id: null, removed_at: null },
    });
    expect(createProjectOf(relatorio, parsePath(relatorio.path))).toBe(OTHER_PROJECT);
    const tag = op({ kind: 'put', scope: 'project', relatorio_id: null, project_id: PROJECT, path: `equipment/${EQUIPMENT}/tag`, value: 'TR-02' });
    expect(createProjectOf(tag, parsePath(tag.path))).toBeNull();
  });
});

describe('valueReferencesOf and referenceRowVerdict (Story 20.10, review)', () => {
  const LOCATION = '019966c1-0000-7000-8000-0000000000c2';
  const point = (field: 'equipment_id' | 'location_id', value: string | null) => op({ kind: 'put', path: `point/${BLOCK}/${field}`, value });

  it('names the rows a value points at, on a create and on the put of that field; a null names nothing', () => {
    expect(valueReferencesOf(point('equipment_id', EQUIPMENT), parsePath(`point/${BLOCK}/equipment_id`))).toEqual([{ entity: 'equipment', id: EQUIPMENT, field: 'equipment_id' }]);
    expect(valueReferencesOf(point('location_id', LOCATION), parsePath(`point/${BLOCK}/location_id`))).toEqual([{ entity: 'location', id: LOCATION, field: 'location_id' }]);
    expect(valueReferencesOf(point('location_id', null), parsePath(`point/${BLOCK}/location_id`))).toEqual([]);
    const move = op({ kind: 'put', path: `block/${BLOCK}/location_id`, value: LOCATION });
    expect(valueReferencesOf(move, parsePath(move.path))).toEqual([{ entity: 'location', id: LOCATION, field: 'location_id' }]);
    const text = op({ kind: 'put', path: `point/${BLOCK}/text`, value: LOCATION });
    expect(valueReferencesOf(text, parsePath(text.path))).toEqual([]);
    const block = op({
      kind: 'create',
      path: `block/${BLOCK}`,
      value: { id: BLOCK, relatorio_id: R1, location_id: LOCATION, equipment_id: EQUIPMENT, block_type: 'chave_seccionadora', config: {}, seed_version: 'v1', order_key: 'a0', feeds_block_id: null, not_tested: null, concluded_by: null, sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null }, created_by: null, first_edited_at: null, last_modified_by: null, last_modified_at: null, removed_at: null },
    });
    expect(valueReferencesOf(block, parsePath(block.path)).map((ref) => ref.entity)).toEqual(['location', 'equipment']);
  });

  it('a reference must exist and belong to the op\'s relatório (an equipment: its obra)', () => {
    const put = point('location_id', LOCATION);
    const ref = valueReferencesOf(put, parsePath(put.path))[0]!;
    expect(referenceRowVerdict(put, ref, undefined, PROJECT)).toBe('refused');
    expect(referenceRowVerdict(put, ref, { id: LOCATION, relatorio_id: R1 } as unknown as EntityRow, PROJECT)).toBe('allowed');
    expect(referenceRowVerdict(put, ref, { id: LOCATION, relatorio_id: R2 } as unknown as EntityRow, PROJECT)).toBe('refused');
    const relink = point('equipment_id', EQUIPMENT);
    const equipmentRef = valueReferencesOf(relink, parsePath(relink.path))[0]!;
    expect(referenceRowVerdict(relink, equipmentRef, { id: EQUIPMENT, project_id: PROJECT } as unknown as EntityRow, PROJECT)).toBe('allowed');
    expect(referenceRowVerdict(relink, equipmentRef, { id: EQUIPMENT, project_id: OTHER_PROJECT } as unknown as EntityRow, PROJECT)).toBe('refused');
  });
});

describe('responsibleUserIdOf (Story 20.10)', () => {
  it('names the user a responsible_user_id put or a relatório create sets, and nothing else', () => {
    expect(responsibleUserIdOf(op({ kind: 'put', path: 'relatorio/setup/responsible_user_id', value: USER }), parsePath('relatorio/setup/responsible_user_id'))).toBe(USER);
    expect(responsibleUserIdOf(op({ kind: 'put', path: 'relatorio/setup/responsible_user_id', value: null }), parsePath('relatorio/setup/responsible_user_id'))).toBeNull();
    expect(responsibleUserIdOf(op({ kind: 'put', path: 'relatorio/setup/responsible_user_id', value: 'nobody' }), parsePath('relatorio/setup/responsible_user_id'))).toBeNull();
    expect(responsibleUserIdOf(op({ kind: 'put', path: 'relatorio/setup/local', value: USER }), parsePath('relatorio/setup/local'))).toBeNull();
    const create = op({
      kind: 'create',
      path: `relatorio/${R1}`,
      value: { id: R1, project_id: PROJECT, template_id: null, template_version: null, seed_version: 'v1', status: 'rascunho', setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: USER, cover_photo_file_id: null }, export: { scheme: 'por_local_e_tipo' }, preview_file_id: null, removed_at: null },
    });
    expect(responsibleUserIdOf(create, parsePath(create.path))).toBe(USER);
  });
});
