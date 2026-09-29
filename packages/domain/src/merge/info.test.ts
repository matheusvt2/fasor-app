import { describe, expect, it } from 'vitest';
import { materializeEntity } from '../ops/materialize.ts';
import type { Op } from '../ops/op.ts';
import { emptySheet, type BlockRow, type FileRow, type JsonValue } from '../schemas/entities.ts';
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

  it('is counted by syncCounts once per pair', () => {
    const { create, e, a } = scenario();
    const nc = e(result, 'NC');
    const c = a(result, 'C');
    const info = mergeInfoOf(c, nc, fold([create, nc, c]))!;
    expect(syncCounts([], {}, [info, info]).merged).toBe(1);
    expect(syncCounts([]).merged).toBe(0);
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
