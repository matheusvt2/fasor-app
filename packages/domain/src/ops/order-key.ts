/*
 * Story 4.1: the fractional `order_key` every reorderable row carries (locations, blocks,
 * points). Keys are plain strings over the alphabet `0-9a-z` compared in plain string
 * order, so a row moves with one `{entity}/{id}/order_key` put and no sibling is rewritten
 * (AD-3: one op per change). The kernel decides the key; the surface only names the two
 * neighbours the row lands between.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Index of a digit in the alphabet; -1 stands for "the string ends here", which sorts below `0`. */
function digitAt(text: string, i: number): number {
  if (i >= text.length) return -1;
  const index = DIGITS.indexOf(text[i]!);
  if (index === -1) throw new RangeError(`order key "${text}" holds a character outside 0-9a-z`);
  return index;
}

/**
 * A key strictly between `a` and `b` in string order, with `b === null` meaning no upper
 * bound. `a` may be empty (no lower bound). Never returns a key ending in `0` when it can
 * avoid it, so a later insertion just above `a` always has room.
 */
function between(a: string, b: string | null): string {
  let prefix = 0;
  if (b !== null) {
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
    if (prefix === b.length) throw new RangeError(`no order key fits between "${a}" and "${b}"`);
  }
  const head = a.slice(0, prefix);
  const ia = digitAt(a, prefix);
  const ib = b === null ? DIGITS.length : digitAt(b, prefix);
  if (ib - ia >= 2) {
    const mid = Math.floor((ia + ib) / 2);
    // `0` right after the lower bound would leave nothing between them later.
    if (mid > 0 || ia >= 0) return head + DIGITS[mid]!;
    return `${head}0${between('', null)}`;
  }
  // Consecutive digits: go one place deeper on the lower side.
  if (ia >= 0) return head + DIGITS[ia]! + between(a.slice(prefix + 1), null);
  // `a` ends here and `b` continues with `0...`: only `0` + something below `b`'s rest fits.
  const rest = b!.slice(prefix + 1);
  if (rest === '') throw new RangeError(`no order key fits between "${a}" and "${b}"`);
  return `${head}0${between('', rest)}`;
}

/**
 * True when `text` is valid JSON on its own: an all-digit run (`4`, `2026`, `1e5`), `true`,
 * `false` or `null`. A key like that is never minted: a layer that parses a stored string
 * a second time (the api read path had one, Epic 4 review F-1) would hand it back as a
 * number, a boolean or null and the receiving `applyOp` would refuse the row.
 */
function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * A key strictly between two sibling keys (`null` at either end means no neighbour). A
 * `before` that is not below `after` is a caller's bug and throws `RangeError`. Never a key
 * that reads as JSON text (see `isJsonText`).
 */
export function orderKeyBetween(before: string | null, after: string | null): string {
  if (before === null && after === null) return initialOrderKey(0);
  if (before !== null && after !== null && before >= after) {
    throw new RangeError(`order key "${before}" is not below "${after}"`);
  }
  const key = between(before ?? '', after);
  // A longer key still sorts above `before`, and below `after` because `between` never
  // returns a prefix of `after` (it differs from `after` at the first free position).
  return isJsonText(key) ? `${key}m` : key;
}

/**
 * The key of the n-th sibling (0-based) of a freshly built list, the Porto Seguro fixture's
 * scheme: `a0`, `a1`, ... `a9`, `aa`, ... `az` for the first 36, then `b` plus two digits so
 * a longer list still sorts as it was built.
 */
export function initialOrderKey(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`sibling index ${n} is not a non-negative integer`);
  if (n < 36) return `a${n.toString(36)}`;
  if (n < 36 * 36) return `b${n.toString(36).padStart(2, '0')}`;
  return `c${n.toString(36).padStart(3, '0')}`;
}

/** Rows in `order_key` order, ties (two devices minting the same key) by id, so both sides agree. */
export function sortByOrderKey<T extends { id: string; order_key: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.order_key !== b.order_key) return a.order_key < b.order_key ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Where a move to `toIndex` (0-based) lands among `total` siblings: clamped to the ends,
 * fractions dropped. `orderKeyForMove` and every move announcement read this one rule.
 */
export function moveLandingIndex(total: number, toIndex: number): number {
  return Math.min(Math.max(0, total - 1), Math.max(0, Math.floor(toIndex)));
}

/**
 * The key a row takes when moved to `toIndex` (0-based) among `siblings`, which must be
 * sorted and include the row itself: between the neighbours it lands between once it has
 * left its current slot. `null` when the move lands the row where it already is.
 */
export function orderKeyForMove<T extends { id: string; order_key: string }>(siblings: readonly T[], id: string, toIndex: number): string | null {
  const from = siblings.findIndex((row) => row.id === id);
  if (from === -1) throw new RangeError(`row ${id} is not among its siblings`);
  const others = siblings.filter((row) => row.id !== id);
  const to = moveLandingIndex(siblings.length, toIndex);
  if (to === from) return null;
  const lower = others[to - 1]?.order_key ?? null;
  // Two siblings may hold one key (minted apart on two devices): the row then lands after
  // the whole run of equal keys, the nearest slot that exists.
  let upperIndex = to;
  while (lower !== null && upperIndex < others.length && others[upperIndex]!.order_key <= lower) upperIndex += 1;
  return orderKeyBetween(lower, others[upperIndex]?.order_key ?? null);
}

/**
 * The key a new row takes right under the sibling `id` among `siblings`, which must be
 * sorted: strictly above that row's key and below the first later sibling whose key is
 * greater (no upper bound when none). Two siblings may hold one key (minted apart on two
 * devices): the new row then lands after the whole run of equal keys, the nearest slot that
 * exists, instead of asking for a key between two equal ones.
 */
export function orderKeyAfter<T extends { id: string; order_key: string }>(siblings: readonly T[], id: string): string {
  const at = siblings.findIndex((row) => row.id === id);
  if (at === -1) throw new RangeError(`row ${id} is not among its siblings`);
  const lower = siblings[at]!.order_key;
  let upperIndex = at + 1;
  while (upperIndex < siblings.length && siblings[upperIndex]!.order_key <= lower) upperIndex += 1;
  return orderKeyBetween(lower, siblings[upperIndex]?.order_key ?? null);
}
