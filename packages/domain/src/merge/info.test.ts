import { describe, expect, it } from 'vitest';
import { materializeEntity } from '../ops/materialize.ts';
import type { Op } from '../ops/op.ts';
import { emptySheet, type BlockRow, type FileRow, type JsonValue, type LocationRow } from '../schemas/entities.ts';
import { getDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { opFactory, TEST_COMPANY, TEST_RELATORIO } from '../test-support.ts';
import { syncCounts } from '../sync/counts.ts';
import { mergeInfoOf, mergeInfoText, pulledMergePairs, type MergeInfoContext } from './info.ts';

/* Story 10.1: the information entry of each merge, and its Sync status words. */

const BLOCK = '019966b0-0011-7000-8000-000000000001';
const LOC = '019966b0-0011-7000-8000-000000000002';
const EDUARDO = '019966b0-0011-7000-8000-000000000003';
const ANA = '019966b0-0011-7000-8000-000000000004';
const EQUIPMENT = '019966b0-0011-7000-8000-000000000005';
const PHOTO = '019966b0-0011-7000-8000-000000000006';
const E_DEVICE = 'tablet-eduardo';
const A_DEVICE = 'tablet-ana';

const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
const ITEM = definition.checklist![9]!.key;
const result = `sheet/${BLOCK}/checklist/${ITEM}/result`;
const observation = `sheet/${BLOCK}/checklist/${ITEM}/observation`;

const blockRow = (): BlockRow => ({
  id: BLOCK,
  relatorio_id: TEST_RELATORIO,
  location_id: LOC,
  equipment_id: EQUIPMENT,
  block_type: 'chave_seccionadora',
  config: {},
  seed_version: SEED_VERSION,
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

const photo: FileRow = {
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
  block_id: BLOCK,
  item_key: ITEM,
  caption: null,
  reading_kind: null,
  reading_target: null,
  reading_status: 'none',
  people_in_photo: false,
};

const context = (files: FileRow[] = [photo]): MergeInfoContext => ({
  blocks: [blockRow()],
  equipment: [{ id: EQUIPMENT, tag: 'SEC-C12' }],
  users: [
    { id: EDUARDO, name: 'Eduardo Esteves' },
    { id: ANA, name: 'Ana Alves' },
  ],
  files,
});

function scenario() {
  const f = opFactory();
  const create = f.op({ kind: 'create', path: `block/${BLOCK}`, value: blockRow(), device_id: 'office' });
  const e = (path: string, value: JsonValue, prev: string | null = null) => f.op({ path, value, prev_op_id: prev, actor_id: EDUARDO, device_id: E_DEVICE });
  const a = (path: string, value: JsonValue, prev: string | null = null) => f.op({ path, value, prev_op_id: prev, actor_id: ANA, device_id: A_DEVICE });
  return { f, create, e, a };
}

const seqd = (log: Op[]) => log.map((op, i) => ({ ...op, seq: i + 1 }));
const fold = (log: Op[]) => materializeEntity({ entity: 'block', id: BLOCK }, seqd(log), []) as BlockRow;

describe('mergeInfoOf', () => {
  it('NC first: the C device pushed later and was merged away; the entry names NC by Eduardo', () => {
    const { create, e, a } = scenario();
    const nc = e(result, 'NC');
    const c = a(result, 'C');
    const row = fold([create, nc, c]);
    const info = mergeInfoOf(c, nc, row)!;
    expect(info).toMatchObject({ op_id: c.op_id, over_op_id: nc.op_id, block_id: BLOCK, rule: 'nc_over_c', relatorio_id: TEST_RELATORIO });
    expect(info.standing).toEqual({ value: 'NC', op_id: nc.op_id, actor_id: EDUARDO, client_ts: nc.client_ts });
    expect(info.overridden).toEqual({ value: 'C', actor_id: ANA, client_ts: c.client_ts });
    expect(mergeInfoText(info, context())).toBe('SEC-C12: item 10 NC de Eduardo (com foto) mesclado');
    expect(mergeInfoText(info, context([{ ...photo, removed_at: '2026-09-21T13:00:00.000Z' }]))).toBe('SEC-C12: item 10 NC de Eduardo mesclado');
  });

  it('C first: the NC op applied over C; the same words', () => {
    const { create, e, a } = scenario();
    const c = a(result, 'C');
    const nc = e(result, 'NC');
    const info = mergeInfoOf(nc, c, fold([create, c, nc]))!;
    expect(info.rule).toBe('nc_over_c');
    expect(mergeInfoText(info, context())).toBe('SEC-C12: item 10 NC de Eduardo (com foto) mesclado');
  });

  it('the observation entry of the NC device', () => {
    const { create, e, a } = scenario();
    const nc = e(result, 'NC');
    const obsE = e(observation, 'Fusível queimado');
    const c = a(result, 'C');
    const obsA = a(observation, 'Tudo certo');
    const row = fold([create, nc, obsE, c, obsA]);
    const info = mergeInfoOf(obsA, obsE, row)!;
    expect(info.rule).toBe('nc_observation');
    expect(info.standing.value).toBe('Fusível queimado');
    expect(info.overridden?.value).toBe('Tudo certo');
    expect(mergeInfoText(info, context())).toBe('SEC-C12: observação do item 10 de Eduardo mantida (NC vence C)');
  });

  it('free text keeps the overridden text and both times', () => {
    const { create, e, a } = scenario();
    const path = `sheet/${BLOCK}/observations`;
    const first = e(path, 'Versão de Eduardo');
    const second = a(path, 'Versão de Ana');
    const info = mergeInfoOf(second, first, fold([create, first, second]))!;
    expect(info.rule).toBe('latest_text');
    expect(info.overridden).toEqual({ value: 'Versão de Eduardo', actor_id: EDUARDO, client_ts: first.client_ts });
    expect(info.standing.client_ts).toBe(second.client_ts);
    const text = mergeInfoText(info, context());
    expect(text).toContain('SEC-C12: observações da ficha — versão de Ana');
    expect(text).toContain('"Versão de Eduardo"');
  });

  it('filled over empty', () => {
    const { create, e, a } = scenario();
    const nc = e(result, 'NC');
    const cleared = a(result, null);
    const info = mergeInfoOf(cleared, nc, fold([create, nc, cleared]))!;
    expect(info.rule).toBe('filled_over_empty');
    expect(info.overridden).toBeNull();
  });

  it('is null for a same value, a contradiction, one device, a server op and a later sequential put', () => {
    const { create, e, a, f } = scenario();
    const nc = e(result, 'NC');
    const same = a(result, 'NC');
    expect(mergeInfoOf(same, nc, fold([create, nc, same]))).toBeNull();
    const na = a(result, 'NA');
    expect(mergeInfoOf(na, nc, fold([create, nc, na]))).toBeNull();
    const again = e(result, 'C');
    expect(mergeInfoOf(again, nc, fold([create, nc, again]))).toBeNull();
    const server = f.op({ path: result, value: 'C', actor_id: 'system:x', device_id: 'server' });
    expect(mergeInfoOf(server, nc, fold([create, nc, server]))).toBeNull();
    const c = a(result, 'C');
    const override = a(result, 'C', c.op_id);
    expect(mergeInfoOf(c, nc, fold([create, nc, c, override]))).toBeNull();
  });

  it('a non-cell field is last-writer-wins and reported as latest_edit', () => {
    const { e, a } = scenario();
    const path = `block/${BLOCK}/order_key`;
    const first = e(path, 'a1');
    const second = a(path, 'a2');
    const info = mergeInfoOf(second, first, null)!;
    expect(info).toMatchObject({ rule: 'latest_edit', block_id: BLOCK, standing: { value: 'a2', actor_id: ANA }, overridden: { value: 'a1', actor_id: EDUARDO } });
    expect(mergeInfoText(info, context())).toBe('SEC-C12: alteração de Ana mantida (a mais recente prevalece)');
  });

  it("a local's Função put concurrently on two devices is last-writer-wins and reported as latest_edit (Story 14.2)", () => {
    const { e, a } = scenario();
    const path = `location/${LOC}/funcao`;
    const first = e(path, 'primaria');
    const second = a(path, 'transformacao');
    expect(mergeInfoOf(second, first, null)).toMatchObject({
      rule: 'latest_edit',
      path,
      block_id: null,
      standing: { value: 'transformacao', actor_id: ANA },
      overridden: { value: 'primaria', actor_id: EDUARDO },
    });
    // The same Função on both sides is no merge.
    expect(mergeInfoOf(a(path, 'primaria'), first, null)).toBeNull();
  });

  it('a non-cell pair that wrote the same value (or removed on both sides) is no merge', () => {
    const { e, a, f } = scenario();
    const path = `block/${BLOCK}/order_key`;
    expect(mergeInfoOf(a(path, 'a1'), e(path, 'a1'), null)).toBeNull();
    const removed = `block/${BLOCK}/removed_at`;
    const removeBy = (actor: string, device: string) => f.op({ kind: 'remove', path: removed, value: null, actor_id: actor, device_id: device });
    expect(mergeInfoOf(removeBy(ANA, A_DEVICE), removeBy(EDUARDO, E_DEVICE), null)).toBeNull();
  });

  it('is counted by syncCounts once per pair', () => {
    const { create, e, a } = scenario();
    const nc = e(result, 'NC');
    const c = a(result, 'C');
    const info = mergeInfoOf(c, nc, fold([create, nc, c]))!;
    expect(syncCounts([], {}, [info, info]).merged).toBe(1);
    expect(syncCounts([]).merged).toBe(0);
  });
});

describe('Story 14.3: the merge entry of a local\'s site checklist cell', () => {
  const SITE_ITEM = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
  const siteResult = `location/${LOC}/checklist/${SITE_ITEM}/result`;
  const siteObservation = `location/${LOC}/checklist/${SITE_ITEM}/observation`;
  const localRow = (): LocationRow => ({
    id: LOC,
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
  const sitePhoto: FileRow = { ...photo, block_id: null, item_key: SITE_ITEM, location_id: LOC };
  const siteContext = (files: FileRow[] = [sitePhoto], held = true): MergeInfoContext => ({
    ...context(files),
    locations: held ? [{ id: LOC, name: '1° Subsolo' }] : [],
    relatorios: [{ id: TEST_RELATORIO, seed_version: 'v4' }],
  });
  function site() {
    const { f, e, a } = scenario();
    const create = f.op({ kind: 'create', path: `location/${LOC}`, value: localRow(), device_id: 'office' });
    const foldLocal = (log: Op[]) => materializeEntity({ entity: 'location', id: LOC }, seqd(log), []) as LocationRow;
    return { create, e, a, foldLocal };
  }

  it('NC against C: the entry reports the rule like a sheet cell, with no block, and names the local and "Verificações do local · Item N"', () => {
    const { create, e, a, foldLocal } = site();
    const nc = e(siteResult, 'NC');
    const c = a(siteResult, 'C');
    const info = mergeInfoOf(c, nc, foldLocal([create, nc, c]))!;
    expect(info).toMatchObject({ op_id: c.op_id, over_op_id: nc.op_id, block_id: null, rule: 'nc_over_c', relatorio_id: TEST_RELATORIO, path: siteResult });
    expect(info.standing).toEqual({ value: 'NC', op_id: nc.op_id, actor_id: EDUARDO, client_ts: nc.client_ts });
    expect(info.overridden).toEqual({ value: 'C', actor_id: ANA, client_ts: c.client_ts });
    expect(mergeInfoText(info, siteContext())).toBe('1° Subsolo: Verificações do local · Item 11 NC de Eduardo (com foto) mesclado');
    // The same words whichever side arrived first.
    const other = site();
    const c2 = other.a(siteResult, 'C');
    const nc2 = other.e(siteResult, 'NC');
    const applied = mergeInfoOf(nc2, c2, other.foldLocal([other.create, c2, nc2]))!;
    expect(applied).toMatchObject({ rule: 'nc_over_c', block_id: null, standing: { value: 'NC', actor_id: EDUARDO } });
    expect(mergeInfoText(applied, siteContext())).toBe('1° Subsolo: Verificações do local · Item 11 NC de Eduardo (com foto) mesclado');
  });

  it('"(com foto)" counts only a live photo of that item of that local with no block', () => {
    const { create, e, a, foldLocal } = site();
    const nc = e(siteResult, 'NC');
    const c = a(siteResult, 'C');
    const info = mergeInfoOf(c, nc, foldLocal([create, nc, c]))!;
    const plain = '1° Subsolo: Verificações do local · Item 11 NC de Eduardo mesclado';
    expect(mergeInfoText(info, siteContext([]))).toBe(plain);
    expect(mergeInfoText(info, siteContext([{ ...sitePhoto, removed_at: '2026-09-21T13:00:00.000Z' }]))).toBe(plain);
    expect(mergeInfoText(info, siteContext([{ ...sitePhoto, item_key: 'ventilacao' }]))).toBe(plain);
    expect(mergeInfoText(info, siteContext([{ ...sitePhoto, location_id: EQUIPMENT }]))).toBe(plain);
    // A photo carrying both a block and a local is its block's.
    expect(mergeInfoText(info, siteContext([{ ...sitePhoto, block_id: BLOCK }]))).toBe(plain);
    // The sheet photo of the same test file is no site photo.
    expect(mergeInfoText(info, siteContext([photo]))).toBe(plain);
  });

  it('the observation entries: the NC device\'s kept, latest text with both versions, filled over empty', () => {
    const { create, e, a, foldLocal } = site();
    const nc = e(siteResult, 'NC');
    const eObs = e(siteObservation, 'Luminária de emergência inoperante');
    const c = a(siteResult, 'C');
    const aObs = a(siteObservation, 'ok');
    const kept = mergeInfoOf(aObs, eObs, foldLocal([create, nc, eObs, c, aObs]))!;
    expect(kept).toMatchObject({ rule: 'nc_observation', block_id: null, standing: { value: 'Luminária de emergência inoperante', actor_id: EDUARDO } });
    expect(mergeInfoText(kept, siteContext())).toBe('1° Subsolo: Verificações do local · Item 11, observação de Eduardo mantida (NC vence C)');

    const text = site();
    const first = text.e(siteObservation, 'Autonomia abaixo de 2 h');
    const second = text.a(siteObservation, 'Sem iluminação de emergência');
    const latest = mergeInfoOf(second, first, text.foldLocal([text.create, first, second]))!;
    expect(latest.rule).toBe('latest_text');
    expect(mergeInfoText(latest, siteContext())).toMatch(
      /^1° Subsolo: Verificações do local · Item 11, observação — versão de Ana \(\d\d\/\d\d \d\d:\d\d\); a de Eduardo \(\d\d\/\d\d \d\d:\d\d\) era "Autonomia abaixo de 2 h"$/,
    );

    const empty = site();
    const x = empty.a(siteObservation, 'Autonomia abaixo de 2 h');
    const cleared = empty.a(siteObservation, null, x.op_id);
    const typed = empty.e(siteObservation, 'Autonomia abaixo de 2 h, medida em 40 min', x.op_id);
    const filled = mergeInfoOf(typed, cleared, empty.foldLocal([empty.create, x, cleared, typed]))!;
    expect(filled).toMatchObject({ rule: 'filled_over_empty', overridden: null });
    expect(mergeInfoText(filled, siteContext())).toBe('1° Subsolo: Verificações do local · Item 11, observação de Eduardo mantida (preenchido vence vazio)');
  });

  it('a local this device does not hold reads "Relatório"; the item number follows the relatório\'s seed version, the current seed\'s when it is not held', () => {
    const { create, e, a, foldLocal } = site();
    const nc = e(siteResult, 'NC');
    const c = a(siteResult, 'C');
    const info = mergeInfoOf(c, nc, foldLocal([create, nc, c]))!;
    expect(mergeInfoText(info, siteContext([], false))).toBe('Relatório: Verificações do local · Item 11 NC de Eduardo mesclado');
    expect(mergeInfoText(info, { ...context([]), locations: [{ id: LOC, name: '1° Subsolo' }] })).toBe('1° Subsolo: Verificações do local · Item 11 NC de Eduardo mesclado');
    // A relatório whose seed version ships no site list names no item number.
    expect(mergeInfoText(info, { ...siteContext([]), relatorios: [{ id: TEST_RELATORIO, seed_version: 'v3' }] })).toBe('1° Subsolo: Verificações do local NC de Eduardo mesclado');
  });

  it('is null for a same value, a contradiction (C against NA), one device, a later sequential put and a row that is no cabine', () => {
    const { create, e, a, foldLocal } = site();
    const nc = e(siteResult, 'NC');
    const same = a(siteResult, 'NC');
    expect(mergeInfoOf(same, nc, foldLocal([create, nc, same]))).toBeNull();
    const c = e(siteResult, 'C');
    const na = a(siteResult, 'NA');
    expect(mergeInfoOf(na, c, foldLocal([create, c, na]))).toBeNull();
    const again = e(siteResult, 'C');
    expect(mergeInfoOf(again, nc, foldLocal([create, nc, again]))).toBeNull();
    const merged = a(siteResult, 'C');
    const later = a(siteResult, 'NA', merged.op_id);
    expect(mergeInfoOf(merged, nc, foldLocal([create, nc, merged, later]))).toBeNull();
    expect(mergeInfoOf(merged, nc, null)).toBeNull();
    expect(mergeInfoOf(merged, nc, { id: LOC, kind: 'coluna' })).toBeNull();
  });

  it('is counted by syncCounts once per pair, as any other merge entry', () => {
    const { create, e, a, foldLocal } = site();
    const nc = e(siteResult, 'NC');
    const c = a(siteResult, 'C');
    const info = mergeInfoOf(c, nc, foldLocal([create, nc, c]))!;
    expect(syncCounts([], {}, [info, info]).merged).toBe(1);
  });
});

describe('pulledMergePairs', () => {
  it('lists another device op that did not see the latest op on its path', () => {
    const { create, e, a } = scenario();
    const nc = { ...e(result, 'NC'), seq: 2 };
    const c = { ...a(result, 'C'), seq: 3 };
    const deliberate = { ...a(result, 'C', c.op_id), seq: 4 };
    expect(pulledMergePairs([{ ...create, seq: 1 }, nc], [c, deliberate], E_DEVICE)).toEqual([{ op_id: c.op_id, over_op_id: nc.op_id }]);
    // Own ops (their push answer reported them), creates and already-held ops are left out.
    expect(pulledMergePairs([c], [nc], E_DEVICE)).toEqual([]);
    expect(pulledMergePairs([nc, c], [c], E_DEVICE)).toEqual([]);
    // No op before it on the path: nothing to merge with.
    expect(pulledMergePairs([], [c], E_DEVICE)).toEqual([]);
  });
});
