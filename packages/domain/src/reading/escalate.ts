import type { SuggestionRow } from '../schemas/entities.ts';

/*
 * Story 11.6 (Matheus, 2026-10-05): the low-confidence retry of a plate reading. A plate whose
 * suggestions are more than half `verify` (the server's own trust, `assessReadingValue`, never
 * the model's confidence), or that has no suggestion at all, is read once more on the
 * escalation model, and the better of the two readings is kept: the one with more `suggested`
 * values (review pass 1: counting `verify` alone let an escalation with fewer values win).
 * Panel, caption and NC draft readings never escalate. Decided here, once, so the job never
 * derives it itself.
 *
 * Independent review 2026-10-06 (Matheus): an OCR read with no word is never escalated, since
 * a second model has nothing to cite and its uncited values are dropped; the rule lives here
 * with the rest (AD-1). A tie goes the way a model cascade usually does, to the stronger
 * model: the escalation is only called when the first reading failed its quality gate, so
 * on equal `suggested` counts the reading with more rows wins (nothing a person could review
 * is lost), and on equal rows the escalation's.
 */

type Trusted = Pick<SuggestionRow, 'trust'>;

function countOf(suggestions: readonly Trusted[], trust: SuggestionRow['trust']): number {
  return suggestions.filter((suggestion) => suggestion.trust === trust).length;
}

/**
 * True when a reading has no suggestion, or more than half of its suggestions are `verify`,
 * and the OCR found at least one word for a second model to cite.
 */
export function shouldEscalate(suggestions: readonly Trusted[], ocrWords: number): boolean {
  if (ocrWords === 0) return false;
  return suggestions.length === 0 || countOf(suggestions, 'verify') * 2 > suggestions.length;
}

/**
 * The reading to keep of a first one (`a`) and its escalation (`b`): more `suggested` wins,
 * then more rows, then `b`, the stronger model.
 */
export function betterReading<T extends readonly Trusted[]>(a: T, b: T): T {
  const suggestedA = countOf(a, 'suggested');
  const suggestedB = countOf(b, 'suggested');
  if (suggestedA !== suggestedB) return suggestedB > suggestedA ? b : a;
  if (a.length !== b.length) return b.length > a.length ? b : a;
  return b;
}
