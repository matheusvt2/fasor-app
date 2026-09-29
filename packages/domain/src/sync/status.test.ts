import { describe, expect, it } from 'vitest';
import { blockTypeLabel } from '../relatorio/tree.ts';
import { SEED_VERSION } from '../seed/definitions.ts';
import type { SyncCounts } from './counts.ts';
import {
  decisionsCountText,
  downloadProgress,
  downloadRows,
  localDownloadTotals,
  mergeRowSecondaryText,
  mergeRuleText,
  morePhotosText,
  pendingPhotoRows,
  pendingSheetRows,
  percentText,
  sendingCounts,
  sendingGroupText,
  queuedReadingRows,
  SYNC_ROW_STATE_TEXT,
  syncHeadlineText,
  syncSummaryBadges,
  type PendingSheetOutboxLike,
} from './status.ts';

const base: SyncCounts = {
  pending: 0,
  sent: 0,
  dead: 0,
  sheets_pending: 0,
  photos_pending: 0,
  suggestions_pending: 0,
  readings_queued: 0,
  merged: 0,
  upload_errors: 0,
};

describe('syncHeadlineText', () => {
  it('reads the story example: sheets and photos waiting, then readings queued', () => {
    const counts = { ...base, pending: 9, sheets_pending: 3, photos_pending: 12, readings_queued: 2 };
    expect(syncHeadlineText({ counts })).toBe('3 fichas e 12 fotos aguardando · 2 leituras na fila');
  });

  it('puts the contradictions first, in agreement with their count', () => {
    const counts = { ...base, pending: 9, sheets_pending: 3, photos_pending: 12, readings_queued: 2 };
    expect(syncHeadlineText({ counts, contradictions: 1 })).toBe('1 contradição para resolver · 3 fichas e 12 fotos aguardando · 2 leituras na fila');
    expect(syncHeadlineText({ counts: base, contradictions: 2 })).toBe('2 contradições para resolver');
  });

  it('E10-Q4: words structure decisions apart from cell contradictions', () => {
    expect(syncHeadlineText({ counts: base, contradictions: 1, decisions: 2 })).toBe('1 contradição e 2 decisões para resolver');
    expect(syncHeadlineText({ counts: base, decisions: 2 })).toBe('2 decisões para resolver');
    expect(syncHeadlineText({ counts: base, decisions: 1 })).toBe('1 decisão para resolver');
    expect(syncHeadlineText({ counts: { ...base, pending: 1, sheets_pending: 1 }, contradictions: 2, decisions: 1 })).toBe('2 contradições e 1 decisão para resolver · 1 ficha aguardando');
  });

  it('uses the singulars and says so when nothing waits', () => {
    expect(syncHeadlineText({ counts: { ...base, pending: 1, sheets_pending: 1, readings_queued: 1 } })).toBe('1 ficha aguardando · 1 leitura na fila');
    expect(syncHeadlineText({ counts: { ...base, pending: 2 } })).toBe('2 alterações aguardando');
    expect(syncHeadlineText({ counts: base })).toBe('Nada pendente neste aparelho.');
  });
});

describe('syncSummaryBadges', () => {
  it('lists the four badges of the mock, each only when it counts something', () => {
    const counts = { ...base, pending: 4, sheets_pending: 3, photos_pending: 19, dead: 1, suggestions_pending: 3, readings_queued: 2 };
    expect(syncSummaryBadges({ counts, contradictions: 1 })).toEqual([
      { state: 'conflict', text: '1 contradição' },
      { state: 'pending', text: '3 fichas e 19 fotos aguardando envio' },
      { state: 'error', text: '1 erro' },
      { state: 'ok', text: '3 leituras prontas · 2 na fila' },
    ]);
    expect(syncSummaryBadges({ counts: base })).toEqual([]);
  });

  it('E10-Q4: the conflict badge words cells and structure apart', () => {
    expect(syncSummaryBadges({ counts: base, contradictions: 1, decisions: 2 })).toEqual([{ state: 'conflict', text: '1 contradição e 2 decisões' }]);
    expect(syncSummaryBadges({ counts: base, decisions: 2 })).toEqual([{ state: 'conflict', text: '2 decisões' }]);
    expect(syncSummaryBadges({ counts: base, contradictions: 2 })).toEqual([{ state: 'conflict', text: '2 contradições' }]);
  });

  it('counts rejected ops and stopped uploads as errors, and names readings alone', () => {
    expect(syncSummaryBadges({ counts: { ...base, dead: 1, upload_errors: 2 } })).toEqual([{ state: 'error', text: '3 erros' }]);
    expect(syncSummaryBadges({ counts: { ...base, suggestions_pending: 1 } })).toEqual([{ state: 'ok', text: '1 leitura pronta' }]);
    expect(syncSummaryBadges({ counts: { ...base, readings_queued: 2 } })).toEqual([{ state: 'ok', text: '2 leituras na fila' }]);
  });
});

