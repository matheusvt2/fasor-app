import type { AuditRef } from './input.ts';
import { AUDIT_FINDING_KINDS, type AuditFinding, type AuditFindingKind } from './schema.ts';

/*
 * Story 13.8 (AI-3): what the server keeps of the model's answer. A finding stays only when
 * its kind is one of the four, its ref one of those it was sent and its text one sentence of
 * reasonable length; it then carries the kernel's label and target of that ref, so a finding
 * can never point at something the relatório lacks. Everything else is dropped and counted.
 */

/** The longest finding sentence kept, in characters. */
export const AUDIT_FINDING_MAX_CHARS = 400;

/** The most findings one run keeps; the rest are dropped (`over_limit`). */
export const AUDIT_MAX_FINDINGS = 20;

export type AuditDropReason = 'not_a_list' | 'not_an_object' | 'unknown_kind' | 'unknown_ref' | 'empty_text' | 'text_too_long' | 'over_limit';

export interface AuditValidation {
  kept: AuditFinding[];
  dropped: { index: number; reason: AuditDropReason }[];
}

const isKind = (value: unknown): value is AuditFindingKind => typeof value === 'string' && (AUDIT_FINDING_KINDS as readonly string[]).includes(value);

/** The model's findings (`[{kind, ref, text}]`) checked against the refs it was sent. */
export function validateAuditFindings(raw: unknown, refs: readonly AuditRef[]): AuditValidation {
  if (!Array.isArray(raw)) return { kept: [], dropped: [{ index: -1, reason: 'not_a_list' }] };
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  const kept: AuditFinding[] = [];
  const dropped: AuditValidation['dropped'] = [];
  raw.forEach((item: unknown, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return dropped.push({ index, reason: 'not_an_object' });
    const { kind, ref, text } = item as { kind?: unknown; ref?: unknown; text?: unknown };
    if (!isKind(kind)) return dropped.push({ index, reason: 'unknown_kind' });
    const resolved = typeof ref === 'string' ? byId.get(ref.trim()) : undefined;
    if (resolved === undefined) return dropped.push({ index, reason: 'unknown_ref' });
    const sentence = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
    if (sentence === '') return dropped.push({ index, reason: 'empty_text' });
    if ([...sentence].length > AUDIT_FINDING_MAX_CHARS) return dropped.push({ index, reason: 'text_too_long' });
    if (kept.length >= AUDIT_MAX_FINDINGS) return dropped.push({ index, reason: 'over_limit' });
    kept.push({ kind, text: sentence, ref: resolved.id, label: resolved.label, target: resolved.target });
    return undefined;
  });
  return { kept, dropped };
}
