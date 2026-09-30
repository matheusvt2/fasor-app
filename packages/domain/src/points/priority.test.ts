import { describe, expect, it } from 'vitest';
import type { PointRow } from '../schemas/entities.ts';
import {
  addCalendarDays,
  deadlineFromPriority,
  deadlineState,
  POINT_PRIORITIES,
  pointCreatedDate,
  pointsSemPrazo,
  pointsSemPrazoText,
  priorityAccessibleName,
  priorityHint,
  priorityLabel,
  priorityPickWrites,
  priorityTone,
  replaceDeadlineWrite,
} from './priority.ts';

/** A UUIDv7 minted at `iso` (its first 48 bits are the Unix milliseconds). */
function v7At(iso: string, tail = '000000000001'): string {
  const hex = Date.parse(iso).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${tail}`;
}

/** Created on 2026-09-08 in America/Sao_Paulo (15:00 UTC is 12:00 there). */
const SEP_08 = v7At('2026-09-08T15:00:00Z');

function point(fields: Partial<PointRow> = {}): PointRow {
  return {
    id: SEP_08,
    relatorio_id: v7At('2026-09-01T00:00:00Z'),
    text: 'Texto',
    equipment_id: null,
    origin: 'manual',
    order_key: 'a0',
    removed_at: null,
    action: null,
    priority: null,
    deadline: null,
    owner: null,
    ...fields,
  };
}

describe('priority labels (Story 11.9)', () => {
  it('names the five priorities: pill text, hint and accessible name', () => {
    expect(POINT_PRIORITIES.map(priorityLabel)).toEqual(['P0 · Imediata', 'P1 · Curto prazo', 'P2 · Médio prazo', 'P3 · Longo prazo', 'P4 · Próxima manutenção']);
    expect(POINT_PRIORITIES.map(priorityHint)).toEqual(['hoje', '30 dias', '90 dias', '180 dias', 'próxima intervenção']);
    expect(priorityAccessibleName('P0')).toBe('P0, Imediata, hoje');
    expect(priorityAccessibleName('P1')).toBe('P1, Curto prazo, 30 dias');
    expect(priorityAccessibleName('P3')).toBe('P3, Longo prazo, 180 dias');
    expect(priorityAccessibleName('P4')).toBe('P4, Próxima manutenção, próxima intervenção');
    expect(POINT_PRIORITIES.map(priorityTone)).toEqual(['0', '1', '2', '3', '4']);
  });
});

describe('pointCreatedDate', () => {
  it('reads the America/Sao_Paulo date of a UUIDv7 id', () => {
    expect(pointCreatedDate(SEP_08)).toBe('2026-09-08');
    // 02:00 UTC on the 9th is still the 8th in Sao Paulo (UTC-3).
    expect(pointCreatedDate(v7At('2026-09-09T02:00:00Z'))).toBe('2026-09-08');
  });

  it('is null for an id that is not UUIDv7', () => {
    expect(pointCreatedDate('00000000-0000-4000-8000-000000000001')).toBeNull();
    expect(pointCreatedDate('not-an-id')).toBeNull();
  });
});

describe('deadlineFromPriority (FR-50)', () => {
  it('adds calendar days for P0..P3', () => {
    expect(deadlineFromPriority('P0', '2026-09-08', null)).toBe('2026-09-08');
    expect(deadlineFromPriority('P1', '2026-09-08', null)).toBe('2026-10-08');
    expect(deadlineFromPriority('P2', '2026-09-08', null)).toBe('2026-12-07');
    expect(deadlineFromPriority('P3', '2026-09-08', null)).toBe('2027-03-07');
  });

  it('crosses a month end and a leap day by calendar-day addition', () => {
    expect(deadlineFromPriority('P1', '2026-01-31', null)).toBe('2026-03-02');
    expect(deadlineFromPriority('P1', '2028-02-01', null)).toBe('2028-03-02');
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addCalendarDays('2026-12', 1)).toBeNull();
  });

  it('takes P4 from the next intervention verbatim, never a year, null without it', () => {
    expect(deadlineFromPriority('P4', '2026-09-08', '2027-09')).toBe('2027-09');
    expect(deadlineFromPriority('P4', '2026-09-08', '2027-09-08')).toBe('2027-09-08');
    expect(deadlineFromPriority('P4', '2026-09-08', null)).toBeNull();
    expect(deadlineFromPriority('P4', null, '2027-09')).toBe('2027-09');
  });

  it('suggests nothing without a priority or, for P0..P3, without a creation date', () => {
    expect(deadlineFromPriority(null, '2026-09-08', '2027-09')).toBeNull();
    expect(deadlineFromPriority('P1', null, '2027-09')).toBeNull();
  });
});

describe('deadlineState', () => {
  it('reads an empty deadline as suggested', () => {
    expect(deadlineState(point(), null)).toEqual({ suggestion: null, suggested: true, replace: null });
    expect(deadlineState(point({ priority: 'P1' }), null)).toEqual({ suggestion: '2026-10-08', suggested: true, replace: null });
  });

  it('reads the priority suggestion as suggested', () => {
    expect(deadlineState(point({ priority: 'P1', deadline: '2026-10-08' }), null)).toEqual({ suggestion: '2026-10-08', suggested: true, replace: null });
  });

  it('reads any other date as typed, with the differing suggestion to replace it', () => {
    expect(deadlineState(point({ priority: 'P3', deadline: '2026-11-30' }), null)).toEqual({ suggestion: '2027-03-07', suggested: false, replace: '2027-03-07' });
    // A typed date with no priority, or a null suggestion: nothing to replace it with.
    expect(deadlineState(point({ deadline: '2026-11-30' }), null)).toEqual({ suggestion: null, suggested: false, replace: null });
    expect(deadlineState(point({ priority: 'P4', deadline: '2026-11-30' }), null)).toEqual({ suggestion: null, suggested: false, replace: null });
  });

  it('knows no creation date for a non-v7 id: P0..P3 suggest nothing, without throwing', () => {
    const legacy = point({ id: '00000000-0000-4000-8000-000000000001', priority: 'P1', deadline: null });
    expect(deadlineState(legacy, null)).toEqual({ suggestion: null, suggested: true, replace: null });
    expect(priorityPickWrites(legacy, 'P2', null)).toEqual({ priority: 'P2' });
  });
});

describe('priorityPickWrites', () => {
  it('a pick on an empty point writes the priority and its suggestion', () => {
    expect(priorityPickWrites(point(), 'P1', '2027-09')).toEqual({ priority: 'P1', deadline: '2026-10-08' });
  });

  it('a re-pick moves a suggested deadline to the new suggestion', () => {
    expect(priorityPickWrites(point({ priority: 'P1', deadline: '2026-10-08' }), 'P2', null)).toEqual({ priority: 'P2', deadline: '2026-12-07' });
  });

  it('a pick never overwrites a typed date', () => {
    expect(priorityPickWrites(point({ priority: 'P1', deadline: '2026-11-30' }), 'P3', null)).toEqual({ priority: 'P3' });
  });

  it('P4 writes the next intervention, or clears a stale suggested date without one', () => {
    expect(priorityPickWrites(point({ priority: 'P1', deadline: '2026-10-08' }), 'P4', '2027-09')).toEqual({ priority: 'P4', deadline: '2027-09' });
    expect(priorityPickWrites(point({ priority: 'P1', deadline: '2026-10-08' }), 'P4', null)).toEqual({ priority: 'P4', deadline: null });
  });

  it('a clear empties the priority and a suggested deadline, never a typed one', () => {
    expect(priorityPickWrites(point({ priority: 'P1', deadline: '2026-10-08' }), null, null)).toEqual({ priority: null, deadline: null });
    expect(priorityPickWrites(point({ priority: 'P1', deadline: '2026-11-30' }), null, null)).toEqual({ priority: null });
  });

  it('a tap on the checked row writes nothing', () => {
    expect(priorityPickWrites(point({ priority: 'P1', deadline: '2026-10-08' }), 'P1', null)).toEqual({});
  });
});

describe('replaceDeadlineWrite', () => {
  it('writes the suggestion over a typed date', () => {
    expect(replaceDeadlineWrite(point({ priority: 'P3', deadline: '2026-11-30' }), null)).toEqual({ deadline: '2027-03-07' });
  });

  it('is null when the deadline is already suggested or nothing is suggested', () => {
    expect(replaceDeadlineWrite(point({ priority: 'P3', deadline: '2027-03-07' }), null)).toBeNull();
    expect(replaceDeadlineWrite(point({ priority: 'P4', deadline: '2026-11-30' }), null)).toBeNull();
  });
});

describe('pontos sem prazo', () => {
  it('counts the live points with no deadline', () => {
    const points = [
      point({ id: v7At('2026-09-08T15:00:00Z', '000000000001'), order_key: 'a0', deadline: '2026-10-08' }),
      point({ id: v7At('2026-09-08T15:00:00Z', '000000000002'), order_key: 'a1' }),
      point({ id: v7At('2026-09-08T15:00:00Z', '000000000003'), order_key: 'a2' }),
      point({ id: v7At('2026-09-08T15:00:00Z', '000000000004'), order_key: 'a3', removed_at: '2026-09-08T16:00:00Z' }),
    ];
    expect(pointsSemPrazo(points)).toHaveLength(2);
    expect(pointsSemPrazoText(1)).toBe('1 ponto sem prazo');
    expect(pointsSemPrazoText(2)).toBe('2 pontos sem prazo');
  });
});
