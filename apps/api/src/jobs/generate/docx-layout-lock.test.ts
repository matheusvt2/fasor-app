import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { layoutSpec, seedRule } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, LAYOUT_LOCK_VERSIONS, layoutLockFixture, layoutLockSnapshot } from '@app/domain/fixtures/layout-lock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDocx } from './docx.ts';
import { readZipEntries } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * Story 23.2, the Epic 23 layout lock (23.2-UNIT-LOCK): the DOCX parts of the synthetic v5, v11 and
 * v12 relatórios (`@app/domain/fixtures/layout-lock`, one sheet of every type each version offers)
 * are pinned byte for byte in `golden/layout-lock-{version}/`. Bruno likes the current relatório:
 * every later Epic 23 PR keeps these, and the Porto Seguro goldens, unchanged; a drift here is a
 * defect against the protection, never a golden update. They were taken on main a3b0ec0e (fix
 * batch e23f merged) with `GOLDEN_UPDATE=1`. The PDF text half is `layout-lock.integration.test.ts`.
 *
 * Story 24.2, the Epic 24 layout lock (24.2-UNIT-LOCK): v13 joins, its synthetic relatório carrying
 * what Epic 24 changes on v14 (`epic24Extras` of the fixture); its golden is taken on main after
 * fix batches e24h and e24f, before any rule of Stories 24.3 and 24.4. Every later Epic 24 PR keeps
 * the v5, v11, v12 and v13 goldens and the Porto Seguro goldens byte-equal.
 */

/*
 * Batch e24a: 24.2-UNIT-SAME reads seed v14's rule flags off while it runs. The domain reads a flag
 * only through `seedRule` (`seed/definitions.ts`), so the one module is mocked; every other test of the
 * file reads the flags as shipped (v5 to v13 carry none).
 */
const rulesOff = vi.hoisted(() => ({ v14: false }));
vi.mock('../../../../../packages/domain/src/seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../packages/domain/src/seed/definitions.ts')>();
  return { ...actual, seedRule: (version: string, flag: Parameters<typeof actual.seedRule>[1]) => (rulesOff.v14 && version === 'v14' ? false : actual.seedRule(version, flag)) };
});

const GOLDEN_DIR = resolve(__dirname, 'golden');
/** The parts that carry the printed layout (the body, its numbering and styles, the header and footer). */
const PARTS = /^word\/(document|numbering|styles|header\d*|footer\d*)\.xml$/;

async function partsOf(version: string): Promise<Map<string, string>> {
  const layout = layoutSpec(layoutLockSnapshot(version), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
  const parts = new Map<string, string>();
  for (const [name, bytes] of readZipEntries(docx)) if (PARTS.test(name)) parts.set(name, bytes.toString('utf8'));
  return parts;
}

describe('24.2-UNIT-LOCK (23.2-UNIT-LOCK) the DOCX of the locked seed versions is byte-equal to its golden', () => {
  it.each(LAYOUT_LOCK_VERSIONS)(
    '%s: every layout part of the synthetic relatório matches its golden/layout-lock directory',
    async (version) => {
      const parts = await partsOf(version);
      expect(parts.has('word/document.xml')).toBe(true);
      const dir = resolve(GOLDEN_DIR, `layout-lock-${version}`);
      const index = resolve(dir, 'parts.json');
      if (process.env.GOLDEN_UPDATE === '1') {
        mkdirSync(dir, { recursive: true });
        for (const [name, text] of parts) {
          const file = resolve(dir, name.replace('word/', ''));
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, text);
        }
        writeFileSync(index, `${JSON.stringify([...parts.keys()].sort(), null, 2)}\n`);
      } else if (!existsSync(index)) {
        throw new Error(`${index} is missing; the layout lock is taken once, deliberately, with GOLDEN_UPDATE=1`);
      }
      expect([...parts.keys()].sort(), 'the DOCX parts changed').toEqual(JSON.parse(readFileSync(index, 'utf8')));
      for (const [name, text] of parts) {
        const golden = readFileSync(resolve(dir, name.replace('word/', '')), 'utf8');
        // Not toEqual on the whole string: a mismatch would print megabytes. Byte equality, then the first difference.
        if (text !== golden) {
          let at = 0;
          while (at < text.length && text[at] === golden[at]) at++;
          expect(text.slice(Math.max(0, at - 200), at + 200), `${version} ${name} drifted at ${at}`).toBe(golden.slice(Math.max(0, at - 200), at + 200));
        }
        expect(text === golden, `${version} ${name}`).toBe(true);
      }
    },
    120_000,
  );

  it('is deterministic: two renders of v12 give the same document.xml', async () => {
    const [a, b] = await Promise.all([partsOf('v12'), partsOf('v12')]);
    expect(a.get('word/document.xml') === b.get('word/document.xml')).toBe(true);
  }, 120_000);
});

/**
 * Story 24.2 (24.2-UNIT-SAME): at its opening seed v14 changes no rule, so a v14 relatório with the
 * same answers as the v13 one concludes and prints the same: their layouts differ in nothing but
 * the ids the fixture derives from the version, its op ids and the version's own name. Batch e24a
 * (Stories 24.3 and 24.4): v14 now carries rule flags, so the comparison reads them off
 * (`rulesOff`, the domain's `seedRule` mocked above): every v14 difference comes through a flag,
 * and nothing else of v14 moves; the v14 print with its flags on is `e24a-v14-print.integration.test.ts`'s.
 */
describe('24.2-UNIT-SAME a v14 relatório with the v13 fixture\'s answers lays out as the v13 one, its rule flags off', () => {
  beforeEach(() => {
    rulesOff.v14 = true;
  });
  afterEach(() => {
    rulesOff.v14 = false;
  });

  /** The layout as JSON, the version's ids, op ids and name masked (`019a6100-00VV-…`, `019a6100-01VV-…`, `vVV`). */
  const normalized = (version: string) => {
    const hex = Number(version.slice(1)).toString(16).padStart(2, '0');
    const layout = layoutSpec(layoutLockSnapshot(version), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
    return JSON.stringify(layout)
      .replaceAll(`019a6100-00${hex}-`, '019a6100-00VV-')
      .replaceAll(`019a6100-01${hex}-`, '019a6100-01VV-')
      .replaceAll(new RegExp(`\\b${version}\\b`, 'g'), 'vVV');
  };

  it('v13 and v14 give one layout once ids and the version are masked; dates are fixed and equal', () => {
    // The mock is the one the domain reads: v14's flags are off here and on outside this block.
    expect(seedRule('v14', 'conclusion_restriction_by_choice')).toBe(false);
    const v13 = layoutLockFixture('v13');
    const v14 = layoutLockFixture('v14');
    expect(v14.log).toHaveLength(v13.log.length);
    expect(v14.log.map((op) => op.client_ts)).toEqual(v13.log.map((op) => op.client_ts));
    expect(layoutLockSnapshot('v14').relatorio.seed_version).toBe('v14');
    expect(normalized('v14')).toBe(normalized('v13'));
  });

  it('control: with its flags on, as v14 ships, its layout is not v13\'s (the comparison above is not vacuous)', () => {
    rulesOff.v14 = false;
    expect(seedRule('v14', 'conclusion_restriction_by_choice')).toBe(true);
    expect(normalized('v14')).not.toBe(normalized('v13'));
  });
});
