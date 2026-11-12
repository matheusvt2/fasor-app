import { describe, expect, it } from 'vitest';
import { syncAnnouncementText, syncBadgeLabel, syncBadgeShortLabel, syncBadgeState, syncCounts, syncStatusWord, type OutboxLike } from './counts.ts';
import { lateOpCount, SYNC_LATE_AFTER_MS, syncLateAt, syncLateText } from './late.ts';

const T0 = Date.parse('2026-11-11T12:00:00.000Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();

describe('25.3-UNIT the one-minute rule', () => {
  it('an op is late strictly after 60 000 ms: 60 000 is not, 60 001 is', () => {
    expect(SYNC_LATE_AFTER_MS).toBe(60_000);
    expect(lateOpCount([at(0)], T0 + 60_000)).toBe(0);
    expect(lateOpCount([at(0)], T0 + 60_001)).toBe(1);
    expect(lateOpCount([at(0), at(5_000), at(30_000)], T0 + 65_002)).toBe(2);
    expect(lateOpCount([], T0)).toBe(0);
    // A client_ts that cannot be read is never late.
    expect(lateOpCount(['not a date'], T0 + 10 * 60_000)).toBe(0);
  });

  it('syncLateAt is the first instant the count grows, null when nothing is left to turn late', () => {
    expect(syncLateAt([at(0), at(10_000)], T0)).toBe(T0 + 60_001);
    expect(lateOpCount([at(0), at(10_000)], T0 + 60_001)).toBe(1);
    // The first one is late already: the next is the second's.
    expect(syncLateAt([at(0), at(10_000)], T0 + 60_001)).toBe(T0 + 70_001);
    expect(syncLateAt([at(0)], T0 + 60_001)).toBeNull();
    expect(syncLateAt([], T0)).toBeNull();
  });

  it('the wait counts from when the device became able to send: an op 10 min old, online for 30 s, is not late; 60 000 ms is not, 60 001 ms is', () => {
    const tenMinutesOld = [at(-10 * 60_000)];
    expect(lateOpCount(tenMinutesOld, T0, T0 - 30_000)).toBe(0);
    expect(lateOpCount(tenMinutesOld, T0, T0 - 60_000)).toBe(0);
    expect(lateOpCount(tenMinutesOld, T0, T0 - 60_001)).toBe(1);
    // An op committed after the device came online counts from its own client_ts.
    expect(lateOpCount([at(0)], T0 + 60_001, T0 - 5_000)).toBe(1);
    // The next instant follows the same start.
    expect(syncLateAt(tenMinutesOld, T0, T0 - 30_000)).toBe(T0 + 30_001);
  });

  it('the line: the frame\'s plural, the authored singular', () => {
    expect(syncLateText(3)).toBe('O aparelho está com conexão, mas 3 alterações aguardam envio há mais de 1 minuto.');
    expect(syncLateText(1)).toBe('O aparelho está com conexão, mas 1 alteração aguarda envio há mais de 1 minuto.');
  });
});

describe('25.3-UNIT the late badge state and its precedence', () => {
  const base = { pending: 0, sent: 0, dead: 0 };
  const waiting = { ...base, pending: 2 };

  it('late only with an op waiting, online, reachable and not paused', () => {
    expect(syncBadgeState(waiting, { online: true, late: 1 })).toBe('late');
    expect(syncBadgeState({ ...base, sent: 1 }, { online: true, reachable: true, late: 1 })).toBe('late');
    expect(syncBadgeState(waiting, { online: true, late: 0 })).toBe('pending');
    expect(syncBadgeState(waiting, { online: true })).toBe('pending');
    // Nothing waits: a stale late count never reads late.
    expect(syncBadgeState(base, { online: true, late: 1 })).toBe('ok');
  });

  it('the state that explains the wait wins: conflict, error, offline, retrying, a session to renew, paused', () => {
    expect(syncBadgeState(waiting, { online: true, late: 1, conflicts: 1 })).toBe('conflict');
    expect(syncBadgeState({ ...waiting, dead: 1 }, { online: true, late: 1 })).toBe('error');
    expect(syncBadgeState(waiting, { online: false, late: 1 })).toBe('offline');
    expect(syncBadgeState(waiting, { online: true, reachable: false, late: 1 })).toBe('offline');
    expect(syncBadgeState(waiting, { online: true, reachable: false, serverAnswers: true, late: 1 })).toBe('retrying');
    expect(syncBadgeState(waiting, { online: true, paused: true, late: 1 })).toBe('pending');
  });

  it('the words: "Envio atrasado", "Atraso" on the phone, "Sincronizando…" while a cycle runs', () => {
    const counts = syncCounts([{ path: 'relatorio/r/status', status: 'pending' } as OutboxLike]);
    expect(syncBadgeLabel('late', counts)).toBe('Envio atrasado');
    expect(syncBadgeShortLabel('late', counts)).toBe('Atraso');
    expect(syncAnnouncementText('late')).toBe('Envio atrasado');
    expect(syncStatusWord('late', counts, false)).toBe('Envio atrasado');
    expect(syncStatusWord('late', counts, true)).toBe('Sincronizando…');
  });
});
