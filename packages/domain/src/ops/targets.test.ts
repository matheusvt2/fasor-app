import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { opLog as portoSeguroLog } from '../../fixtures/porto-seguro/op-log.ts';
import { opLog as portoSeguroSmallLog } from '../../fixtures/porto-seguro/small/op-log.ts';
import { opLog as replaySmallLog } from '../../fixtures/replay-small/op-log.ts';
import { uuidV7Schema } from '../ids.ts';
import { cellSchema, entityRowSchemas, type EntityRow } from '../schemas/entities.ts';
import { opSchema, type Op } from './op.ts';
import { parsePath } from './path.ts';
import {
  createProjectOf,
  REFERENCE_FIELDS,
  referenceRowVerdict,
  responsibleUserIdOf,
  targetLookupOf,
  targetRowVerdict,
  valueReferencesOf,
} from './targets.ts';

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
    expect(valueReferencesOf(point('equipment_id', EQUIPMENT), parsePath(`point/${BLOCK}/equipment_id`))).toEqual([{ entity: 'equipment', id: EQUIPMENT, scope: 'obra', field: 'point.equipment_id' }]);
    expect(valueReferencesOf(point('location_id', LOCATION), parsePath(`point/${BLOCK}/location_id`))).toEqual([{ entity: 'location', id: LOCATION, scope: 'relatorio', field: 'point.location_id' }]);
    expect(valueReferencesOf(point('location_id', null), parsePath(`point/${BLOCK}/location_id`))).toEqual([]);
    const move = op({ kind: 'put', path: `block/${BLOCK}/location_id`, value: LOCATION });
    expect(valueReferencesOf(move, parsePath(move.path))).toEqual([{ entity: 'location', id: LOCATION, scope: 'relatorio', field: 'block.location_id' }]);
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

/** The guard walk: every leaf of `schema` that is `uuidV7Schema`, by pointer; arrays as `[]`, records as `*`, a cell re-rooted at `cell`. */
function idLeaves(schema: z.ZodType, pointer: string, out: Set<string>): void {
  let at: z.ZodType = schema;
  for (;;) {
    if (at instanceof z.ZodOptional || at instanceof z.ZodNullable || at instanceof z.ZodDefault) at = at.unwrap() as z.ZodType;
    else break;
  }
  if (at === (uuidV7Schema as z.ZodType)) {
    out.add(pointer);
    return;
  }
  if (at === (cellSchema as z.ZodType) && pointer !== 'cell') {
    idLeaves(cellSchema, 'cell', out);
    return;
  }
  if (at instanceof z.ZodObject) {
    for (const [key, child] of Object.entries(at.shape as Record<string, z.ZodType>)) idLeaves(child, `${pointer}.${key}`, out);
    return;
  }
  if (at instanceof z.ZodUnion || at instanceof z.ZodDiscriminatedUnion) {
    for (const option of at.options as readonly z.ZodType[]) idLeaves(option, pointer, out);
    return;
  }
  if (at instanceof z.ZodArray) idLeaves(at.element as z.ZodType, `${pointer}[]`, out);
  else if (at instanceof z.ZodRecord) idLeaves(at.valueType as z.ZodType, `${pointer}.*`, out);
  // A lazy schema is the open JSON value (a cell's value, a block config): no uuid leaf.
}

