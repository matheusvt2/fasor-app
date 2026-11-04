import { TEXT_CAPS } from '../src/ops/value-limits.ts';

/*
 * e20f (2026-11-04): a seed-defined cell value of exactly `items` short strings that serializes to
 * exactly `bytes` bytes, for the boundary tests of `VALUE_MAX_ITEMS` and `VALUE_MAX_BYTES` (kernel,
 * api and e2e). Each string mixes two-byte 'é' and one-byte 'x' so it stays within the short text
 * cap while the value reaches the byte cap.
 */
export function shortStringsOfBytes(items: number, bytes: number): string[] {
  // `[` and `]`, a comma between items, and the two quotes of each.
  const content = bytes - 2 - (items - 1) - 2 * items;
  const base = Math.floor(content / items);
  const extra = content % items;
  const out: string[] = [];
  for (let i = 0; i < items; i++) {
    const target = base + (i < extra ? 1 : 0);
    const text = 'é'.repeat(Math.floor(target / 2)) + 'x'.repeat(target % 2);
    if (text.length > TEXT_CAPS.short) throw new Error(`an item of ${target} bytes is over the short cap`);
    out.push(text);
  }
  return out;
}
