/*
 * A stable content hash for the "basis" of a composed text (Story 5.8's conclusion, Story
 * 7.4's parecer): the canonical JSON of the inputs the text was composed from, hashed with
 * 32-bit FNV-1a. Equal inputs always hash equal, on the device and on the server.
 */

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    // A prototype-less object, so a `__proto__` key is kept as data like any other.
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) {
      const member = (value as Record<string, unknown>)[key];
      if (member !== undefined) out[key] = canonical(member);
    }
    return out;
  }
  return value;
}

/**
 * Keys sorted at every level, `undefined` object members dropped and `undefined` array members
 * written `null` (K-7, as `JSON.stringify` does), so the same inputs always serialize the
 * same. The one canonical JSON of the kernel: `serializeSnapshot` is this function too (K-20).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

/** 32-bit FNV-1a over the UTF-16 code units, as 8 hex digits. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
