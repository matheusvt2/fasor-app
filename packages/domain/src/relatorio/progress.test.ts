import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import { emptySheet, type BlockRow, type Cell, type SuggestionRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import {
  fichasConcluidasText,
  fichasCountText,
  locationProgress,
  naoEnsaiadasText,
  ncAbertosText,
  progress,
  progressCounterState,
  progressCounterText,
  relatorioCounter,
  sugestoesText,
} from './progress.ts';
import { pendingSuggestions } from './suggestions.ts';

const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);

describe('4.3-UNIT progress over the Porto Seguro fixture', () => {
  it('counts 94 sheets, the 3 not-tested ones as concluded and apart, no NC and no pending suggestion', () => {
    expect(progress(snapshot)).toEqual({ sheets_concluded: 3, sheets_total: 94, nc_open: 0, not_tested: 3, suggestions_pending: 0 });
  });

  it('counts one cabine with its colunas', () => {
    const subsolo = snapshot.locations.find((l) => l.name === '1° Subsolo')!;
    // 5 trafos and 5 cabos on the cabine itself, 39 in its 17 colunas.
    expect(locationProgress(snapshot, subsolo.id).sheets_total).toBe(49);
    const enel = snapshot.locations.find((l) => l.name === 'Cubículo Enel')!;
    expect(locationProgress(snapshot, enel.id).sheets_total).toBe(9);
    const geradores = snapshot.locations.find((l) => l.name === 'Geradores')!;
    expect(locationProgress(snapshot, geradores.id).sheets_total).toBe(19);
    // The six cabines partition the 94 sheets and the 3 not-tested ones.
    const cabines = snapshot.locations.filter((l) => l.kind === 'cabine').map((l) => locationProgress(snapshot, l.id));
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

describe('14.10-UNIT relatorioCounter: the Sumário rule on every list counter (part 10)', () => {
  const at = '2026-10-15T10:00:00.000Z';
  const equipment = snapshot.blocks.find((b) => b.removed_at === null && b.equipment_id !== null && b.location_id !== null)!;
  const REL = equipment.relatorio_id;
  const OTHER_REL = '019966b0-0051-7000-8000-0000000000ff';
  const bid = (n: number) => `019966b0-0051-7000-8000-${String(n).padStart(12, '0')}`;
  const sheet = (n: number, over: Partial<BlockRow> = {}): BlockRow => ({
    ...equipment,
    id: bid(n),
    not_tested: null,
    concluded_by: null,
    sheet: emptySheet(),
    removed_at: null,
    ...over,
  });
  const concluded = { concluded_by: { actor_id: 'u1', at } } as const;
  const notTested = { not_tested: { reason: 'desligamento_nao_autorizado', text: null, at, by: 'u1' } as BlockRow['not_tested'] };
  // 12 sheets: two concluded (1 and 2), one not tested (3, concluded too), nine empty.
  const twelve = (): BlockRow[] => [sheet(1, concluded), sheet(2, concluded), sheet(3, notTested), ...Array.from({ length: 9 }, (_, i) => sheet(10 + i))];
  let seq = 100;
  const suggestion = (blockId: string, status: SuggestionRow['status'] = 'pending', relatorioId = REL): SuggestionRow => ({
    id: bid(seq++),
    relatorio_id: relatorioId,
    target_path: `sheet/${blockId}/nameplate/fabricante`,
    value: 'ABB',
    trust: 'suggested',
    mode: 'replace',
    source: { photo_id: bid(900), bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: bid(901) },
    status,
    prompt_version: 'v1',
    hint: null,
  });

  it('a concluded sheet holding a pending suggestion is not counted', () => {
    expect(relatorioCounter(twelve(), [])).toEqual({ text: '3 de 12 fichas', state: 'pending' });
    expect(relatorioCounter(twelve(), [suggestion(bid(1))])).toEqual({ text: '2 de 12 fichas', state: 'pending' });
  });

  it('a não ensaiada sheet holding one is not counted either', () => {
    expect(relatorioCounter(twelve(), [suggestion(bid(3))]).text).toBe('2 de 12 fichas');
  });

  it('a pending row on a removed block is ignored and the sheets count as before', () => {
    const blocks = [...twelve(), sheet(40, { ...concluded, removed_at: at })];
    expect(relatorioCounter(blocks, [suggestion(bid(40))]).text).toBe('3 de 12 fichas');
  });

  it('confirmed and discarded rows hold nothing', () => {
    expect(relatorioCounter(twelve(), [suggestion(bid(1), 'confirmed'), suggestion(bid(2), 'discarded')]).text).toBe('3 de 12 fichas');
  });

  it("another relatório's suggestion never holds a sheet of this one", () => {
    expect(relatorioCounter(twelve(), [suggestion(bid(77), 'pending', OTHER_REL)]).text).toBe('3 de 12 fichas');
  });

  it('rows not read yet (undefined) count the sheets alone', () => {
    expect(relatorioCounter(twelve(), undefined)).toEqual({ text: '3 de 12 fichas', state: 'pending' });
  });

  it('every sheet concluded is complete; one of them held is pending', () => {
    const all = [sheet(1, concluded), sheet(2, concluded), sheet(3, notTested)];
    expect(relatorioCounter(all, [])).toEqual({ text: '3 de 3 fichas', state: 'complete' });
    expect(relatorioCounter(all, [suggestion(bid(2))])).toEqual({ text: '2 de 3 fichas', state: 'pending' });
  });

  it("agrees with the Sumário's count over the same rows", () => {
    const blocks = twelve();
    const rows = [suggestion(bid(1)), suggestion(bid(2), 'confirmed'), suggestion(bid(3), 'discarded')];
    expect(relatorioCounter(blocks, rows).text).toBe(fichasCountText(progress({ blocks, suggestions: [] }, pendingSuggestions(rows))));
  });
});
