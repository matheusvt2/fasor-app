import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EQUIPMENT_BLOCK_TYPES, getDefinition, SEED_VERSION } from '@app/domain';
import { describe, expect, it } from 'vitest';

/*
 * Story 3.1: the per-item NC chip phrases ship as a reviewable document for Bruno
 * (`docs/nc-chip-phrases.md`). The document has to list exactly what the seed carries,
 * so every seeded phrase must appear in its own item's row there. Each `##` section
 * names its block types; each table row is `| n | LABEL | \`key\` | a · b · c |`.
 */

const doc = readFileSync(resolve(import.meta.dirname, '../docs/nc-chip-phrases.md'), 'utf8');

/** `block_type -> item key -> phrases` as the document lists them. */
function documentedPhrases(): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  let types: string[] = [];
  for (const line of doc.split('\n')) {
    if (line.startsWith('## ')) types = [];
    const typesLine = /^Block types: (.*)\.$/.exec(line);
    if (typesLine) types = [...typesLine[1]!.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!);
    const row = /^\| \d+ \| [^|]+ \| `([a-z0-9_]+)` \| (.+) \|$/.exec(line);
    if (!row) continue;
    const phrases = row[2]!.split(' · ').map((p) => p.trim());
    for (const type of types) {
      if (!out.has(type)) out.set(type, new Map());
      out.get(type)!.set(row[1]!, phrases);
    }
  }
  return out;
}

describe('docs/nc-chip-phrases.md', () => {
  it('carries a dated pending-review status line', () => {
    expect(doc).toMatch(/\*\*Status:\*\* pending review by Bruno.*\(entry dated \d{4}-\d{2}-\d{2}\)/);
  });

  it('lists every seeded NC phrase in its own item row, for every block type', () => {
    const documented = documentedPhrases();
    const missing: string[] = [];
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      for (const item of getDefinition(SEED_VERSION, 'cabine_primaria', type).checklist ?? []) {
        const row = documented.get(type)?.get(item.key) ?? [];
        for (const phrase of item.nc_phrases) if (!row.includes(phrase)) missing.push(`${type}/${item.key}: ${phrase}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
