import { describe, expect, it } from 'vitest';
import type { SuggestionRow } from '../schemas/entities.ts';
import { arrivalServed, arrivalsToAnnounce, isCaptionSuggestion, suggestionOnScreen, type ArrivalScreen } from './arrivals.ts';

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

  it('announces nothing for arrivals the open ficha already draws, and splits the rest into readings and captions', () => {
    expect(arrivalsToAnnounce([plate(), env()], ficha)).toEqual({ readings: [], captions: [] });
    const elsewhere = plate(OTHER_BLOCK);
    const legend = caption();
    expect(arrivalsToAnnounce([plate(), elsewhere, legend], ficha)).toEqual({ readings: [elsewhere], captions: [legend] });
    expect(arrivalsToAnnounce([legend], gallery)).toEqual({ readings: [], captions: [] });
    const anywhere = [plate(), legend];
    expect(arrivalsToAnnounce(anywhere, other)).toEqual({ readings: [anywhere[0]], captions: [legend] });
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
