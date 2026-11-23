import { calendarDateOfInstant, uuidV7Instant } from '../format/datetime.ts';
import type { PointRow } from '../schemas/entities.ts';
import { seedRule } from '../seed/definitions.ts';
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

// --- Story 28.5 (seed v18, B-8): the starting priority and the deadline from the issue date ---------------

/**
 * Story 28.5 (seed v18 `point_start_priority`, B-8): the priority a point tapped from each origin starts with; a manual
 * point starts with none. Every field stays editable: the start is a pick the editor holds until the point is stored.
 */
const START_PRIORITY: Readonly<Record<PointRow['origin'], PointPriority | null>> = {
  reading: 'P1',
  restricao: 'P4',
  nc: 'P2',
  not_tested: 'P4',
  reprovado: 'P1',
  manual: null,
};

/** The priority a new point of `origin` starts with on a seed whose `point_start_priority` is on; null otherwise (v17 and older start unset). */
export function pointStartPriority(seedVersion: string, origin: PointRow['origin']): PointPriority | null {
  return seedRule(seedVersion, 'point_start_priority') ? START_PRIORITY[origin] : null;
}

/**
 * The priority and the deadline it suggests that a new point starts with, as a pick of that priority would write them
 * (`priorityPickWrites` on the empty row): `{}` when it starts unset.
 */
export function pointStartWrites(seedVersion: string, origin: PointRow['origin'], pointId: string, nextIntervention: string | null): PointPriorityWrites {
  const priority = pointStartPriority(seedVersion, origin);
  return priority === null ? {} : priorityPickWrites({ id: pointId, priority: null, deadline: null }, priority, nextIntervention);
}

/** Why a point starts at its priority, by origin: the frame's "leitura fora do critério" and the batch's other four. */
const START_REASONS: Readonly<Record<Exclude<PointRow['origin'], 'manual'>, string>> = {
  // `60-ficha.html` `#ficha-dlg-ponto-v18`, verbatim.
  reading: 'leitura fora do critério',
  // authored (Story 28.5, listed for Bruno): the reasons of the other four origins.
  restricao: 'leitura com restrição',
  nc: 'item não conforme',
  not_tested: 'equipamento não ensaiado',
  reprovado: 'ficha reprovada',
};

/** "Começa em P1: leitura fora do critério. Troque se precisar." (the frame's line under the picker); null when the point starts unset. */
export function pointStartLine(seedVersion: string, origin: PointRow['origin']): string | null {
  const priority = pointStartPriority(seedVersion, origin);
  if (priority === null || origin === 'manual') return null;
  return `Começa em ${priority}: ${START_REASONS[origin]}. Troque se precisar.`;
}

/** Story 28.5 (seed v18 `deadline_from_issue`, Matheus's Q-6): the Prazo of a suggested deadline before the issue, by priority (the frame's words). */
const PRIORITY_TERMS: Readonly<Record<PointPriority, string>> = {
  P0: 'Na data da emissão',
  P1: '30 dias após a emissão',
  P2: '90 dias após a emissão',
  P3: '180 dias após a emissão',
  P4: 'Na próxima manutenção',
};

/** Whether a relatório of `seedVersion` counts a suggested deadline from its issue date (`deadline_from_issue`). */
export function deadlineCountsFromIssue(seedVersion: string): boolean {
  return seedRule(seedVersion, 'deadline_from_issue');
}

/** The stored deadline is its priority's suggestion (a pick wrote it, nothing typed over it): what counts from the issue date on v18. */
function suggestedDeadline(point: PointDeadlineFields, nextIntervention: string | null): boolean {
  if (point.priority === null || point.deadline === null) return false;
  return point.deadline === deadlineFromPriority(point.priority, pointCreatedDate(point.id), nextIntervention);
}

/**
 * The term a v18 Prazo reads before the issue ("30 dias após a emissão"): set while the stored deadline is its priority's
 * suggestion on a seed whose `deadline_from_issue` is on; null for a typed date, an unset priority or an older seed.
 */
export function deadlineTerm(point: PointDeadlineFields, seedVersion: string, nextIntervention: string | null): string | null {
  if (!deadlineCountsFromIssue(seedVersion) || !suggestedDeadline(point, nextIntervention)) return null;
  return PRIORITY_TERMS[point.priority!];
}

/**
 * The deadline section 8 prints (`YYYY-MM-DD`, or `YYYY-MM` for a P4 month): on a seed whose `deadline_from_issue` is on, a
 * suggested deadline counts from `issueDate` (the São Paulo calendar date of the issue): P0 the issue date, P1 to P3 its
 * days after it, P4 the next intervention as before. A typed date, and every deadline of an older seed, prints as stored.
 */
export function printedDeadline(point: PointDeadlineFields, seedVersion: string, nextIntervention: string | null, issueDate: string): string | null {
  if (deadlineTerm(point, seedVersion, nextIntervention) === null) return point.deadline;
  const priority = point.priority!;
  if (priority === 'P4') return point.deadline;
  return addCalendarDays(issueDate, PRIORITY_DAYS[priority]) ?? point.deadline;
}

/** The live points with no deadline (section 8's "pontos sem prazo", information only). */
export function pointsSemPrazo(points: readonly PointRow[]): PointRow[] {
  return livePoints(points).filter((point) => point.deadline === null);
}

/** "1 ponto sem prazo" / "2 pontos sem prazo". */
export function pointsSemPrazoText(n: number): string {
  return `${plural(n, 'ponto', 'pontos')} sem prazo`;
}