describe('pendingSheetRows', () => {
  const BLOCK_A = '019966b0-0000-7000-8000-000000000050';
  const BLOCK_B = '019966b0-0000-7000-8000-000000000051';
  const BLOCK_C = '019966b0-0000-7000-8000-000000000052';
  const EQUIPMENT = '019966b0-0000-7000-8000-000000000070';
  const context = {
    blocks: [
      { id: BLOCK_A, equipment_id: EQUIPMENT, block_type: 'chave_seccionadora', seed_version: SEED_VERSION },
      { id: BLOCK_B, equipment_id: null, block_type: 'chave_seccionadora', seed_version: SEED_VERSION },
    ],
    equipment: [{ id: EQUIPMENT, tag: 'SEC-C12' }],
    users: [{ id: 'u-ana', name: 'Ana Alves' }],
  };
  const op = (path: string, status: PendingSheetOutboxLike['status'], client_ts: string, actor_id = 'u-ana'): PendingSheetOutboxLike => ({ path, status, client_ts, actor_id });
  const type = blockTypeLabel(SEED_VERSION, 'chave_seccionadora');

  it('gives one row per block with unsent ops, the latest change first, "Enviando…" while a request is out', () => {
    const rows = pendingSheetRows(
      [
        op(`sheet/${BLOCK_A}/checklist/limpeza/result`, 'pending', '2026-09-07T17:22:00.000Z'),
        op(`sheet/${BLOCK_A}/observations`, 'sent', '2026-09-07T17:31:00.000Z'),
        op(`block/${BLOCK_B}/order_key`, 'pending', '2026-09-07T17:26:00.000Z'),
        op(`sheet/${BLOCK_C}/observations`, 'pending', '2026-09-07T17:20:00.000Z', 'u-other'),
        op(`sheet/${BLOCK_B}/observations`, 'acked', '2026-09-07T18:00:00.000Z'),
        op(`sheet/${BLOCK_B}/observations`, 'dead', '2026-09-07T18:01:00.000Z'),
        op('registry/client/019966b0-0000-7000-8000-000000000003/name', 'pending', '2026-09-07T18:02:00.000Z'),
      ],
      context,
      { requestOpen: true },
    );
    expect(rows).toEqual([
      { block_id: BLOCK_A, primary: `SEC-C12 — ${type}`, secondary: 'Alterada por Ana Alves · 07/09 14:31', state: 'sending', stateText: 'Enviando…' },
      { block_id: BLOCK_B, primary: type, secondary: 'Alterada por Ana Alves · 07/09 14:26', state: 'waiting', stateText: 'Aguardando envio' },
      // A block and a user this device does not hold: "Ficha" and the user id.
      { block_id: BLOCK_C, primary: 'Ficha', secondary: 'Alterada por u-other · 07/09 14:20', state: 'waiting', stateText: 'Aguardando envio' },
    ]);
  });

  it('E10-Q5: a `sent` row left by an aborted push waits while no request can be open (offline, server unreachable)', () => {
    const rows = pendingSheetRows([op(`sheet/${BLOCK_A}/observations`, 'sent', '2026-09-07T17:31:00.000Z')], context, { requestOpen: false });
    expect(rows.map((row) => [row.state, row.stateText])).toEqual([['waiting', 'Aguardando envio']]);
  });
});

