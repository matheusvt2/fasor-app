import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Review fixes 2026-09-30 (security H2, L8): `pnpm audit` is not part of `pnpm verify`, so the
 * versions that close the advisories are pinned here against the committed lockfile. A
 * dependency change that brings an affected version back fails the unit gate.
 */

const lockfile = readFileSync(resolve(import.meta.dirname, '..', 'pnpm-lock.yaml'), 'utf8');

/** Every resolved version of `name` in the lockfile's packages section. */
function versions(name: string): string[] {
  const escaped = name.replace(/[/@.]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`^  '?${escaped}@(\\d+\\.\\d+\\.\\d+)[^:]*'?:$`, 'gm');
  return [...new Set([...lockfile.matchAll(pattern)].map((m) => m[1] ?? ''))];
}

function atLeast(version: string, floor: string): boolean {
  const a = version.split('.').map(Number);
  const b = floor.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}

describe('security pins in the lockfile (review fixes 2026-09-30)', () => {
  it('resolves sharp at 0.35.5 or later (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c)', () => {
    const found = versions('sharp');
    expect(found.length).toBeGreaterThan(0);
    for (const version of found) expect(atLeast(version, '0.35.5'), `sharp@${version}`).toBe(true);
  });

  it('resolves no esbuild older than 0.25.0 (GHSA-67mh-4wv8-2f99)', () => {
    const found = versions('esbuild');
    expect(found.length).toBeGreaterThan(0);
    for (const version of found) expect(atLeast(version, '0.25.0'), `esbuild@${version}`).toBe(true);
  });
});
