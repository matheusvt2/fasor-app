import { describe, expect, it } from 'vitest';
import {
  pendingSummaryCount,
  pendingSummaryText,
  syncBadgeLabel,
  syncBadgeShortLabel,
  syncBadgeState,
  syncCounts,
  type OutboxLike,
} from './counts.ts';

const BLOCK_A = '019966b0-0000-7000-8000-000000000050';
const BLOCK_B = '019966b0-0000-7000-8000-000000000051';
const FILE_1 = '019966b0-0000-7000-8000-000000000060';
const CLIENT = '019966b0-0000-7000-8000-000000000003';

const row = (path: string, status: OutboxLike['status'], extra: Partial<OutboxLike> = {}): OutboxLike => ({
  path,
  status,
  ...extra,
});

describe('syncCounts', () => {
  it('counts statuses and distinct pending blocks', () => {
    const counts = syncCounts([
      row(`sheet/${BLOCK_A}/nameplate/fabricante`, 'pending'),
      row(`sheet/${BLOCK_A}/checklist/limpeza/result`, 'sent'),
      row(`block/${BLOCK_B}/order_key`, 'pending'),
      row(`block/${BLOCK_B}`, 'acked', { kind: 'create' }),
      row(`sheet/${BLOCK_A}/observations`, 'dead'),
      row(`registry/client/${CLIENT}/address`, 'pending'),
    ]);
    expect(counts).toEqual({ pending: 3, sent: 1, dead: 1, sheets_pending: 2, photos_pending: 0 });
  });

  it('counts photo creates only when unsent and not dead', () => {
    const photo = { kind: 'create' as const, value: { kind: 'photo' } };
    expect(syncCounts([row(`file/${FILE_1}`, 'pending', photo)]).photos_pending).toBe(1);
    expect(syncCounts([row(`file/${FILE_1}`, 'acked', photo)]).photos_pending).toBe(0);
    expect(syncCounts([row(`file/${FILE_1}`, 'dead', photo)]).photos_pending).toBe(0);
    expect(syncCounts([row(`file/${FILE_1}`, 'pending', { kind: 'create', value: { kind: 'logo' } })]).photos_pending).toBe(0);
    expect(syncCounts([row(`file/${FILE_1}/caption`, 'pending', { kind: 'put', value: 'x' })]).photos_pending).toBe(0);
  });

  it('ignores a path it cannot parse without throwing', () => {
    expect(syncCounts([row('nonsense/path', 'pending')])).toEqual({
      pending: 1,
      sent: 0,
      dead: 0,
      sheets_pending: 0,
      photos_pending: 0,
    });
  });
});

describe('syncBadgeState', () => {
  const base = { pending: 0, sent: 0, dead: 0, sheets_pending: 0, photos_pending: 0 };
  it('is ok with nothing pending and online', () => {
    expect(syncBadgeState(base, { online: true })).toBe('ok');
  });
  it('is pending with pending or sent rows', () => {
    expect(syncBadgeState({ ...base, pending: 2 }, { online: true })).toBe('pending');
    expect(syncBadgeState({ ...base, sent: 1 }, { online: true })).toBe('pending');
  });
  it('is offline when not online, even with pending rows', () => {
    expect(syncBadgeState({ ...base, pending: 2 }, { online: false })).toBe('offline');
  });
  it('is error when any op is dead, wherever the device is', () => {
    expect(syncBadgeState({ ...base, dead: 1, pending: 3 }, { online: false })).toBe('error');
  });
  it('is offline while online but the server is unreachable, pending or not', () => {
    expect(syncBadgeState(base, { online: true, reachable: false })).toBe('offline');
    expect(syncBadgeState({ ...base, pending: 2 }, { online: true, reachable: false })).toBe('offline');
  });
  it('keeps error ahead of an unreachable server', () => {
    expect(syncBadgeState({ ...base, dead: 1 }, { online: true, reachable: false })).toBe('error');
  });
  it('returns to ok or pending once the server answers again', () => {
    expect(syncBadgeState(base, { online: true, reachable: true })).toBe('ok');
    expect(syncBadgeState({ ...base, pending: 1 }, { online: true, reachable: true })).toBe('pending');
  });
});

describe('pendingSummaryText and syncBadgeLabel', () => {
  const base = { pending: 0, sent: 0, dead: 0, sheets_pending: 0, photos_pending: 0 };
  it('names sheets and photos, or plain changes, or nothing', () => {
    expect(pendingSummaryText({ ...base, pending: 3, sheets_pending: 3 })).toBe('3 fichas');
    expect(pendingSummaryText({ ...base, pending: 3, sheets_pending: 1, photos_pending: 2 })).toBe('1 ficha e 2 fotos');
    expect(pendingSummaryText({ ...base, pending: 5 })).toBe('5 alterações');
    expect(pendingSummaryText({ ...base, sent: 1 })).toBe('1 alteração');
    expect(pendingSummaryText(base)).toBe('');
    expect(pendingSummaryCount({ ...base, pending: 3, sheets_pending: 1, photos_pending: 2 })).toBe(3);
    expect(pendingSummaryCount({ ...base, pending: 5 })).toBe(5);
  });

  it('gives the badge words of the mock', () => {
    expect(syncBadgeLabel('ok', base)).toBe('Sincronizado');
    expect(syncBadgeLabel('pending', { ...base, pending: 4, sent: 1 })).toBe('5 pendentes');
    expect(syncBadgeLabel('pending', { ...base, pending: 1 })).toBe('1 pendente');
    expect(syncBadgeLabel('offline', base)).toBe('Sem conexão');
    expect(syncBadgeLabel('error', base)).toBe('Erro');
    expect(syncBadgeLabel('conflict', base)).toBe('Conflito');
  });

  it('gives the narrow-viewport words of MOCK-GUIDE.md', () => {
    expect(syncBadgeShortLabel('ok', base)).toBe('OK');
    expect(syncBadgeShortLabel('pending', { ...base, pending: 3, sheets_pending: 3 })).toBe('3');
    expect(syncBadgeShortLabel('offline', base)).toBe('Off');
    expect(syncBadgeShortLabel('error', base)).toBe('Erro');
    expect(syncBadgeShortLabel('conflict', base)).toBe('Confl.');
  });

  it('the short and long pending words count the same queue', () => {
    // Five unsent ops touching one sheet: the summary count is 1, the badge's is 5.
    const counts = { ...base, pending: 4, sent: 1, sheets_pending: 1 };
    expect(syncBadgeLabel('pending', counts)).toBe('5 pendentes');
    expect(syncBadgeShortLabel('pending', counts)).toBe('5');
    expect(pendingSummaryCount(counts)).toBe(1);
  });
});