describe('sendingCounts (E10-Q7)', () => {
  it('counts one per sheet row and every original still to upload, the ones behind "+ n" included', () => {
    const sheet = { block_id: 'b', primary: 'Ficha', secondary: '', state: 'waiting' as const, stateText: 'Aguardando envio' };
    const photo = { id: 'f', primary: 'Foto', secondary: '', state: 'pending' as const };
    expect(sendingCounts([sheet, { ...sheet, block_id: 'c' }], { rows: [photo], more: 11 })).toEqual({ sheets: 2, photos: 12 });
    expect(sendingCounts([], { rows: [], more: 0 })).toEqual({ sheets: 0, photos: 0 });
  });
});

describe('pendingPhotoRows and morePhotosText', () => {
  const photo = (n: number, extra: Partial<{ caption: string | null; reading_status: string; error: boolean }> = {}) => ({
    id: `019966b0-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
    caption: `Foto ${n}`,
    captured_at: `2026-09-07T17:${String(n).padStart(2, '0')}:00.000Z`,
    reading_status: 'none',
    error: false,
    ...extra,
  });

  it('orders by upload order (a queued reading first, then capture time) and marks errors', () => {
    const { rows, more } = pendingPhotoRows([photo(3), photo(1, { error: true }), photo(2, { reading_status: 'queued', caption: '  ' })]);
    expect(rows.map((row) => [row.primary, row.state])).toEqual([
      ['Foto sem legenda', 'pending'],
      ['Foto 1', 'error'],
      ['Foto 3', 'pending'],
    ]);
    expect(rows[1]!.secondary).toBe('07/09 14:01');
    expect(more).toBe(0);
  });

  it('shows at most ten rows and counts the rest', () => {
    const { rows, more } = pendingPhotoRows(Array.from({ length: 13 }, (_, i) => photo(i + 1)));
    expect(rows).toHaveLength(10);
    expect(more).toBe(3);
    expect(morePhotosText(3)).toBe('+ 3 fotos aguardando envio');
    expect(morePhotosText(1)).toBe('+ 1 foto aguardando envio');
    expect(sendingGroupText('sheets', 3)).toBe('Fichas (3)');
    expect(sendingGroupText('photos', 31)).toBe('Fotos (31)');
  });
});

describe('queuedReadingRows', () => {
  it('lists the photos whose reading is queued or running, oldest first, as "Leitura na fila"', () => {
    const rows = queuedReadingRows([
      { id: 'p3', caption: 'Placa', captured_at: '2026-09-07T17:29:00.000Z', reading_status: 'running' },
      { id: 'p1', caption: null, captured_at: '2026-09-07T17:21:00.000Z', reading_status: 'queued' },
      { id: 'p2', caption: 'Visor', captured_at: '2026-09-07T17:25:00.000Z', reading_status: 'done' },
    ]);
    expect(rows).toEqual([
      { id: 'p1', primary: 'Foto sem legenda', secondary: '07/09 14:21', stateText: 'Leitura na fila' },
      { id: 'p3', primary: 'Placa', secondary: '07/09 14:29', stateText: 'Leitura na fila' },
    ]);
  });
});

describe('downloadProgress', () => {
  it('reads the mock line and floors the percent', () => {
    expect(downloadProgress({ sheets: 30, photos: 20 }, { sheets: 12, photos: 8 })).toEqual({
      text: 'Baixando… 12 de 30 fichas · 8 de 20 fotos',
      short: 'Baixando… 12 de 30 fichas',
      percent: 40,
    });
    expect(downloadProgress({ sheets: 3, photos: 0 }, { sheets: 1, photos: 0 })).toEqual({ text: 'Baixando… 1 de 3 fichas', short: 'Baixando… 1 de 3 fichas', percent: 33 });
    expect(percentText(40)).toBe('40 %');
  });

  it('clamps what the device holds to the totals, so the percent stays within 0-100', () => {
    expect(downloadProgress({ sheets: 1, photos: 1 }, { sheets: 5, photos: 3 })).toMatchObject({ text: 'Baixando… 1 de 1 ficha · 1 de 1 foto', percent: 100 });
    expect(downloadProgress({ sheets: 10, photos: 0 }, { sheets: -2, photos: 0 }).percent).toBe(0);
  });

  it('reads "Baixando…" alone without totals (a server older than contract 11) or with nothing to download', () => {
    expect(downloadProgress(undefined, { sheets: 12, photos: 8 })).toEqual({ text: 'Baixando…', short: 'Baixando…', percent: null });
    expect(downloadProgress({ sheets: 0, photos: 0 }, { sheets: 0, photos: 0 }).percent).toBeNull();
  });
});

describe('localDownloadTotals and downloadRows', () => {
  it('counts live blocks and live photo files per relatório', () => {
    const totals = localDownloadTotals(
      [
        { relatorio_id: 'r1', removed_at: null },
        { relatorio_id: 'r1', removed_at: '2026-09-07T17:00:00.000Z' },
        { relatorio_id: 'r2', removed_at: null },
      ],
      [
        { relatorio_id: 'r1', kind: 'photo', removed_at: null },
        { relatorio_id: 'r1', kind: 'cover_photo', removed_at: null },
        { relatorio_id: 'r1', kind: 'photo', removed_at: '2026-09-07T17:00:00.000Z' },
        { relatorio_id: null, kind: 'logo', removed_at: null },
      ],
    );
    expect(totals.get('r1')).toEqual({ sheets: 1, photos: 1 });
    expect(totals.get('r2')).toEqual({ sheets: 1, photos: 0 });
  });

  it('lists every incomplete relatório stream with its title and line, never the company or a project stream', () => {
    const rows = downloadRows({
      states: [
        { id: 'company', complete: false },
        { id: 'project:p1', complete: false },
        { id: 'r1', complete: false },
        { id: 'r2', complete: true },
        { id: 'r3', complete: false },
      ],
      summaries: [
        { id: 'r1', project_id: 'p1', progress: { sheets: 30, photos: 20 } },
        { id: 'r3', project_id: 'p9' },
      ],
      projects: [{ id: 'p1', name: 'Oxigênio — manutenção 2026', site: null, client_id: 'c1' }],
      clients: [{ id: 'c1', name: 'Porto Seguro' }],
      local: new Map([['r1', { sheets: 12, photos: 8 }]]),
    });
    expect(rows).toEqual([
      { relatorio_id: 'r1', primary: 'Porto Seguro · Oxigênio — manutenção 2026', secondary: 'Baixando… 12 de 30 fichas · 8 de 20 fotos', percent: 40, percentText: '40 %' },
      { relatorio_id: 'r3', primary: expect.any(String), secondary: 'Baixando…', percent: null, percentText: null },
    ]);
  });
});

describe('Decisões and merge rows', () => {
  it('counts the decisions waiting', () => {
    expect(decisionsCountText(3)).toBe('3 aguardam decisão');
    expect(decisionsCountText(1)).toBe('1 aguarda decisão');
  });

  it('names each merge rule in the words of "Como funciona a mesclagem"', () => {
    expect(mergeRuleText('nc_over_c')).toBe('NC vence C');
    expect(mergeRuleText('nc_observation')).toBe('NC vence C');
    expect(mergeRuleText('filled_over_empty')).toBe('preenchido vence vazio');
    expect(mergeRuleText('latest_text')).toBe('a edição mais recente prevalece');
    expect(mergeRuleText('latest_edit')).toBe('a edição mais recente prevalece');
    expect(mergeRowSecondaryText({ rule: 'nc_over_c', standing: { value: 'NC', op_id: 'x', actor_id: 'u', client_ts: '2026-09-07T17:20:00.000Z' } })).toBe('07/09 14:20 · NC vence C');
  });

  it('has the row state words of the mock', () => {
    expect(SYNC_ROW_STATE_TEXT).toEqual({ sending: 'Enviando…', waiting: 'Aguardando envio', readingQueued: 'Leitura na fila', merged: 'Mesclado' });
  });
});