describe('REFERENCE_FIELDS (e20f)', () => {
  it('guard: every uuid leaf of the row schemas and of the op schema has an entry, and every entry is such a leaf', () => {
    const leaves = new Set<string>();
    for (const [entity, schema] of Object.entries(entityRowSchemas)) idLeaves(schema as z.ZodType, entity, leaves);
    idLeaves(opSchema as unknown as z.ZodType, 'op', leaves);
    const table = new Set(REFERENCE_FIELDS.map((field) => field.pointer));
    expect([...leaves].filter((pointer) => !table.has(pointer)), 'uuid leaves with no REFERENCE_FIELDS entry').toEqual([]);
    expect([...table].filter((pointer) => !leaves.has(pointer)), 'entries that are no uuid leaf of any schema').toEqual([]);
    for (const pointer of ['location.parent_id', 'block.feeds_block_id', 'relatorio.setup.instrument_ids[]', 'project.client_id', 'cell.op_id', 'op.meta.source_suggestion_id']) expect(leaves).toContain(pointer);
  });

  it('names each pointer once, and gives every exemption a one-line reason', () => {
    const pointers = REFERENCE_FIELDS.map((field) => field.pointer);
    expect(new Set(pointers).size).toBe(pointers.length);
    for (const field of REFERENCE_FIELDS) {
      if (!('exempt' in field)) continue;
      expect(field.exempt.trim().length, field.pointer).toBeGreaterThan(0);
      expect(field.exempt.includes('\n'), field.pointer).toBe(false);
    }
  });

  it('the references of the spec, each with its entity and scope', () => {
    const rule = (pointer: string) => REFERENCE_FIELDS.find((field) => field.pointer === pointer);
    expect(rule('location.parent_id')).toMatchObject({ reference: { entity: 'location', scope: 'relatorio' } });
    expect(rule('block.feeds_block_id')).toMatchObject({ reference: { entity: 'block', scope: 'relatorio' } });
    expect(rule('relatorio.setup.cover_photo_file_id')).toMatchObject({ reference: { entity: 'file', scope: 'relatorio' } });
    expect(rule('relatorio.setup.instrument_ids[]')).toMatchObject({ reference: { entity: 'registry', kind: 'instrument', scope: 'company' } });
    expect(rule('relatorio.template_id')).toHaveProperty('exempt');
    expect(rule('project.client_id')).toMatchObject({ reference: { entity: 'registry', kind: 'client', scope: 'company' } });
    expect(rule('registry.logo_file_id')).toMatchObject({ reference: { entity: 'file', scope: 'company' } });
    expect(rule('op.meta.source_suggestion_id')).toMatchObject({ reference: { entity: 'suggestion', scope: 'relatorio' } });
    expect(rule('relatorio.setup.responsible_user_id')).toHaveProperty('exempt');
  });
});

