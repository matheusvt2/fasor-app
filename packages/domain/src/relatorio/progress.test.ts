import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import {
  cabineProgress,
  fichasConcluidasText,
  fichasCountText,
  naoEnsaiadasText,
  ncAbertosText,
  progress,
  progressCounterState,
  progressCounterText,
  sugestoesText,
} from './progress.ts';

const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);

describe('4.3-UNIT progress over the Porto Seguro fixture', () => {
  it('counts 94 sheets, the 3 not-tested ones as concluded and apart, no NC and no pending suggestion', () => {
    expect(progress(snapshot)).toEqual({ sheets_concluded: 3, sheets_total: 94, nc_open: 0, not_tested: 3, suggestions_pending: 0 });
  });

  it('counts one cabine with its colunas', () => {
    const subsolo = snapshot.locations.find((l) => l.name === '1° Subsolo')!;
    // 5 trafos and 5 cabos on the cabine itself, 39 in its 17 colunas.
    expect(cabineProgress(snapshot, subsolo.id).sheets_total).toBe(49);
    const enel = snapshot.locations.find((l) => l.name === 'Cubículo Enel')!;
    expect(cabineProgress(snapshot, enel.id).sheets_total).toBe(9);
    const geradores = snapshot.locations.find((l) => l.name === 'Geradores')!;
    expect(cabineProgress(snapshot, geradores.id).sheets_total).toBe(19);
    // The six cabines partition the 94 sheets and the 3 not-tested ones.
    const cabines = snapshot.locations.filter((l) => l.kind === 'cabine').map((l) => cabineProgress(snapshot, l.id));
    expect(cabines.reduce((n, p) => n + p.sheets_total, 0)).toBe(94);
    expect(cabines.reduce((n, p) => n + p.not_tested, 0)).toBe(3);
  });

  it('counts NC checklist answers and ignores removed and section blocks', () => {
    const cell = (value: string): Cell => ({ value, source_suggestion_id: null, op_id: '019966b0-0050-7000-8000-000000000001' });
    const base = snapshot.blocks[0]!;
    const nc: BlockRow = { ...base, id: '019966b0-0050-7000-8000-000000000002', sheet: { ...emptySheet(), checklist: { limpeza: { result: cell('NC') }, mufla: { result: cell('C') } } } };
    const removed: BlockRow = { ...nc, id: '019966b0-0050-7000-8000-000000000003', removed_at: '2026-09-07T10:00:00.000Z' };
    const section: BlockRow = { ...base, id: '019966b0-0050-7000-8000-000000000004', location_id: null, equipment_id: null, block_type: 'section_2', config: {} };
    expect(progress({ blocks: [nc, removed, section], suggestions: [] })).toEqual({ sheets_concluded: 0, sheets_total: 1, nc_open: 1, not_tested: 0, suggestions_pending: 0 });
  });

  it('writes the counter and the four header texts, plural-correct', () => {
    const p = { sheets_concluded: 0, sheets_total: 94 };
    expect(progressCounterText(p)).toBe('0 de 94');
    expect(fichasCountText(p)).toBe('0 de 94 fichas');
    expect(fichasConcluidasText(p)).toBe('0 de 94 fichas concluídas');
    expect(progressCounterState(p)).toBe('pending');
    expect(progressCounterState({ sheets_concluded: 94, sheets_total: 94 })).toBe('complete');
    expect(progressCounterState({ sheets_concluded: 0, sheets_total: 0 })).toBe('pending');
    expect(ncAbertosText(0)).toBe('0 NC abertos');
    expect(ncAbertosText(1)).toBe('1 NC aberto');
    expect(ncAbertosText(2)).toBe('2 NC abertos');
    expect(naoEnsaiadasText(1)).toBe('1 não ensaiada');
    expect(naoEnsaiadasText(3)).toBe('3 não ensaiadas');
    expect(sugestoesText(12)).toBe('12 sugestões por confirmar');
    expect(sugestoesText(1)).toBe('1 sugestão por confirmar');
  });
});
