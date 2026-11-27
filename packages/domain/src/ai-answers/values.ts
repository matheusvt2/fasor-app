import { safeParsePath } from '../ops/path.ts';

/*
 * Story 32.1: how an answer's value is compared with what the user left, and which key a field read
 * is filed under. One place, so the settle rule (`settle.ts`) and the report (`rubric.ts`) read a
 * value the same way.
 */

/** JSON with its object keys sorted, so two equal values serialize to the same text. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Whether two values are the same answer: equal JSON, whatever the key order. */
export function sameAnswerValue(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * The text of a prose value: the string itself, an object's `text` (the Não ensaiado note, the
 * parecer, a section's config), the empty string for nothing, else its JSON.
 */
export function answerText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const text = (value as { text?: unknown }).text;
    if (typeof text === 'string') return text;
    const sectionText = (value as { section_text?: unknown }).section_text;
    if (typeof sectionText === 'string') return sectionText;
  }
  return canonicalJson(value);
}

/** Whether two prose values carry the same text, outer spaces aside. */
export function sameAnswerText(a: unknown, b: unknown): boolean {
  return answerText(a).trim() === answerText(b).trim();
}

/**
 * The key a field read is filed under, from the path it lands on: a nameplate field's key, a table
 * cell as `test:row:col`, a value's key, a checklist item, a file or point field; null otherwise.
 */
export function answerItemKey(path: string | null): string | null {
  if (path === null) return null;
  const parsed = safeParsePath(path);
  if (parsed === null) return null;
  switch (parsed.family) {
    case 'sheet/nameplate':
      return parsed.field_key;
    case 'sheet/test/cell':
      return `${parsed.test_key}:${parsed.row}:${parsed.col}`;
    case 'sheet/test/row/cell':
      return `${parsed.test_key}:${parsed.row_id}:${parsed.col}`;
    case 'sheet/test/value':
      return `${parsed.test_key}:${parsed.value_key}`;
    case 'sheet/checklist':
      return `${parsed.item_key}:${parsed.field}`;
    case 'location/env':
    case 'location/se':
    case 'location/field':
    case 'file/field':
    case 'point/field':
      return parsed.field;
    default:
      return null;
  }
}

/** Whether an actor is the server's own (`system:reading`, `system:transcription`, ...), not a user. */
export function isSystemActor(actorId: string): boolean {
  return actorId.startsWith('system:');
}
