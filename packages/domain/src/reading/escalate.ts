import type { SuggestionRow } from '../schemas/entities.ts';

/*
 * Story 11.6 (Matheus, 2026-10-05): the low-confidence retry of a plate reading. A plate whose
 * suggestions are more than half `verify` (the server's own trust, `assessReadingValue`, never
 * the model's confidence), or that has no suggestion at all, is read once more on the
 * escalation model, and the better of the two readings is kept: the one with more `suggested`
 * values, the first on a tie (review pass 1: counting `verify` alone let an escalation with
 * fewer values win). Panel, caption and NC draft readings never escalate. Decided here, once,
 * so the job never derives it itself.
 */

type Trusted = Pick<SuggestionRow, 'trust'>;

function countOf(suggestions: readonly Trusted[], trust: SuggestionRow['trust']): number {
  return suggestions.filter((suggestion) => suggestion.trust === trust).length;
}

/** True when a reading has no suggestion, or more than half of its suggestions are `verify`. */
export function shouldEscalate(suggestions: readonly Trusted[]): boolean {
  return suggestions.length === 0 || countOf(suggestions, 'verify') * 2 > suggestions.length;
}

/** The reading to keep of a first one and its escalation: more `suggested` wins, a tie keeps `a`. */
export function betterReading<T extends readonly Trusted[]>(a: T, b: T): T {
  return countOf(b, 'suggested') > countOf(a, 'suggested') ? b : a;
}
