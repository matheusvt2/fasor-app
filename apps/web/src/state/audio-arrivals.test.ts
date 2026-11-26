import type { AudioFileRow, AudioTarget } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { audioArrivalStep, audioTargetRoute } from './audio-arrivals.tsx';

/*
 * 31.4-WEB the arrival toast's rule: the audios a sync brings to `done` are said once, at the end
 * of the cycle; the ones the device held at first look, or pulled in its first sync, never are.
 */

const row = (id: string) => ({ id }) as AudioFileRow;
const REL = '019966b0-0000-7000-8000-000000000401';
const BLOCK = '019966b0-0000-7000-8000-000000000402';

describe('31.4-WEB-002 audioArrivalStep', () => {
  it('never says what the device held at first look', () => {
    const first = audioArrivalStep(null, [row('a')], { running: false, synced: true });
    expect(first.arrived).toEqual([]);
    expect([...first.state.seen]).toEqual(['a']);
  });

  it('never says what a device pulls before its first finished sync', () => {
    const first = audioArrivalStep(null, [], { running: true, synced: false });
    const second = audioArrivalStep(first.state, [row('a')], { running: true, synced: false });
    expect(audioArrivalStep(second.state, [row('a')], { running: false, synced: false }).arrived).toEqual([]);
  });

  it('says the audios of one sync once, at its end, the oldest first', () => {
    const start = audioArrivalStep(null, [], { running: false, synced: true }).state;
    const during = audioArrivalStep(start, [row('c'), row('b')], { running: true, synced: true });
    expect(during.arrived).toEqual([]);
    const end = audioArrivalStep(during.state, [row('c'), row('b')], { running: false, synced: true });
    expect(end.arrived.map((audio) => audio.id)).toEqual(['b', 'c']);
    expect(audioArrivalStep(end.state, [row('c'), row('b')], { running: false, synced: true }).arrived).toEqual([]);
  });

  it('opens the surface of the field', () => {
    const at = (target: AudioTarget) => audioTargetRoute(REL, target);
    expect(at({ type: 'item', block_id: BLOCK, item_key: 'contatos' })).toBe(`/relatorio/${REL}/ficha/${BLOCK}`);
    expect(at({ type: 'sheet_field', block_id: BLOCK, field: 'observations' })).toBe(`/relatorio/${REL}/ficha/${BLOCK}`);
    expect(at({ type: 'photo_caption', file_id: BLOCK })).toBe(`/relatorio/${REL}/fotos`);
    expect(at({ type: 'point', point_id: BLOCK, field: 'text' })).toBe(`/relatorio/${REL}/pontos`);
    expect(at({ type: 'setup', field: 'additional_info' })).toBe(`/relatorio/${REL}/setup`);
    expect(at({ type: 'section', block_id: BLOCK })).toBe(`/relatorio/${REL}/secao/${BLOCK}`);
  });
});
