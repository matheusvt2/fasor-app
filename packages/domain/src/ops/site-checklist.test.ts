import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { SERVER_DEVICE_ID } from '../ids.ts';
import { stampSeen } from '../merge/stamp.ts';
import { clearedMarks } from '../merge/restore.ts';
import { SITE_ITEM_KEYS } from '../schemas/block-config.ts';
import {
  entityRowSchemas,
  locationRowSchema,
  photoFileRowSchema,
  pointRowSchema,
  relatorioRowSchema,
  type Cell,
  type FileRow,
  type JsonValue,
  type LocationRow,
  type PointRow,
  type RelatorioRow,
} from '../schemas/entities.ts';
import { opFactory, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { applyOp, cellAt, entityKey, isCellFamily, LocationKindError, readPath, SeedPathError, siteCellAt, splitEntityKey, targetsOf, type EntityState } from './apply.ts';
import { materializeEntity } from './materialize.ts';
import { opSchema, type Op } from './op.ts';
import { locationChecklistPath, parsePath } from './path.ts';
import { replay } from './replay.ts';

/*
 * Story 14.3 (contract 18): the fold of a local's site checklist ("Verificações do local"),
 * one test per row of the spec's I/O matrix that the kernel fold answers: an item answered,
 * the wrong kind, the wrong seed, two devices on one item, a removed local and the replay.
 */

const LOCAL = '019966b0-0018-7000-8000-000000000001';
const PAINEL = '019966b0-0018-7000-8000-000000000002';
const COLUNA = '019966b0-0018-7000-8000-000000000003';
const PHOTO = '019966b0-0018-7000-8000-000000000004';
const POINT = '019966b0-0018-7000-8000-000000000005';
const SUGGESTION = '019966b0-0018-7000-8000-000000000006';
const OTHER_RELATORIO = '019966b0-0018-7000-8000-000000000007';
const EDUARDO = '019966b0-0018-7000-8000-000000000008';
const ANA = '019966b0-0018-7000-8000-000000000009';
const E_DEVICE = 'tablet-eduardo';
const A_DEVICE = 'tablet-ana';

const ITEM = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
const OTHER_ITEM = 'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido';
const result = locationChecklistPath(LOCAL, ITEM, 'result');
const observation = locationChecklistPath(LOCAL, ITEM, 'observation');
const otherResult = locationChecklistPath(LOCAL, OTHER_ITEM, 'result');
const otherObservation = locationChecklistPath(LOCAL, OTHER_ITEM, 'observation');

type Cabine = Extract<LocationRow, { kind: 'cabine' }>;

const local = (): Cabine => ({
  id: LOCAL,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: '1° Subsolo',
  order_key: 'a0',
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
  removed_at: null,
});
const painel = (): LocationRow => ({ id: PAINEL, relatorio_id: TEST_RELATORIO, parent_id: LOCAL, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0', removed_at: null });
const coluna = (): LocationRow => ({ id: COLUNA, relatorio_id: TEST_RELATORIO, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 1', order_key: 'a0', removed_at: null });

const relatorio = (seedVersion: string, id = TEST_RELATORIO): RelatorioRow =>
  relatorioRowSchema.parse({
    id,
    project_id: TEST_PROJECT,
    template_id: null,
    template_version: null,
    seed_version: seedVersion,
    status: 'rascunho',
    setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  });

const sitePhoto = (): FileRow => ({
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
  block_id: null,
  item_key: ITEM,
  caption: null,
  reading_kind: null,
  reading_target: null,
  reading_status: 'none',
  people_in_photo: false,
  location_id: LOCAL,
});

const sitePoint = (): PointRow => ({
  id: POINT,
  relatorio_id: TEST_RELATORIO,
  text: `Luminária de emergência inoperante [[foto:${PHOTO}]]`,
  equipment_id: null,
  origin: 'manual',
  order_key: 'a0',
  removed_at: null,
  action: null,
  priority: null,
  deadline: null,
  owner: null,
  location_id: LOCAL,
});

const locKey = entityKey('location', LOCAL);
const relKey = entityKey('relatorio', TEST_RELATORIO);
const state = (...rows: [string, unknown][]): EntityState => new Map(rows as never);
const v4State = (): EntityState => state([locKey, local()], [relKey, relatorio('v4')]);
const foldOps = (initial: EntityState, ops: Op[]) => ops.reduce((s, op) => applyOp(s, op), initial);
const cabineOf = (s: EntityState): Cabine => s.get(locKey) as Cabine;
const thrown = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
};
const plain = (op: Op): Cell => ({ value: op.value, source_suggestion_id: null, op_id: op.op_id });
/** The row without one key, as a row stored before that key existed. */
function without<T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> {
  const copy = { ...row };
  delete copy[key];
  return copy;
}
const standing = (cell: Cell | undefined) => (cell === undefined ? undefined : { value: cell.value, op_id: cell.op_id });

describe('matrix "Item answered": a site put writes a cell on the cabine row', () => {
  it('result C, NC, NA and null, and an observation text and null, each land as a cell with its op id and provenance', () => {
    const f = opFactory();
    for (const value of ['C', 'NC', 'NA', null] as const) {
      const put = f.op({ path: result, value });
      expect(cabineOf(applyOp(v4State(), put)).checklist).toEqual({ [ITEM]: { result: plain(put) } });
    }
    for (const value of ['Luminária de emergência inoperante — 2 das 4 luminárias não acendem', null]) {
      const put = f.op({ path: observation, value });
      expect(cabineOf(applyOp(v4State(), put)).checklist).toEqual({ [ITEM]: { observation: plain(put) } });
    }
  });

  it('a result and an observation of one item share its entry in schema key order; another item gets its own; the rest of the row is untouched', () => {
    const f = opFactory();
    const obs = f.op({ path: observation, value: 'Autonomia abaixo de 2 h' });
    const nc = f.op({ path: result, value: 'NC', prev_op_id: null });
    const c = f.op({ path: otherResult, value: 'C' });
    const na = f.op({ path: otherResult, value: 'NA', prev_op_id: c.op_id });
    const row = cabineOf(foldOps(v4State(), [obs, nc, c, na]));
    expect(row.checklist).toEqual({ [ITEM]: { result: plain(nc), observation: plain(obs) }, [OTHER_ITEM]: { result: plain(na) } });
    // The observation came first, yet the stored entry reads result, then observation (the row schema's order).
    expect(Object.keys(row.checklist![ITEM]!)).toEqual(['result', 'observation']);
    expect(Object.keys(row.checklist!)).toEqual([ITEM, OTHER_ITEM]);
    expect(without(row, 'checklist')).toEqual(local());
    // `checklist` is the row's last key, after everything a cabine held before contract 18.
    expect(Object.keys(row).at(-1)).toBe('checklist');
    expect(JSON.stringify(locationRowSchema.parse(row))).toBe(JSON.stringify(row));
  });

  it('a confirmed suggestion keeps its provenance, as on a sheet cell (AD-12)', () => {
    const f = opFactory();
    const put = f.op({ path: observation, value: 'Sem iluminação de emergência', meta: { source_suggestion_id: SUGGESTION } });
    expect(cabineOf(applyOp(v4State(), put)).checklist![ITEM]!.observation).toEqual({ value: 'Sem iluminação de emergência', source_suggestion_id: SUGGESTION, op_id: put.op_id });
  });

  it('every one of the 19 items is accepted on a v4 relatório, each as its own entry', () => {
    const f = opFactory();
    const puts = SITE_ITEM_KEYS.map((key) => f.op({ path: locationChecklistPath(LOCAL, key, 'result'), value: 'C' }));
    const row = cabineOf(foldOps(v4State(), puts));
    expect(Object.keys(row.checklist!)).toEqual([...SITE_ITEM_KEYS]);
    for (const [i, key] of SITE_ITEM_KEYS.entries()) expect(row.checklist![key]).toEqual({ result: plain(puts[i]!) });
  });

  it('a value that is no JSON value fails the row schema, and a put on a location that does not exist is a no-op', () => {
    const f = opFactory();
    const put = f.op({ path: result, value: 'C' });
    expect(() => applyOp(v4State(), { ...put, value: undefined as never })).toThrow(ZodError);
    const empty = state([relKey, relatorio('v4')]);
    expect(applyOp(empty, put).has(locKey)).toBe(false);
  });

  it('a row from before contract 18 holds no `checklist` key, and a create without one stores none', () => {
    const f = opFactory();
    expect('checklist' in local()).toBe(false);
    // A stored row (the parse's own output) parses again to the same bytes: the optional key adds nothing.
    const stored = locationRowSchema.parse(local());
    expect(Object.keys(stored)).not.toContain('checklist');
    expect(JSON.stringify(locationRowSchema.parse(stored))).toBe(JSON.stringify(stored));
    const created = applyOp(state(), f.op({ kind: 'create', path: `location/${LOCAL}`, value: local() })).get(locKey)!;
    expect(Object.keys(created)).not.toContain('checklist');
    // A painel and a coluna never carry one: the key is stripped at create.
    const fat = applyOp(state(), f.op({ kind: 'create', path: `location/${PAINEL}`, value: { ...painel(), checklist: {} } }));
    expect(fat.get(entityKey('location', PAINEL))).toEqual(painel());
  });

  it('readPath gives the value a put replaces: undefined for an item never answered, as a sheet cell', () => {
    const f = opFactory();
    const first = f.op({ path: result, value: 'NC' });
    expect(readPath(v4State(), first)).toBeUndefined();
    const answered = applyOp(v4State(), first);
    expect(readPath(answered, f.op({ path: result, value: 'C', prev_op_id: first.op_id }))).toBe('NC');
    expect(readPath(answered, f.op({ path: observation, value: 'x' }))).toBeUndefined();
    expect(readPath(state([entityKey('location', PAINEL), painel()]), f.op({ path: locationChecklistPath(PAINEL, ITEM, 'result'), value: 'C' }))).toBeUndefined();
    expect(readPath(state(), first)).toBeUndefined();
  });

  it('the undo pair: a put, then a put of the earlier value (null for unanswered) in sequence', () => {
    const f = opFactory();
    const c = f.op({ path: result, value: 'C' });
    const nc = f.op({ path: result, value: 'NC', prev_op_id: c.op_id });
    const undoNc = f.op({ path: result, value: 'C', prev_op_id: nc.op_id });
    const undoC = f.op({ path: result, value: null, prev_op_id: undoNc.op_id });
    expect(cabineOf(foldOps(v4State(), [c, nc, undoNc])).checklist![ITEM]!.result).toEqual(plain(undoNc));
    expect(cabineOf(foldOps(v4State(), [c, nc, undoNc, undoC])).checklist![ITEM]!.result).toEqual(plain(undoC));
  });
});

describe('the cell helpers of the two cell families', () => {
  it('isCellFamily names every sheet family and the site checklist, and nothing else', () => {
    for (const family of ['sheet/nameplate', 'sheet/checklist', 'sheet/test', 'sheet/test/cell', 'sheet/conclusion', 'sheet/observations', 'location/checklist'] as const) {
      expect(isCellFamily(family), family).toBe(true);
    }
    for (const family of ['location/funcao', 'location/se', 'location/field', 'block/field', 'file/field', 'point/field', 'relatorio/setup'] as const) {
      expect(isCellFamily(family), family).toBe(false);
    }
  });

  it('siteCellAt and cellAt read the cell a site path addresses; undefined off a cabine, off the family or with no row', () => {
    const f = opFactory();
    const nc = f.op({ path: result, value: 'NC' });
    const answered = applyOp(v4State(), nc);
    expect(siteCellAt(cabineOf(answered), parsePath(result))).toEqual(plain(nc));
    expect(siteCellAt(cabineOf(answered), parsePath(observation))).toBeUndefined();
    expect(siteCellAt(cabineOf(answered), parsePath(otherResult))).toBeUndefined();
    expect(siteCellAt(cabineOf(answered), parsePath(`location/${LOCAL}/funcao`))).toBeUndefined();
    expect(siteCellAt(painel(), parsePath(locationChecklistPath(PAINEL, ITEM, 'result')))).toBeUndefined();
    expect(siteCellAt(undefined, parsePath(result))).toBeUndefined();
    expect(siteCellAt(null, parsePath(result))).toBeUndefined();
    expect(cellAt(answered, parsePath(result))).toEqual(plain(nc));
    expect(cellAt(state(), parsePath(result))).toBeUndefined();
    expect(cellAt(answered, parsePath(`location/${LOCAL}/name`))).toBeUndefined();
  });
});

describe('matrix "Wrong kind": a site put on a painel or a coluna is refused', () => {
  it('throws LocationKindError carrying the path, and nothing is written', () => {
    const f = opFactory();
    for (const [row, id] of [
      [painel(), PAINEL],
      [coluna(), COLUNA],
    ] as const) {
      const key = entityKey('location', id);
      const held = state([key, row], [relKey, relatorio('v4')]);
      for (const field of ['result', 'observation'] as const) {
        const put = f.op({ path: locationChecklistPath(id, ITEM, field), value: field === 'result' ? 'C' : 'x' });
        const error = thrown(() => applyOp(held, put));
        expect(error, put.path).toBeInstanceOf(LocationKindError);
        expect((error as LocationKindError).path).toBe(put.path);
        expect((error as LocationKindError).name).toBe('LocationKindError');
      }
      expect(held.get(key)).toEqual(row);
    }
  });

  it('the kind is judged before the seed: a painel of a v1 relatório answers LocationKindError', () => {
    const f = opFactory();
    const held = state([entityKey('location', PAINEL), painel()], [relKey, relatorio('v1')]);
    expect(thrown(() => applyOp(held, f.op({ path: locationChecklistPath(PAINEL, ITEM, 'result'), value: 'C' })))).toBeInstanceOf(LocationKindError);
  });
});

describe('matrix "Wrong key or seed": the relatório\'s seed version decides', () => {
  it('a valid key on a relatório held in state on v1, v2 or v3 throws SeedPathError and writes nothing', () => {
    const f = opFactory();
    for (const version of ['v1', 'v2', 'v3']) {
      const held = state([locKey, local()], [relKey, relatorio(version)]);
      for (const path of [result, observation]) {
        const put = f.op({ path, value: 'C' });
        const error = thrown(() => applyOp(held, put));
        expect(error, `${version} ${path}`).toBeInstanceOf(SeedPathError);
        expect((error as SeedPathError).path).toBe(put.path);
        expect((error as SeedPathError).message).toContain(`seed_version "${version}"`);
      }
      expect(held.get(locKey)).toEqual(local());
    }
  });

  it('a relatório on a seed version this bundle does not ship offers no site item either', () => {
    const f = opFactory();
    const held = state([locKey, local()], [relKey, relatorio('v99')]);
    expect(thrown(() => applyOp(held, f.op({ path: result, value: 'C' })))).toBeInstanceOf(SeedPathError);
  });

  it('a put names its relatório row as a read-only target, so the check sees it', () => {
    const f = opFactory();
    const put = f.op({ path: result, value: 'C' });
    expect(targetsOf(put).map((r) => r.key)).toEqual([locKey, relKey]);
    // No other location op names the relatório.
    expect(targetsOf(f.op({ path: `location/${LOCAL}/funcao`, value: 'primaria' })).map((r) => r.key)).toEqual([locKey]);
    expect(targetsOf(f.op({ path: `location/${LOCAL}/name`, value: 'x' })).map((r) => r.key)).toEqual([locKey]);
    // The relatório row is read, never written: the fold returns it as it was.
    const before = v4State();
    const after = applyOp(before, put);
    expect(after.get(relKey)).toBe(before.get(relKey));
  });

  it('a relatório row that is not in state is not checked (replay safety, the 14.2 precedent)', () => {
    const f = opFactory();
    const put = f.op({ path: result, value: 'NC' });
    expect(cabineOf(applyOp(state([locKey, local()]), put)).checklist).toEqual({ [ITEM]: { result: plain(put) } });
  });

  it('an op naming another relatório than the location\'s own is refused: its seed could not be judged', () => {
    const f = opFactory();
    const put = f.op({ path: result, value: 'C', relatorio_id: OTHER_RELATORIO });
    expect(targetsOf(put).map((r) => r.key)).toEqual([locKey, entityKey('relatorio', OTHER_RELATORIO)]);
    const held = state([locKey, local()], [entityKey('relatorio', OTHER_RELATORIO), relatorio('v4', OTHER_RELATORIO)]);
    const error = thrown(() => applyOp(held, put));
    expect(error).toBeInstanceOf(SeedPathError);
    expect(held.get(locKey)).toEqual(local());
  });

  it('a replayed log refuses the same puts: the reference fold holds every row', () => {
    const f = opFactory();
    const head = (version: string) => [
      f.op({ kind: 'create', path: `relatorio/${TEST_RELATORIO}`, value: relatorio(version) }),
      f.op({ kind: 'create', path: `location/${LOCAL}`, value: local() }),
      f.op({ kind: 'create', path: `location/${PAINEL}`, value: painel() }),
    ];
    expect(() => replay([...head('v3'), f.op({ path: result, value: 'C' })])).toThrow(SeedPathError);
    expect(() => replay([...head('v4'), f.op({ path: locationChecklistPath(PAINEL, ITEM, 'result'), value: 'C' })])).toThrow(LocationKindError);
    expect(cabineOf(replay([...head('v4'), f.op({ path: result, value: 'C' })])).checklist![ITEM]!.result!.value).toBe('C');
  });
});

/** Two devices on one local: the office creates the rows, Eduardo and Ana answer. */
function world() {
  const f = opFactory();
  const createRelatorio = f.op({ kind: 'create', path: `relatorio/${TEST_RELATORIO}`, value: relatorio('v4'), device_id: 'office' });
  const createLocal = f.op({ kind: 'create', path: `location/${LOCAL}`, value: local(), device_id: 'office' });
  const eduardo = (path: string, value: JsonValue, prev: string | null = null, meta: Op['meta'] = null) =>
    f.op({ path, value, prev_op_id: prev, meta, actor_id: EDUARDO, device_id: E_DEVICE });
  const ana = (path: string, value: JsonValue, prev: string | null = null, meta: Op['meta'] = null) => f.op({ path, value, prev_op_id: prev, meta, actor_id: ANA, device_id: A_DEVICE });
  return { f, createRelatorio, createLocal, eduardo, ana };
}

const seqd = (log: readonly Op[]) => log.map((op, i) => ({ ...op, seq: i + 1 }));
/** The server fold of one location: the log in `seq` order (the order given), as `applyOneIn` applies it. */
const fold = (log: readonly Op[]): Cabine => materializeEntity({ entity: 'location', id: LOCAL }, seqd(log), []) as Cabine;

describe('matrix "Two devices, same item": a site item merges as a sheet checklist row', () => {
  it('C on one and NC on the other, concurrent: NC stands (nc_over_c) in either seq order, with the NC device\'s observation (nc_observation)', () => {
    const { createLocal, eduardo, ana } = world();
    const eResult = eduardo(result, 'NC');
    const eObs = eduardo(observation, 'Luminária de emergência inoperante');
    const aResult = ana(result, 'C');
    const aObs = ana(observation, 'ok');

    const ncFirst = fold([createLocal, eResult, eObs, aResult, aObs]);
    const cFirst = fold([createLocal, aResult, aObs, eResult, eObs]);
    for (const row of [ncFirst, cFirst]) {
      expect(standing(row.checklist![ITEM]!.result)).toEqual({ value: 'NC', op_id: eResult.op_id });
      expect(standing(row.checklist![ITEM]!.observation)).toEqual({ value: 'Luminária de emergência inoperante', op_id: eObs.op_id });
    }
    expect(ncFirst.checklist![ITEM]!.result!.merge).toEqual({ head_op_id: aResult.op_id, device_id: A_DEVICE, kept: true, rule: 'nc_over_c' });
    expect(ncFirst.checklist![ITEM]!.observation!.merge).toEqual({ head_op_id: aObs.op_id, device_id: A_DEVICE, kept: true, rule: 'nc_observation' });
    expect(cFirst.checklist![ITEM]!.result!.merge).toEqual({ head_op_id: eResult.op_id, device_id: E_DEVICE, kept: false, rule: 'nc_over_c' });
    expect(cFirst.checklist![ITEM]!.observation!.merge).toEqual({ head_op_id: eObs.op_id, device_id: E_DEVICE, kept: false, rule: 'nc_observation' });
  });

  it('the same from a common value both devices saw', () => {
    const { createLocal, eduardo, ana } = world();
    const x = ana(result, 'C');
    const eResult = eduardo(result, 'NC', x.op_id);
    const aResult = ana(result, 'C', x.op_id);
    for (const log of [
      [createLocal, x, eResult, aResult],
      [createLocal, x, aResult, eResult],
    ]) {
      expect(standing(fold(log).checklist![ITEM]!.result)).toEqual({ value: 'NC', op_id: eResult.op_id });
    }
  });

  it('different items answered on two devices both stand, with no merge record', () => {
    const { createLocal, eduardo, ana } = world();
    const e = eduardo(result, 'NC');
    const a = ana(otherResult, 'C');
    const aObs = ana(otherObservation, 'CO2 6 kg · validade 03/2027');
    for (const log of [
      [createLocal, e, a, aObs],
      [createLocal, a, aObs, e],
    ]) {
      const row = fold(log);
      expect(row.checklist![ITEM]).toEqual({ result: plain(e) });
      expect(row.checklist![OTHER_ITEM]).toEqual({ result: plain(a), observation: plain(aObs) });
    }
  });

  it('concurrent observations with no NC merge: the latest text stands (latest_text)', () => {
    const { createLocal, eduardo, ana } = world();
    const e = eduardo(otherObservation, 'CO2 6 kg');
    const a = ana(otherObservation, 'PQS 4 kg');
    const eLater = fold([createLocal, a, e]).checklist![OTHER_ITEM]!.observation!;
    const aLater = fold([createLocal, e, a]).checklist![OTHER_ITEM]!.observation!;
    expect(standing(eLater)).toEqual({ value: 'CO2 6 kg', op_id: e.op_id });
    expect(eLater.merge).toEqual({ head_op_id: e.op_id, device_id: E_DEVICE, kept: false, rule: 'latest_text' });
    expect(standing(aLater)).toEqual({ value: 'PQS 4 kg', op_id: a.op_id });
    expect(aLater.merge?.rule).toBe('latest_text');
  });

  it('a filled observation stands over a concurrent clear (filled_over_empty), and a same value leaves no record', () => {
    const { createLocal, eduardo, ana } = world();
    const x = ana(observation, 'Autonomia abaixo de 2 h');
    const cleared = ana(observation, null, x.op_id);
    const typed = eduardo(observation, 'Autonomia abaixo de 2 h, medida em 40 min', x.op_id);
    for (const log of [
      [createLocal, x, cleared, typed],
      [createLocal, x, typed, cleared],
    ]) {
      const cell = fold(log).checklist![ITEM]!.observation!;
      expect(standing(cell)).toEqual({ value: 'Autonomia abaixo de 2 h, medida em 40 min', op_id: typed.op_id });
      expect(cell.merge?.rule).toBe('filled_over_empty');
    }
    const e = eduardo(result, 'NC');
    const a = ana(result, 'NC');
    expect(fold([createLocal, e, a]).checklist![ITEM]!.result).toEqual(plain(a));
  });

  it('a C or an NC against an NA keeps the seq-later value and marks the cell `conflict`, as a sheet cell does', () => {
    const { createLocal, eduardo, ana } = world();
    for (const value of ['C', 'NC'] as const) {
      const e = eduardo(result, value);
      const a = ana(result, 'NA');
      expect(fold([createLocal, e, a]).checklist![ITEM]!.result).toEqual({
        value: 'NA',
        source_suggestion_id: null,
        op_id: a.op_id,
        conflict: { op_id: e.op_id, value, source_suggestion_id: null },
      });
      expect(fold([createLocal, a, e]).checklist![ITEM]!.result).toEqual({
        value,
        source_suggestion_id: null,
        op_id: e.op_id,
        conflict: { op_id: a.op_id, value: 'NA', source_suggestion_id: null },
      });
    }
  });

  it('a deliberate C after seeing the merge applies and drops the record; a server op is never merged', () => {
    const { createLocal, eduardo, ana, f } = world();
    const eResult = eduardo(result, 'NC');
    const aResult = ana(result, 'C');
    const again = ana(result, 'C', aResult.op_id);
    expect(fold([createLocal, eResult, aResult, again]).checklist![ITEM]!.result).toEqual(plain(again));
    const server = f.op({ path: result, value: 'C', actor_id: 'system:test', device_id: SERVER_DEVICE_ID });
    expect(fold([createLocal, eResult, server]).checklist![ITEM]!.result).toEqual(plain(server));
  });

  it('the device fold (remote, then its own pending put) equals the server fold of the same log', () => {
    const { createLocal, eduardo, ana } = world();
    const eResult = eduardo(result, 'NC');
    const aResult = ana(result, 'C');
    const device = materializeEntity({ entity: 'location', id: LOCAL }, seqd([createLocal, eResult]), [aResult]);
    expect(JSON.stringify(device)).toBe(JSON.stringify(fold([createLocal, eResult, aResult])));
  });
});

describe('stampSeen on a site put: what the device saw, as on a sheet put', () => {
  it('stamps the standing cell and the seen conflict from the location row; a set value wins; a remove-free family otherwise untouched', () => {
    const { createLocal, eduardo, ana } = world();
    const x = ana(result, 'C');
    const held = state([locKey, fold([createLocal, x])], [relKey, relatorio('v4')]);
    expect(stampSeen(ana(result, 'NC', x.op_id), held).meta).toEqual({ standing_op_id: x.op_id, seen_conflict_op_id: null });
    expect(stampSeen(ana(otherResult, 'NC'), held).meta).toEqual({ standing_op_id: null, seen_conflict_op_id: null });
    expect(stampSeen(ana(observation, 'x'), held).meta).toEqual({ standing_op_id: null, seen_conflict_op_id: null });
    expect(stampSeen(ana(result, 'NC', x.op_id, { standing_op_id: null }), held).meta).toEqual({ standing_op_id: null, seen_conflict_op_id: null });
    // A cell holding a contradiction: the conflict the device saw is stamped too.
    const na = eduardo(result, 'NA');
    const marked = state([locKey, fold([createLocal, x, na])]);
    expect(stampSeen(ana(result, 'C', na.op_id), marked).meta).toEqual({ standing_op_id: na.op_id, seen_conflict_op_id: x.op_id });
    // A location that is not held stamps an empty slot, and another location family is returned as it is.
    expect(stampSeen(ana(result, 'C'), state()).meta).toEqual({ standing_op_id: null, seen_conflict_op_id: null });
    const funcao = ana(`location/${LOCAL}/funcao`, 'primaria');
    expect(stampSeen(funcao, held)).toBe(funcao);
  });

  it('closes the case a prev_op_id cannot tell apart: a device whose C was merged away writes C again before it pulls, and NC still stands', () => {
    const { createLocal, eduardo, ana } = world();
    const eResult = eduardo(result, 'NC');
    const aResult = ana(result, 'C');
    // Ana's device still holds her own C: its second put chains on it and is stamped with it.
    const anaRow = materializeEntity({ entity: 'location', id: LOCAL }, seqd([createLocal]), [aResult]) as Cabine;
    const again = stampSeen(ana(result, 'C', aResult.op_id), state([locKey, anaRow]));
    expect(again.meta).toEqual({ standing_op_id: aResult.op_id, seen_conflict_op_id: null });
    const row = fold([createLocal, eResult, aResult, again]);
    expect(standing(row.checklist![ITEM]!.result)).toEqual({ value: 'NC', op_id: eResult.op_id });
    expect(row.checklist![ITEM]!.result!.merge).toEqual({ head_op_id: again.op_id, device_id: A_DEVICE, kept: true, rule: 'nc_over_c' });
  });

  it('a sequential put that saw the conflict clears it; one that did not keeps it; the put that cleared it carries the marks its undo puts back', () => {
    const { createLocal, eduardo, ana } = world();
    const c = ana(result, 'C');
    const na = eduardo(result, 'NA');
    const marked = fold([createLocal, c, na]);
    const held = state([locKey, marked]);
    const saw = stampSeen(ana(result, 'NC', na.op_id), held);
    expect(fold([createLocal, c, na, saw]).checklist![ITEM]!.result).toEqual(plain(saw));
    const unseen = eduardo(result, 'NC', na.op_id, { standing_op_id: na.op_id, seen_conflict_op_id: null });
    expect(fold([createLocal, c, na, unseen]).checklist![ITEM]!.result).toEqual({ ...plain(unseen), conflict: { op_id: c.op_id, value: 'C', source_suggestion_id: null } });
    // Review of batch e14b (2026-10-13): the mark is listed in no Conflict view yet (O2), but a put
    // that clears it carries the restore marks as a sheet put does, so its "Desfazer" puts it back.
    expect(clearedMarks(held, saw)).toEqual({ conflict: { op_id: c.op_id, value: 'C', source_suggestion_id: null }, shown_op_id: na.op_id });
  });
});

describe('matrix "Removed local": ops on a removed local still fold, and a restore keeps every answer', () => {
  it('answers written before and after the removal are on the row once it is restored; the checklist has no tombstone of its own', () => {
    const { createLocal, eduardo, f } = world();
    const before = eduardo(result, 'NC');
    const remove = f.op({ kind: 'remove', path: `location/${LOCAL}/removed_at`, value: null, actor_id: ANA, device_id: A_DEVICE });
    const during = eduardo(otherResult, 'C');
    const obs = eduardo(observation, 'Sem iluminação de emergência');
    const restore = f.op({ path: `location/${LOCAL}/removed_at`, value: null, prev_op_id: remove.op_id, actor_id: ANA, device_id: A_DEVICE });
    const removed = fold([createLocal, before, remove, during, obs]);
    expect(removed.removed_at).toBe(remove.client_ts);
    expect(removed.checklist).toEqual({ [ITEM]: { result: plain(before), observation: plain(obs) }, [OTHER_ITEM]: { result: plain(during) } });
    const restored = fold([createLocal, before, remove, during, obs, restore]);
    expect(restored.removed_at).toBeNull();
    expect(restored.checklist).toEqual(removed.checklist);
  });
});

describe('a site photo and a site point carry `location_id`', () => {
  const photoKey = entityKey('file', PHOTO);
  const pointKey = entityKey('point', POINT);

  it('matrix "Site photo": a photo create with `location_id` and `item_key`, `block_id` null, is stored as written and names no block', () => {
    const f = opFactory();
    const create = f.op({ kind: 'create', path: `file/${PHOTO}`, value: sitePhoto() });
    expect(targetsOf(create).map((r) => r.key)).toEqual([photoKey]);
    const stored = applyOp(state(), create).get(photoKey) as FileRow;
    expect(stored).toEqual(sitePhoto());
    expect(stored).toMatchObject({ kind: 'photo', location_id: LOCAL, item_key: ITEM, block_id: null, reading_kind: null });
    expect(Object.keys(stored).at(-1)).toBe('location_id');
  });

  it('`file/{id}/location_id` puts and clears the local of a photo; a photo from before the field parses to the same bytes', () => {
    const f = opFactory();
    // A stored photo from before the field (the parse's own output) parses again to the same bytes.
    const legacy = photoFileRowSchema.parse(without(sitePhoto() as Extract<FileRow, { kind: 'photo' }>, 'location_id'));
    expect('location_id' in legacy).toBe(false);
    expect(JSON.stringify(photoFileRowSchema.parse(legacy))).toBe(JSON.stringify(legacy));
    const put = applyOp(state([photoKey, legacy]), f.op({ path: `file/${PHOTO}/location_id`, value: LOCAL })).get(photoKey) as FileRow;
    expect(put).toEqual({ ...legacy, location_id: LOCAL });
    const cleared = applyOp(state([photoKey, put]), f.op({ path: `file/${PHOTO}/location_id`, value: null })).get(photoKey);
    expect(cleared).toEqual({ ...legacy, location_id: null });
    expect(() => applyOp(state([photoKey, legacy]), f.op({ path: `file/${PHOTO}/location_id`, value: 'not-a-uuid' }))).toThrow(ZodError);
  });

  it('matrix "NC to point": a point create with `location_id` and a photo token is stored as written; one from before the field parses to the same bytes', () => {
    const f = opFactory();
    const stored = applyOp(state(), f.op({ kind: 'create', path: `point/${POINT}`, value: sitePoint() })).get(pointKey) as PointRow;
    expect(stored).toEqual(sitePoint());
    expect(stored).toMatchObject({ location_id: LOCAL, equipment_id: null });
    expect(stored.text).toContain(`[[foto:${PHOTO}]]`);
    const legacy = pointRowSchema.parse(without(sitePoint(), 'location_id'));
    expect('location_id' in legacy).toBe(false);
    expect(JSON.stringify(pointRowSchema.parse(legacy))).toBe(JSON.stringify(legacy));
    const put = applyOp(state([pointKey, legacy]), f.op({ path: `point/${POINT}/location_id`, value: LOCAL })).get(pointKey);
    expect(put).toEqual({ ...legacy, location_id: LOCAL });
    expect(() => applyOp(state([pointKey, legacy]), f.op({ path: `point/${POINT}/location_id`, value: 7 as never }))).toThrow(ZodError);
  });
});

describe('matrix "Replay": a log with site ops folds to the same bytes on every layer of the kernel', () => {
  /** A relatório on v4 with a local and a painel, answered on two devices, with a site photo, a site point, a removal and a restore. */
  function siteLog(): Op[] {
    const { f, createRelatorio, createLocal, eduardo, ana } = world();
    const createPainel = f.op({ kind: 'create', path: `location/${PAINEL}`, value: painel(), device_id: 'office' });
    const eResult = eduardo(result, 'NC');
    const eObs = eduardo(observation, 'Luminária de emergência inoperante');
    const aResult = ana(result, 'C');
    const aObs = ana(observation, 'ok');
    const extintor = ana(otherResult, 'C');
    const extintorNa = eduardo(otherResult, 'NA');
    const extintorObs = ana(otherObservation, 'CO2 6 kg · validade 03/2027');
    const rest = SITE_ITEM_KEYS.filter((key) => key !== ITEM && key !== OTHER_ITEM).map((key) =>
      f.op({ path: locationChecklistPath(LOCAL, key, 'result'), value: 'C', batch_id: '019966b0-0018-7000-8000-0000000000b1', actor_id: ANA, device_id: A_DEVICE }),
    );
    const photo = f.op({ kind: 'create', path: `file/${PHOTO}`, value: sitePhoto(), actor_id: EDUARDO, device_id: E_DEVICE });
    const point = f.op({ kind: 'create', path: `point/${POINT}`, value: sitePoint(), actor_id: EDUARDO, device_id: E_DEVICE });
    const remove = f.op({ kind: 'remove', path: `location/${LOCAL}/removed_at`, value: null, actor_id: ANA, device_id: A_DEVICE });
    const late = eduardo(locationChecklistPath(LOCAL, 'ventilacao', 'observation'), 'Exaustor inoperante');
    const restore = f.op({ path: `location/${LOCAL}/removed_at`, value: null, prev_op_id: remove.op_id, actor_id: ANA, device_id: A_DEVICE });
    return seqd([createRelatorio, createLocal, createPainel, eResult, eObs, aResult, aObs, extintor, extintorNa, extintorObs, ...rest, photo, point, remove, late, restore]);
  }

  const targeting = (key: string, log: readonly Op[]) => log.filter((op) => targetsOf(op).some((ref) => ref.key === key));

  it('the reference replay, each entity\'s device materialization and a re-parse of every stored row give byte-equal rows', () => {
    const log = siteLog();
    const reference = replay(log);
    expect([...reference.keys()].sort()).toEqual([entityKey('file', PHOTO), locKey, entityKey('location', PAINEL), entityKey('point', POINT), relKey].sort());
    for (const [key, row] of reference) {
      const ref = splitEntityKey(key);
      const ops = targeting(key, log);
      // The Dexie layer's fold of one entity (remote only), and the same with the last third still pending on the device.
      expect(JSON.stringify(materializeEntity(ref, ops, [])), key).toBe(JSON.stringify(row));
      const cut = Math.floor((ops.length * 2) / 3);
      const pending = ops.slice(cut).map((op) => ({ ...op, seq: undefined }));
      expect(JSON.stringify(materializeEntity(ref, ops.slice(0, cut), pending)), `${key} with pending ops`).toBe(JSON.stringify(row));
      // The stored row is its own canonical form: parsing it again changes no byte.
      expect(JSON.stringify(entityRowSchemas[ref.entity].parse(row)), `${key} re-parsed`).toBe(JSON.stringify(row));
    }
  });

  it('the replayed local holds the 19 answers, the merged NC and its marks, and is independent of the array order', () => {
    const log = siteLog();
    const row = cabineOf(replay(log));
    expect(Object.keys(row.checklist!).sort()).toEqual([...SITE_ITEM_KEYS].sort());
    expect(row.checklist![ITEM]!.result).toMatchObject({ value: 'NC', merge: { rule: 'nc_over_c', kept: true } });
    expect(row.checklist![ITEM]!.observation).toMatchObject({ value: 'Luminária de emergência inoperante', merge: { rule: 'nc_observation', kept: true } });
    expect(row.checklist![OTHER_ITEM]!.result).toMatchObject({ value: 'NA', conflict: { value: 'C' } });
    expect(row.checklist!.ventilacao).toMatchObject({ result: { value: 'C' }, observation: { value: 'Exaustor inoperante' } });
    expect(row.removed_at).toBeNull();
    expect(JSON.stringify(cabineOf(replay([...log].reverse())))).toBe(JSON.stringify(row));
    // The relatório row the seed check read is the one its create wrote.
    expect(replay(log).get(relKey)).toEqual(relatorio('v4'));
  });

  it('every op of the log passes the push boundary, and every site put names the local and the relatório', () => {
    const log = siteLog();
    const sitePuts = log.filter((op) => parsePath(op.path).family === 'location/checklist');
    expect(sitePuts).toHaveLength(7 + 17 + 1);
    for (const op of sitePuts) expect(targetsOf(op).map((r) => r.key)).toEqual([locKey, relKey]);
    for (const op of log) expect(opSchema.safeParse(op).success, op.path).toBe(true);
  });
});
