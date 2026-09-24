import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow, type FileRow, type LocationRow } from '../schemas/entities.ts';
import { opFactory, TEST_COMPANY, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { applyOp, entityKey, readPath, targetsOf, type EntityState } from './apply.ts';
import type { Op } from './op.ts';

const LOC = '019966b0-0004-7000-8000-000000000001';
const COL = '019966b0-0004-7000-8000-000000000002';
const B1 = '019966b0-0004-7000-8000-000000000003';
const B2 = '019966b0-0004-7000-8000-000000000004';
const PHOTO = '019966b0-0004-7000-8000-000000000005';
const LOGO = '019966b0-0004-7000-8000-000000000006';
const SUG = '019966b0-0004-7000-8000-000000000007';
const OTHER_USER = '019966b0-0004-7000-8000-000000000008';

const cabine = (): LocationRow => ({
  id: LOC,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: 'Cabine',
  order_key: 'a0',
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
  removed_at: null,
});

const coluna = (): LocationRow => ({
  id: COL,
  relatorio_id: TEST_RELATORIO,
  parent_id: LOC,
  kind: 'coluna',
  name: 'Coluna 1',
  order_key: 'a0',
  removed_at: null,
});

const block = (id: string): BlockRow => ({
  id,
  relatorio_id: TEST_RELATORIO,
  location_id: LOC,
  equipment_id: null,
  block_type: 'disjuntor_mt',
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
});

const photo = (blockId: string | null): FileRow => ({
  id: PHOTO,
  company_id: TEST_COMPANY,
  relatorio_id: TEST_RELATORIO,
  kind: 'photo',
  sha256: 'c'.repeat(64),
  mime: 'image/jpeg',
  size: 10,
  uploaded_at: null,
  variants: null,
  removed_at: null,
  captured_at: '2026-09-21T12:00:00.000Z',
  tz_offset: -180,
  coords: null,
  local_seq: 1,
  block_id: blockId,
  item_key: null,
  caption: null,
  reading_kind: null,
  reading_target: null,
  reading_status: 'none',
});

const state = (...rows: [string, unknown][]): EntityState => new Map(rows as never);
const fold = (initial: EntityState, ops: Op[]) => ops.reduce((s, op) => applyOp(s, op), initial);

describe('1.4-UNIT-002 applyOp semantics', () => {
  it('creates a row from the op value and a second create is a no-op', () => {
    const f = opFactory();
    const create = f.op({ kind: 'create', path: `location/${LOC}`, value: cabine() });
    const s1 = applyOp(state(), create);
    expect(s1.get(entityKey('location', LOC))).toEqual(cabine());
    const again = f.op({ kind: 'create', path: `location/${LOC}`, value: { ...cabine(), name: 'Other' } });
    const s2 = applyOp(s1, again);
    expect(s2.get(entityKey('location', LOC))).toBe(s1.get(entityKey('location', LOC)));
  });

  it('remove sets removed_at from client_ts and put removed_at = null restores', () => {
    const f = opFactory();
    const key = entityKey('location', LOC);
    const remove = f.op({ kind: 'remove', path: `location/${LOC}/removed_at`, value: null });
    const s1 = applyOp(state([key, cabine()]), remove);
    expect((s1.get(key) as LocationRow).removed_at).toBe(remove.client_ts);
    const restore = f.op({ path: `location/${LOC}/removed_at`, value: null });
    const s2 = applyOp(s1, restore);
    expect((s2.get(key) as LocationRow).removed_at).toBeNull();
  });

  it('reorders through order_key and writes plain fields', () => {
    const f = opFactory();
    const key = entityKey('block', B1);
    const s = fold(state([key, block(B1)]), [
      f.op({ path: `block/${B1}/order_key`, value: 'a0V' }),
      f.op({ path: `block/${B1}/feeds_block_id`, value: B2 }),
    ]);
    const row = s.get(key) as BlockRow;
    expect(row.order_key).toBe('a0V');
    expect(row.feeds_block_id).toBe(B2);
  });

  it('ignores a put or remove on a missing row and keeps the map', () => {
    const f = opFactory();
    const s = applyOp(state(), f.op({ path: `block/${B1}/order_key`, value: 'a1' }));
    expect(s.size).toBe(0);
  });

  it('ignores se, env and agrupar_por_tipo on a coluna node', () => {
    const f = opFactory();
    const key = entityKey('location', COL);
    const before = coluna();
    const s = fold(state([key, before]), [
      f.op({ path: `location/${COL}/se/type`, value: 'abrigada' }),
      f.op({ path: `location/${COL}/env/altitude_m`, value: { raw: '800', unit: 'm', state: 'measured' } }),
      f.op({ path: `location/${COL}/agrupar_por_tipo`, value: true }),
    ]);
    expect(s.get(key)).toBe(before);
    const cab = fold(state([entityKey('location', LOC), cabine()]), [
      f.op({ path: `location/${LOC}/se/type`, value: 'abrigada' }),
    ]).get(entityKey('location', LOC)) as Extract<LocationRow, { kind: 'cabine' }>;
    expect(cab.se.type).toBe('abrigada');
  });

  it('ignores caption, block_id and item_key on a non-photo file but removes it', () => {
    const f = opFactory();
    const logo: FileRow = { ...photo(null), id: LOGO, kind: 'logo', relatorio_id: null } as FileRow;
    const clean: FileRow = {
      id: LOGO,
      company_id: TEST_COMPANY,
      relatorio_id: null,
      kind: 'logo',
      sha256: logo.sha256,
      mime: 'image/png',
      size: 10,
      uploaded_at: null,
      variants: null,
      removed_at: null,
    };
    const key = entityKey('file', LOGO);
    const s1 = applyOp(state([key, clean]), f.op({ scope: 'company', path: `file/${LOGO}/caption`, value: 'x' }));
    expect(s1.get(key)).toBe(clean);
    const remove = f.op({ kind: 'remove', scope: 'company', path: `file/${LOGO}/removed_at`, value: null });
    expect((applyOp(s1, remove).get(key) as FileRow).removed_at).toBe(remove.client_ts);
  });

  it('throws on a create whose value breaks the row schema', () => {
    const f = opFactory();
    const bad: Op = { ...f.op({ kind: 'create', path: `block/${B1}`, value: block(B1) }), value: { id: B1 } };
    expect(() => applyOp(state(), bad)).toThrow();
  });

  it('throws on a put whose value breaks the row schema', () => {
    const f = opFactory();
    const op = f.op({ path: `block/${B1}/order_key`, value: 42 });
    expect(() => applyOp(state([entityKey('block', B1), block(B1)]), op)).toThrow();
  });

  it('writes relatorio setup, status, scheme and preview pointer on the implicit row', () => {
    const f = opFactory();
    const key = entityKey('relatorio', TEST_RELATORIO);
    const relatorio = {
      id: TEST_RELATORIO,
      project_id: '019966b0-0004-7000-8000-000000000009',
      template_id: null,
      template_version: null,
      seed_version: 'v1',
      status: 'rascunho',
      setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    };
    const s = fold(state([key, relatorio]), [
      f.op({ path: 'relatorio/setup/service_end', value: '2026-09-22' }),
      f.op({ path: 'relatorio/status', value: 'em_campo' }),
      f.op({ path: 'relatorio/export/scheme', value: 'ordem_de_campo' }),
      f.op({ path: 'relatorio/preview_file_id', value: PHOTO, actor_id: 'system:generate', device_id: 'server' }),
    ]);
    expect(s.get(key)).toMatchObject({
      status: 'em_campo',
      setup: { service_end: '2026-09-22' },
      export: { scheme: 'ordem_de_campo' },
      preview_file_id: PHOTO,
    });
  });
});

describe('1.4-UNIT-004 provenance and attribution', () => {
  it('sets source_suggestion_id from meta and clears it on a later plain put; cell op_id is the last op', () => {
    const f = opFactory();
    const key = entityKey('block', B1);
    const confirm = f.op({
      path: `sheet/${B1}/nameplate/tensao`,
      value: '13800',
      meta: { source_suggestion_id: SUG },
    });
    const s1 = applyOp(state([key, block(B1)]), confirm);
    expect((s1.get(key) as BlockRow).sheet.nameplate.tensao).toEqual({
      value: '13800',
      source_suggestion_id: SUG,
      op_id: confirm.op_id,
    });
    const plain = f.op({ path: `sheet/${B1}/nameplate/tensao`, value: '13.8' });
    const s2 = applyOp(s1, plain);
    expect((s2.get(key) as BlockRow).sheet.nameplate.tensao).toEqual({
      value: '13.8',
      source_suggestion_id: null,
      op_id: plain.op_id,
    });
  });

  it('created_by comes from the create op, never from the value', () => {
    const f = opFactory();
    const create = f.op({
      kind: 'create',
      path: `block/${B1}`,
      value: { ...block(B1), created_by: OTHER_USER, first_edited_at: '2026-01-01T00:00:00.000Z' },
    });
    const row = applyOp(state(), create).get(entityKey('block', B1)) as BlockRow;
    expect(row.created_by).toBe(TEST_USER);
    expect(row.first_edited_at).toBeNull();
    expect(row.last_modified_by).toBeNull();
    expect(row.last_modified_at).toBeNull();
  });

  it('attributes sheet ops: first_edited_at only once, last_modified from the latest op', () => {
    const f = opFactory();
    const key = entityKey('block', B1);
    const a = f.op({ path: `sheet/${B1}/checklist/limpeza/result`, value: 'C' });
    const b = f.op({ path: `sheet/${B1}/test/isolamento/cell/0/0`, value: '1', actor_id: OTHER_USER });
    const s = fold(state([key, block(B1)]), [a, b]);
    const row = s.get(key) as BlockRow;
    expect(row.first_edited_at).toBe(a.client_ts);
    expect(row.last_modified_at).toBe(b.client_ts);
    expect(row.last_modified_by).toBe(OTHER_USER);
    expect(row.sheet.checklist.limpeza?.result?.value).toBe('C');
    expect(row.sheet.test.isolamento?.cells['0']?.['0']?.value).toBe('1');
  });

  it('attributes block not_tested but no other block field', () => {
    const f = opFactory();
    const key = entityKey('block', B1);
    const reorder = f.op({ path: `block/${B1}/order_key`, value: 'a5' });
    const s1 = applyOp(state([key, block(B1)]), reorder);
    expect((s1.get(key) as BlockRow).first_edited_at).toBeNull();
    const nt = f.op({
      path: `block/${B1}/not_tested`,
      value: { reason: 'solicitacao_cliente', text: null, at: reorder.client_ts, by: TEST_USER },
    });
    const row = applyOp(s1, nt).get(key) as BlockRow;
    expect(row.first_edited_at).toBe(nt.client_ts);
    expect(row.last_modified_by).toBe(TEST_USER);
  });

  it('attributes a photo file that carries block_id, on create and on put block_id', () => {
    const f = opFactory();
    const b1 = entityKey('block', B1);
    const b2 = entityKey('block', B2);
    const create = f.op({ kind: 'create', path: `file/${PHOTO}`, value: photo(B1) });
    expect(targetsOf(create).map((r) => r.key)).toEqual([entityKey('file', PHOTO), b1]);
    const s1 = applyOp(state([b1, block(B1)], [b2, block(B2)]), create);
    expect((s1.get(b1) as BlockRow).first_edited_at).toBe(create.client_ts);
    expect((s1.get(b2) as BlockRow).first_edited_at).toBeNull();

    const caption = f.op({ path: `file/${PHOTO}/caption`, value: 'x' });
    expect(targetsOf(caption).map((r) => r.key)).toEqual([entityKey('file', PHOTO)]);
    const s2 = applyOp(s1, caption);
    expect((s2.get(b1) as BlockRow).last_modified_at).toBe(create.client_ts);

    const move = f.op({ path: `file/${PHOTO}/block_id`, value: B2 });
    const s3 = applyOp(s2, move);
    expect((s3.get(b2) as BlockRow).first_edited_at).toBe(move.client_ts);
    expect((s3.get(entityKey('file', PHOTO)) as { block_id: string }).block_id).toBe(B2);
  });

  it('a duplicate photo create does not re-attribute the block', () => {
    const f = opFactory();
    const b1 = entityKey('block', B1);
    const first = f.op({ kind: 'create', path: `file/${PHOTO}`, value: photo(B1) });
    const again = f.op({ kind: 'create', path: `file/${PHOTO}`, value: photo(B1), actor_id: OTHER_USER });
    const s = fold(state([b1, block(B1)]), [first, again]);
    expect((s.get(b1) as BlockRow).last_modified_by).toBe(TEST_USER);
    expect((s.get(b1) as BlockRow).last_modified_at).toBe(first.client_ts);
  });
});

describe('readPath', () => {
  it('reads the value a put replaces, undefined when absent', () => {
    const f = opFactory();
    const key = entityKey('block', B1);
    const s = applyOp(state([key, block(B1)]), f.op({ path: `sheet/${B1}/nameplate/tensao`, value: '1' }));
    expect(readPath(s, f.op({ path: `sheet/${B1}/nameplate/tensao`, value: '2' }))).toBe('1');
    expect(readPath(s, f.op({ path: `sheet/${B1}/nameplate/potencia`, value: '2' }))).toBeUndefined();
    expect(readPath(s, f.op({ path: `block/${B1}/order_key`, value: 'x' }))).toBe('a0');
    expect(readPath(s, f.op({ kind: 'create', path: `block/${B2}`, value: block(B2) }))).toBeUndefined();
    expect(readPath(state(), f.op({ path: `block/${B1}/order_key`, value: 'x' }))).toBeUndefined();
  });
});

describe('4.1-UNIT D-4 template.version follows content edits', () => {
  const TEMPLATE = '019966b0-0004-7000-8000-000000000010';
  const template = () => ({
    id: TEMPLATE,
    name: 'Cabine primária — padrão',
    version: 1,
    seed_version: 'v1',
    blocks: [],
    skeleton: [],
    archived_at: null,
    removed_at: null,
  });
  const key = entityKey('template', TEMPLATE);
  const companyPut = (f: ReturnType<typeof opFactory>, field: string, value: unknown, kind: 'put' | 'remove' = 'put') =>
    f.op({ kind, scope: 'company', path: `template/${TEMPLATE}/${field}`, value: value as Op['value'] });

  it('bumps version on name, blocks and skeleton puts, one each', () => {
    const f = opFactory();
    const s = fold(state([key, template()]), [
      companyPut(f, 'name', 'Outro'),
      companyPut(f, 'blocks', []),
      companyPut(f, 'skeleton', []),
    ]);
    expect((s.get(key) as { version: number; name: string }).version).toBe(4);
    expect((s.get(key) as { name: string }).name).toBe('Outro');
  });

  it('archive, restore and remove do not bump it', () => {
    const f = opFactory();
    const s = fold(state([key, template()]), [
      companyPut(f, 'archived_at', '2026-09-22T10:00:00.000Z'),
      companyPut(f, 'archived_at', null),
      companyPut(f, 'removed_at', null, 'remove'),
    ]);
    expect((s.get(key) as { version: number }).version).toBe(1);
  });

  it('a version put sets the value explicitly', () => {
    const f = opFactory();
    const s = fold(state([key, template()]), [companyPut(f, 'version', 7)]);
    expect((s.get(key) as { version: number }).version).toBe(7);
  });
});
