import 'fake-indexeddb/auto';
import { removePointOp } from '@app/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { pointRowsOf } from '../../db/home-store.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { newId } from '../../ids.ts';
import { pointDraftValue, writePoint, writePointLink, type NewPointLink, type PointValues } from './point-writes.ts';

/*
 * Story 14.3: a point editor's draft keeps the local of a point created from a site item
 * ("Verificações do local"), so "Recuperar" after a reload still creates a point of that
 * local. A draft written before the field, or of any other point, reads with no local.
 */

const REL = '019966c1-0150-7000-8000-000000000001';
const LOCAL = '019966c1-0150-7000-8000-000000000002';
const base = { relatorio_id: REL, text: '[[foto:x]]', action: '', owner: '', is_new: true, equipmentId: null, origin: 'manual', pending: {} };

describe('14.3-UNIT pointDraftValue', () => {
  it('reads back the local of a site item\'s point', () => {
    expect(pointDraftValue({ ...base, locationId: LOCAL })).toEqual({ ...base, locationId: LOCAL });
  });

  it('reads a draft with no local (written before the field, or a point of an equipment) without the key', () => {
    const read = pointDraftValue(base);
    expect(read).toEqual(base);
    expect(read).not.toHaveProperty('locationId');
    expect(pointDraftValue({ ...base, locationId: null })).not.toHaveProperty('locationId');
    expect(pointDraftValue({ ...base, locationId: 7 })).not.toHaveProperty('locationId');
  });

  it('still refuses a value that is not a point draft', () => {
    expect(pointDraftValue({ ...base, equipmentId: 3 })).toBeNull();
    expect(pointDraftValue({ ...base, origin: 'site' })).toBeNull();
  });

  it('Story 20.4: reads back a picked equipment or local of a new point', () => {
    const EQUIPMENT = '019966c1-0150-7000-8000-000000000003';
    expect(pointDraftValue({ ...base, equipmentId: EQUIPMENT })).toEqual({ ...base, equipmentId: EQUIPMENT });
    expect(pointDraftValue({ ...base, equipmentId: null, locationId: LOCAL })).toEqual({ ...base, locationId: LOCAL });
  });
});

/*
 * Story 20.4: a pick in "Equipamento ou local" over a real device store. On a stored point it
 * is one batch of two puts (`equipment_id` and `location_id`); the same pick writes nothing;
 * on a point not stored it waits for the first text, or goes into the create row.
 */
