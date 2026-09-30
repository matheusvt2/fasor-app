import { calendarDateOfInstant, uuidV7Instant } from '../format/datetime.ts';
import type { PointRow } from '../schemas/entities.ts';
import { plural } from '../text/plural.ts';
import { livePoints } from './checks.ts';

/*
 * Story 11.9 (FR-50, UX-DR55, NR-10 10.7.11): a point's priority suggests its deadline.
 * Every rule of the Priority picker and the Prazo field lives here once (AD-1, AD-13): the
 * labels, hints and accessible names, the suggested date, whether a stored deadline is the
 * suggestion or a typed date, and which puts a pick, a clear or "Substituir" writes.
 *
 * Deadline table: P0 the point's creation date, P1 +30, P2 +90, P3 +180 calendar days, P4
 * the relatório's `next_intervention_date` verbatim (it may be `YYYY-MM`), null without it.
 * Never an annual interval (source-deltas row 29 wins over EXPERIENCE.md:130). A point has
 * no `created_at` column: its creation date is the America/Sao_Paulo calendar date of its
 * UUIDv7 id; an id that is not v7 has no known creation date, so P0..P3 suggest nothing.
 */

export type PointPriority = NonNullable<PointRow['priority']>;

export const POINT_PRIORITIES: readonly PointPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4'];

const PRIORITY_WORDS: Readonly<Record<PointPriority, string>> = {
  P0: 'Imediata',
  P1: 'Curto prazo',
  P2: 'Médio prazo',
  P3: 'Longo prazo',
  P4: 'Próxima manutenção',
};

const PRIORITY_HINTS: Readonly<Record<PointPriority, string>> = {
  P0: 'hoje',
  P1: '30 dias',
  P2: '90 dias',
  P3: '180 dias',
  // authored: the mock's "365 dias" is overridden (source-deltas row 29); the P4 date is the
  // relatório's next intervention (open for Matheus/Bruno).
  P4: 'próxima intervenção',
};

/** Calendar days from the creation date, P0 to P3. */
const PRIORITY_DAYS: Readonly<Record<Exclude<PointPriority, 'P4'>, number>> = { P0: 0, P1: 30, P2: 90, P3: 180 };

/** The pill text: "P1 · Curto prazo" (`72-pontos.html` `.priority-pill`). */
export function priorityLabel(priority: PointPriority): string {
  return `${priority} · ${PRIORITY_WORDS[priority]}`;
}

/** The picker row's hint at the right: "hoje", "30 dias", …, "próxima intervenção". */
export function priorityHint(priority: PointPriority): string {
  return PRIORITY_HINTS[priority];
}

/** The picker row's accessible name: "P1, Curto prazo, 30 dias" (EXPERIENCE.md › Priority picker). */
export function priorityAccessibleName(priority: PointPriority): string {
  return `${priority}, ${PRIORITY_WORDS[priority]}, ${PRIORITY_HINTS[priority]}`;
}

/** The pill's `data-p` tone: "0" to "4". */
export function priorityTone(priority: PointPriority): string {
  return priority.slice(1);
}

/** The America/Sao_Paulo calendar date (`YYYY-MM-DD`) a point was created on, read from its UUIDv7 id; null for any other id. */
export function pointCreatedDate(pointId: string): string | null {
  const instant = uuidV7Instant(pointId);
  return instant === null ? null : calendarDateOfInstant(new Date(instant));
}

/** `YYYY-MM-DD` plus `days` calendar days, in UTC arithmetic so no host time zone moves a day; null for a malformed date. */
export function addCalendarDays(date: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return new Date(time).toISOString().slice(0, 10);
}

/** The deadline a priority suggests; null without a priority, for P0..P3 without a creation date, and for P4 without a next intervention. */
export function deadlineFromPriority(priority: PointPriority | null, createdDate: string | null, nextIntervention: string | null): string | null {
  if (priority === null) return null;
  if (priority === 'P4') return nextIntervention;
  if (createdDate === null) return null;
  return addCalendarDays(createdDate, PRIORITY_DAYS[priority]);
}

type PointDeadlineFields = Pick<PointRow, 'id' | 'priority' | 'deadline'>;

export interface DeadlineState {
  /** What the current priority suggests (null: nothing). */
  suggestion: string | null;
  /** The stored deadline is empty or equals the suggestion: a pick may replace it. Otherwise it was typed and a pick keeps it. */
  suggested: boolean;
  /** A typed deadline beside a different, non-null suggestion: the date "Substituir" writes; null otherwise. */
  replace: string | null;
}

/** How the Prazo field reads a point's stored deadline against its priority's suggestion. */
export function deadlineState(point: PointDeadlineFields, nextIntervention: string | null): DeadlineState {
  const suggestion = deadlineFromPriority(point.priority, pointCreatedDate(point.id), nextIntervention);
  const suggested = point.deadline === null || point.deadline === suggestion;
  return { suggestion, suggested, replace: !suggested && suggestion !== null ? suggestion : null };
}

/** The point fields a pick, a clear or "Substituir" puts; a key is present only when its value changes. */
export interface PointPriorityWrites {
  priority?: PointPriority | null;
  deadline?: string | null;
}

/**
 * A pick (`next` a priority) or a clear (`next` null): the priority put, plus the deadline
 * put to the new suggestion when the stored deadline is suggested (the new suggestion may be
 * null, which clears a stale suggested date). A typed date is never overwritten. Empty when
 * nothing changes (a tap on the checked row).
 */
export function priorityPickWrites(point: PointDeadlineFields, next: PointPriority | null, nextIntervention: string | null): PointPriorityWrites {
  const writes: PointPriorityWrites = {};
  if (next !== point.priority) writes.priority = next;
  if (deadlineState(point, nextIntervention).suggested) {
    const deadline = deadlineFromPriority(next, pointCreatedDate(point.id), nextIntervention);
    if (deadline !== point.deadline) writes.deadline = deadline;
  }
  return writes;
}

/** "Substituir": the deadline put to the current suggestion over a typed date; null when there is nothing to replace. */
export function replaceDeadlineWrite(point: PointDeadlineFields, nextIntervention: string | null): PointPriorityWrites | null {
  const { replace } = deadlineState(point, nextIntervention);
  return replace === null ? null : { deadline: replace };
}

/** The live points with no deadline (section 8's "pontos sem prazo", information only). */
export function pointsSemPrazo(points: readonly PointRow[]): PointRow[] {
  return livePoints(points).filter((point) => point.deadline === null);
}

/** "1 ponto sem prazo" / "2 pontos sem prazo". */
export function pointsSemPrazoText(n: number): string {
  return `${plural(n, 'ponto', 'pontos')} sem prazo`;
}