describe('valueReferencesOf over every reference field (e20f)', () => {
  const LOCATION = '019966c1-0000-7000-8000-0000000000c2';
  const INSTRUMENT = '019966c1-0000-7000-8000-0000000000c3';
  const FILE = '019966c1-0000-7000-8000-0000000000c4';
  const TEMPLATE = '019966c1-0000-7000-8000-0000000000c5';
  const SUGGESTION = '019966c1-0000-7000-8000-0000000000c6';
  const refs = (o: Op) => valueReferencesOf(o, parsePath(o.path)).map(({ entity, id, kind, scope, field }) => ({ entity, id, kind, scope, field }));

  it('a local\'s parent, a block\'s feeding block, the cover photo and the instruments of setup', () => {
    expect(refs(op({ kind: 'put', path: `location/${LOCATION}/parent_id`, value: BLOCK }))).toEqual([{ entity: 'location', id: BLOCK, kind: undefined, scope: 'relatorio', field: 'location.parent_id' }]);
    expect(refs(op({ kind: 'put', path: `location/${LOCATION}/parent_id`, value: null }))).toEqual([]);
    expect(refs(op({ kind: 'put', path: `block/${BLOCK}/feeds_block_id`, value: LOCATION }))).toEqual([{ entity: 'block', id: LOCATION, kind: undefined, scope: 'relatorio', field: 'block.feeds_block_id' }]);
    expect(refs(op({ kind: 'put', path: 'relatorio/setup/cover_photo_file_id', value: FILE }))).toEqual([{ entity: 'file', id: FILE, kind: undefined, scope: 'relatorio', field: 'relatorio.setup.cover_photo_file_id' }]);
    expect(refs(op({ kind: 'put', path: 'relatorio/setup/instrument_ids', value: [INSTRUMENT, FILE] }))).toEqual([
      { entity: 'registry', id: INSTRUMENT, kind: 'instrument', scope: 'company', field: 'relatorio.setup.instrument_ids[]' },
      { entity: 'registry', id: FILE, kind: 'instrument', scope: 'company', field: 'relatorio.setup.instrument_ids[]' },
    ]);
  });

  it('a project\'s client, a relatório create\'s template and instruments, a registry\'s files, and a confirm\'s suggestion', () => {
    expect(refs(op({ kind: 'put', path: `project/${PROJECT}/client_id`, scope: 'company', relatorio_id: null, value: CLIENT }))).toEqual([{ entity: 'registry', id: CLIENT, kind: 'client', scope: 'company', field: 'project.client_id' }]);
    const create = op({
      kind: 'create',
      path: `relatorio/${R1}`,
      value: { id: R1, project_id: PROJECT, template_id: TEMPLATE, template_version: 1, seed_version: 'v1', status: 'rascunho', setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: USER, cover_photo_file_id: FILE, instrument_ids: [INSTRUMENT] }, export: { scheme: 'por_local_e_tipo' }, preview_file_id: null, removed_at: null },
    });
    expect(refs(create).map((r) => r.field)).toEqual(['relatorio.setup.cover_photo_file_id', 'relatorio.setup.instrument_ids[]']);
    expect(refs(op({ kind: 'put', path: `registry/empresa/${CLIENT}/logo_file_id`, scope: 'company', relatorio_id: null, value: FILE }))).toEqual([{ entity: 'file', id: FILE, kind: undefined, scope: 'company', field: 'registry.logo_file_id' }]);
    expect(refs(op({ kind: 'put', path: `sheet/${BLOCK}/observations`, value: 'x', meta: { source_suggestion_id: SUGGESTION } }))).toEqual([{ entity: 'suggestion', id: SUGGESTION, kind: undefined, scope: 'relatorio', field: 'op.meta.source_suggestion_id' }]);
    expect(refs(op({ kind: 'remove', path: `point/${BLOCK}/removed_at` }))).toEqual([]);
  });

  it('a registry row must be of the kind the field names; a file filed company-wide may be a relatório\'s cover photo', () => {
    const instruments = op({ kind: 'put', path: 'relatorio/setup/instrument_ids', value: [INSTRUMENT] });
    const ref = valueReferencesOf(instruments, parsePath(instruments.path))[0]!;
    expect(referenceRowVerdict(instruments, ref, { id: INSTRUMENT, kind: 'instrument' } as unknown as EntityRow, PROJECT)).toBe('allowed');
    expect(referenceRowVerdict(instruments, ref, { id: INSTRUMENT, kind: 'client' } as unknown as EntityRow, PROJECT)).toBe('refused');
    const cover = op({ kind: 'put', path: 'relatorio/setup/cover_photo_file_id', value: FILE });
    const coverRef = valueReferencesOf(cover, parsePath(cover.path))[0]!;
    expect(referenceRowVerdict(cover, coverRef, { id: FILE, relatorio_id: null } as unknown as EntityRow, PROJECT)).toBe('allowed');
    expect(referenceRowVerdict(cover, coverRef, { id: FILE, relatorio_id: R1 } as unknown as EntityRow, PROJECT)).toBe('allowed');
    expect(referenceRowVerdict(cover, coverRef, { id: FILE, relatorio_id: R2 } as unknown as EntityRow, PROJECT)).toBe('refused');
    const parent = op({ kind: 'put', path: `location/${LOCATION}/parent_id`, value: BLOCK });
    const parentRef = valueReferencesOf(parent, parsePath(parent.path))[0]!;
    expect(referenceRowVerdict(parent, parentRef, { id: BLOCK, relatorio_id: R2 } as unknown as EntityRow, PROJECT)).toBe('refused');
  });
});

describe('the fixture logs name only rows they hold (e20f)', () => {
  it('no op of the three fixture logs names a missing or misplaced row', () => {
    for (const [name, log] of [['porto-seguro', portoSeguroLog], ['porto-seguro/small', portoSeguroSmallLog], ['replay-small', replaySmallLog]] as const) {
      const rows = new Map<string, EntityRow>();
      let checked = 0;
      for (const entry of log) {
        const path = parsePath(entry.path);
        const relatorioProject = entry.relatorio_id == null ? null : ((rows.get(entry.relatorio_id) as { project_id?: string } | undefined)?.project_id ?? null);
        for (const reference of valueReferencesOf(entry, path)) {
          expect(referenceRowVerdict(entry, reference, rows.get(reference.id), relatorioProject), `${name} ${entry.path} ${reference.field}`).toBe('allowed');
          checked++;
        }
        if (entry.kind === 'create') rows.set((entry.value as { id: string }).id, entry.value as EntityRow);
      }
      expect(checked, name).toBeGreaterThan(0);
    }
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