describe('20.4-UNIT writePointLink', () => {
  const USER = '019966c1-0151-7000-8000-000000000001';
  const author = { id: USER, companyId: '019966c1-0151-7000-8000-000000000002' };
  const RELATORIO = '019966c1-0151-7000-8000-000000000003';
  const POINT = '019966c1-0151-7000-8000-000000000004';
  const EQUIPMENT = '019966c1-0151-7000-8000-000000000005';
  const OTHER_EQUIPMENT = '019966c1-0151-7000-8000-000000000006';
  const SITE = '019966c1-0151-7000-8000-000000000007';
  const typed: PointValues = { text: 'Isolador trincado', action: 'Trocar', owner: '' };
  const blankValues: PointValues = { text: '', action: '', owner: '' };
  const geralLink: NewPointLink = { equipmentId: null, origin: 'manual' };
  let db: AppDatabase;

  beforeEach(async () => {
    await openDatabase(USER).delete();
    db = openDatabase(USER);
  });
  afterEach(() => db.close());

  const pointOps = async () => (await db.outbox.toArray()).filter((op) => op.path.startsWith(`point/${POINT}`));
  const stored = async () => (await pointRowsOf(db, RELATORIO)).find((row) => row.id === POINT);
  const createStored = async (link: NewPointLink = geralLink) => {
    await writePoint(db, author, RELATORIO, POINT, typed, ['text', 'action', 'owner'], link, {});
    expect(await stored()).toBeDefined();
  };

  it('Geral to an equipment: one batch, equipment_id put and location_id put to null', async () => {
    await createStored();
    const before = (await pointOps()).length;
    const result = await writePointLink(db, author, RELATORIO, POINT, { equipment_id: EQUIPMENT, location_id: null }, null, typed, {});
    expect(result).toMatchObject({ kind: 'written', created: false });
    const ops = (await pointOps()).slice(before);
    expect(ops.map((op) => [op.kind, op.path, op.value])).toEqual([
      ['put', `point/${POINT}/equipment_id`, EQUIPMENT],
      ['put', `point/${POINT}/location_id`, null],
    ]);
    expect(new Set(ops.map((op) => op.batch_id))).toEqual(new Set([result.kind === 'written' ? result.batchId : '']));
    expect(await stored()).toMatchObject({ equipment_id: EQUIPMENT, location_id: null, text: typed.text, action: 'Trocar' });
  });

  it('an equipment to a local, then to Geral: two puts each time, both fields always written', async () => {
    await createStored({ equipmentId: EQUIPMENT, origin: 'manual' });
    const before = (await pointOps()).length;
    await writePointLink(db, author, RELATORIO, POINT, { equipment_id: null, location_id: SITE }, null, typed, {});
    expect(await stored()).toMatchObject({ equipment_id: null, location_id: SITE });
    await writePointLink(db, author, RELATORIO, POINT, { equipment_id: null, location_id: null }, null, typed, {});
    expect(await stored()).toMatchObject({ equipment_id: null, location_id: null });
    const ops = (await pointOps()).slice(before);
    expect(ops.map((op) => [op.path.split('/').at(-1), op.value])).toEqual([
      ['equipment_id', null],
      ['location_id', SITE],
      ['equipment_id', null],
      ['location_id', null],
    ]);
    expect(new Set(ops.map((op) => op.batch_id)).size).toBe(2);
  });

  it('the same pick writes nothing', async () => {
    await createStored({ equipmentId: EQUIPMENT, origin: 'manual' });
    const before = (await pointOps()).length;
    expect(await writePointLink(db, author, RELATORIO, POINT, { equipment_id: EQUIPMENT, location_id: null }, null, typed, {})).toEqual({ kind: 'unchanged' });
    await writePointLink(db, author, RELATORIO, POINT, { equipment_id: OTHER_EQUIPMENT, location_id: null }, null, typed, {});
    expect((await pointOps()).length).toBe(before + 2);
    expect(await writePointLink(db, author, RELATORIO, POINT, { equipment_id: OTHER_EQUIPMENT, location_id: null }, null, typed, {})).toEqual({ kind: 'unchanged' });
    expect((await pointOps()).length).toBe(before + 2);
  });

  it('a point not stored with nothing to print: pending, nothing written; with text: created with the link', async () => {
    expect(await writePointLink(db, author, RELATORIO, POINT, { equipment_id: EQUIPMENT, location_id: null }, geralLink, blankValues, {})).toEqual({ kind: 'pending' });
    expect(await pointOps()).toEqual([]);
    expect(await writePointLink(db, author, RELATORIO, POINT, { equipment_id: null, location_id: null }, geralLink, typed, {})).toEqual({ kind: 'unchanged' });
    expect(await pointOps()).toEqual([]);
    const result = await writePointLink(db, author, RELATORIO, POINT, { equipment_id: null, location_id: SITE }, geralLink, typed, { priority: 'P1' });
    expect(result).toMatchObject({ kind: 'written', created: true });
    const ops = await pointOps();
    expect(ops.map((op) => op.kind)).toEqual(['create']);
    expect(await stored()).toMatchObject({ equipment_id: null, location_id: SITE, text: typed.text, priority: 'P1' });
  });

  it('the held link goes into the create row the first text writes', async () => {
    await writePoint(db, author, RELATORIO, POINT, typed, ['text'], { ...geralLink, equipmentId: EQUIPMENT }, {});
    expect(await stored()).toMatchObject({ equipment_id: EQUIPMENT });
  });

  it('a point removed or unknown is gone', async () => {
    expect(await writePointLink(db, author, RELATORIO, POINT, { equipment_id: EQUIPMENT, location_id: null }, null, typed, {})).toEqual({ kind: 'gone' });
    await createStored();
    await commitBatch(db, [removePointOp(author, RELATORIO, POINT)], { newId, now });
    expect(await writePointLink(db, author, RELATORIO, POINT, { equipment_id: EQUIPMENT, location_id: null }, null, typed, {})).toEqual({ kind: 'gone' });
  });
});
