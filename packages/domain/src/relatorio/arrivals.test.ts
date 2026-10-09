import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { LocationRow, SuggestionRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { arrivalServed, arrivalToAnnounce, fichaArrivalScreen, isCaptionSuggestion, suggestionOnScreen, type ArrivalScreen } from './arrivals.ts';
import { cabineOf, type CabineLocation } from './cabine.ts';
import { instantiateTemplate } from './instantiate.ts';
import { firstInTree } from './tree.ts';

/*
 * Review fixes 2026-10-08 (DC-4, DB-5, DE-5, DG-3): what a reading arrival announces given the
 * screen, readings and captions apart, and when its announcement is served.
 */

const RELATORIO = '019966b0-0090-7000-8000-000000000001';
const OTHER_RELATORIO = '019966b0-0090-7000-8000-000000000002';
const BLOCK = '019966b0-0090-7000-8000-000000000003';
const OTHER_BLOCK = '019966b0-0090-7000-8000-000000000004';
const CABINE = '019966b0-0090-7000-8000-000000000005';
const OTHER_CABINE = '019966b0-0090-7000-8000-000000000006';
const PHOTO = '019966b0-0090-7000-8000-000000000007';
let seq = 0x10;
const nextId = () => `019966b0-0090-7000-8000-${(++seq).toString(16).padStart(12, '0')}`;

function row(target_path: string, extra: Partial<SuggestionRow> = {}): SuggestionRow {
  return {
    id: nextId(),
    relatorio_id: RELATORIO,
    target_path,
    value: 'X',
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: PHOTO, bbox: [0.1, 0.1, 0.2, 0.2], ocr_token_ids: [], reading_run_id: nextId() },
    status: 'pending',
    prompt_version: 'test-1',
    hint: null,
    ...extra,
  };
}

const plate = (block = BLOCK) => row(`sheet/${block}/nameplate/n_serie`);
const env = (cabine = CABINE) => row(`location/${cabine}/env/temperature_c`);
const caption = () => row(`file/${PHOTO}/caption`);

const ficha: ArrivalScreen = { kind: 'ficha', relatorioId: RELATORIO, blockId: BLOCK, cabineId: CABINE };
const gallery: ArrivalScreen = { kind: 'gallery', relatorioId: RELATORIO };
const other: ArrivalScreen = { kind: 'other' };

describe('arrival rules (review fixes 2026-10-08, DC-4)', () => {
  it('tells a caption row from a reading row', () => {
    expect(isCaptionSuggestion(caption())).toBe(true);
    expect(isCaptionSuggestion(plate())).toBe(false);
    expect(isCaptionSuggestion(env())).toBe(false);
  });

  it('reads the open ficha as drawing its own block and its cabine\'s environment fields, nothing else', () => {
    expect(suggestionOnScreen(plate(), ficha)).toBe(true);
    expect(suggestionOnScreen(row(`sheet/${BLOCK}/checklist/item_4/observation`), ficha)).toBe(true);
    expect(suggestionOnScreen(env(), ficha)).toBe(true);
    expect(suggestionOnScreen(plate(OTHER_BLOCK), ficha)).toBe(false);
    expect(suggestionOnScreen(env(OTHER_CABINE), ficha)).toBe(false);
    expect(suggestionOnScreen(env(), { ...ficha, cabineId: null })).toBe(false);
    expect(suggestionOnScreen(caption(), ficha)).toBe(false);
    expect(suggestionOnScreen({ ...plate(), relatorio_id: OTHER_RELATORIO }, ficha)).toBe(false);
  });

  it('reads the gallery as drawing the captions of its relatório only', () => {
    expect(suggestionOnScreen(caption(), gallery)).toBe(true);
    expect(suggestionOnScreen({ ...caption(), relatorio_id: OTHER_RELATORIO }, gallery)).toBe(false);
    expect(suggestionOnScreen(plate(), gallery)).toBe(false);
    expect(suggestionOnScreen(caption(), other)).toBe(false);
  });

  it('announces nothing for arrivals the open ficha already draws; readings take the one toast over captions in a mixed pull', () => {
    expect(arrivalToAnnounce([plate(), env()], ficha)).toBeNull();
    const elsewhere = plate(OTHER_BLOCK);
    const legend = caption();
    expect(arrivalToAnnounce([plate(), elsewhere, legend], ficha)).toEqual({ kind: 'readings', rows: [elsewhere] });
    expect(arrivalToAnnounce([legend], gallery)).toBeNull();
    expect(arrivalToAnnounce([legend], ficha)).toEqual({ kind: 'captions', rows: [legend] });
    const mine = plate();
    expect(arrivalToAnnounce([mine, legend], other)).toEqual({ kind: 'readings', rows: [mine] });
    // On the gallery a mixed pull announces its readings, its captions being drawn there.
    expect(arrivalToAnnounce([mine, legend], gallery)).toEqual({ kind: 'readings', rows: [mine] });
  });

  it('serves an announcement once none of its rows is pending, or every pending one is on screen', () => {
    const a = plate(OTHER_BLOCK);
    const b = plate(OTHER_BLOCK);
    const announced = new Set([a.id, b.id]);
    expect(arrivalServed(announced, [a, b], other)).toBe(false);
    expect(arrivalServed(announced, [a, b], { ...ficha, blockId: OTHER_BLOCK })).toBe(true);
    expect(arrivalServed(announced, [{ ...a, status: 'confirmed' }, b], other)).toBe(false);
    expect(arrivalServed(announced, [plate()], other)).toBe(true);
    expect(arrivalServed(announced, [], other)).toBe(true);
  });
});

describe('fichaArrivalScreen (review fixes 2026-10-08, DC-4): the cabine\'s env fields count as on screen only where the ficha draws them', () => {
  function fresh(): RelatorioSnapshot {
    const { relatorioId, drafts } = instantiateTemplate(
      standardTemplate({ id: '019966b0-0091-7000-8000-000000000001' }),
      { id: TEST_PROJECT },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
      { newId: idSequence('019966b0-0092-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
    );
    const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0093-7000-8000-'), now: T0 }), seq: i + 1 }));
    return buildSnapshot(replay(ops), relatorioId);
  }
  const m = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
  const complete = (snapshot: RelatorioSnapshot, cabineId: string): RelatorioSnapshot => ({
    ...snapshot,
    locations: snapshot.locations.map((l: LocationRow) =>
      l.id === cabineId
        ? ({ ...l, se: { type: 'ALVENARIA - CONVENCIONAL', primary_kv: m('13.8', 'kV'), secondary_kv: m('380', 'V'), installed_kva: m('1500', 'kVA') }, env: { altitude_m: null, temperature_c: m('25', '°C'), humidity_pct: m('65', '%') } } as CabineLocation)
        : l,
    ),
  });

  it('gives the cabine on its first sheet, on any sheet while it is incomplete, and none on another sheet of a complete cabine', () => {
    const snapshot = fresh();
    const enel = snapshot.locations.find((l) => l.name === 'Cubículo Enel')!;
    const first = firstInTree(snapshot, enel.id)!;
    const second = snapshot.blocks.find((b) => b.id !== first && b.equipment_id !== null && cabineOf(snapshot.locations, b.location_id)?.id === enel.id)!.id;
    const rel = snapshot.relatorio.id;
    expect(fichaArrivalScreen(snapshot, rel, first)).toEqual({ kind: 'ficha', relatorioId: rel, blockId: first, cabineId: enel.id });
    expect(fichaArrivalScreen(snapshot, rel, second)).toEqual({ kind: 'ficha', relatorioId: rel, blockId: second, cabineId: enel.id });
    const done = complete(snapshot, enel.id);
    expect(fichaArrivalScreen(done, rel, first).cabineId).toBe(enel.id);
    expect(fichaArrivalScreen(done, rel, second)).toEqual({ kind: 'ficha', relatorioId: rel, blockId: second, cabineId: null });
    // A block this device does not hold: no cabine.
    expect(fichaArrivalScreen(done, rel, '019966b0-0091-7000-8000-0000000000ff').cabineId).toBeNull();
  });
});
