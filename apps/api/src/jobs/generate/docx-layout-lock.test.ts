import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { blockDefinitionIn, composeParecer, effectiveConclusionPair, layoutSpec, seedRule, snapshotDefinitionContext, visitContextOf, type RelatorioSnapshot } from '@app/domain';
import {
  LAYOUT_LOCK_EPIC25_VERSIONS,
  LAYOUT_LOCK_ISSUED_AT,
  LAYOUT_LOCK_VERSIONS,
  layoutLockEpic25Golden,
  layoutLockEpic25Snapshot,
  layoutLockFixture,
  layoutLockSnapshot,
} from '@app/domain/fixtures/layout-lock';
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
 *
 * Story 25.5, the Epic 25 layout lock (25.5-UNIT-LOCK): the v14 golden (PR #325, from the code deployed as
 * 2009fa30) stays byte-equal, and a second v14 relatório holding the cases Epic 25 changes on v15
 * (`layoutLockEpic25Fixture`) is pinned in `golden/layout-lock-v14-epic25/`, taken once on this batch's
 * first commit (seed v15 opened equal to v14, no rule changed). Every later Epic 25 PR keeps every golden
 * of this directory byte-equal.
 */

/*
 * Batch e24a: 24.2-UNIT-SAME reads seed v14's rule flags off while it runs. The domain reads a flag
 * only through `seedRule` (`seed/definitions.ts`), so the one module is mocked; every other test of the
 * file reads the flags as shipped (v5 to v13 carry none).
 */
const rulesOff = vi.hoisted(() => ({ v14: false, v15ReadsV14: false }));
vi.mock('../../../../../packages/domain/src/seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../packages/domain/src/seed/definitions.ts')>();
  return {
    ...actual,
    seedRule: (version: string, flag: Parameters<typeof actual.seedRule>[1]) => {
      if (rulesOff.v14 && version === 'v14') return false;
      // Story 25.5 (25.5-UNIT-SAME): v15 reads v14's flags only, so a later Epic 25 flag stays out of the comparison.
      if (rulesOff.v15ReadsV14 && version === 'v15') return actual.seedRule('v14', flag);
      return actual.seedRule(version, flag);
    },
  };
});

const GOLDEN_DIR = resolve(__dirname, 'golden');
/** The parts that carry the printed layout (the body, its numbering and styles, the header and footer). */
const PARTS = /^word\/(document|numbering|styles|header\d*|footer\d*)\.xml$/;

async function partsOf(version: string, snapshotOf: (version: string) => RelatorioSnapshot = layoutLockSnapshot): Promise<Map<string, string>> {
  const layout = layoutSpec(snapshotOf(version), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
  const parts = new Map<string, string>();
  for (const [name, bytes] of readZipEntries(docx)) if (PARTS.test(name)) parts.set(name, bytes.toString('utf8'));
  return parts;
}

describe('24.2-UNIT-LOCK (23.2-UNIT-LOCK) the DOCX of the locked seed versions is byte-equal to its golden', () => {
  it.each(LAYOUT_LOCK_VERSIONS)(
    '%s: every layout part of the synthetic relatório matches its golden/layout-lock directory',
    async (version) => expectGolden(version, `layout-lock-${version}`, await partsOf(version)),
    120_000,
  );

  it('is deterministic: two renders of v12 give the same document.xml', async () => {
    const [a, b] = await Promise.all([partsOf('v12'), partsOf('v12')]);
    expect(a.get('word/document.xml') === b.get('word/document.xml')).toBe(true);
  }, 120_000);
});

describe('25.5-UNIT-LOCK the DOCX of the Epic 25 v14 relatório is byte-equal to its golden', () => {
  it.each(LAYOUT_LOCK_EPIC25_VERSIONS)(
    '%s: every layout part of the relatório holding the cases Epic 25 changes on v15 matches golden/layout-lock-v14-epic25',
    async (version) => expectGolden(version, layoutLockEpic25Golden(version), await partsOf(version, layoutLockEpic25Snapshot)),
    120_000,
  );
});

/** The layout parts against the golden directory `dirName`: written once with `GOLDEN_UPDATE=1`, byte-equal ever after. */
function expectGolden(version: string, dirName: string, parts: Map<string, string>): void {
  expect(parts.has('word/document.xml')).toBe(true);
  const dir = resolve(GOLDEN_DIR, dirName);
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
}

/**
 * Story 24.2 (24.2-UNIT-SAME): at its opening seed v14 changes no rule, so a v14 relatório with the
 * same answers as the v13 one concludes and prints the same: their layouts differ in nothing but
 * the ids the fixture derives from the version, its op ids and the version's own name. Batch e24a
 * (Stories 24.3 and 24.4): v14 now carries rule flags, so the comparison reads them off
 * (`rulesOff`, the domain's `seedRule` mocked above): every v14 difference comes through a flag,
 * and nothing else of v14 moves; the v14 print with its flags on is `e24a-v14-print.integration.test.ts`'s.
 *
 * Batch e24s (Stories 24.10 to 24.14): v14 changes, by design, what some sheets ask and print
 * (`E24S_TYPES`), so the fixture writes a different number of answers there, and it offers one type
 * more, the No-break de comando (Story 24.13), whose sheet the fixture adds by rule. The comparison
 * keeps its purpose: every sheet of every other type lays out as v13's; the named types' sheets are
 * the only ones that differ, each of them does, the No-break's is the one sheet v13 lacks, and the
 * rest of the document differs by that one sheet alone (its title in section 9). Their v14 deltas
 * are pinned by `e24s-seed-v14-sheets.test.ts` (packages/domain). Story 24.14's keys (the oil
 * sampling's "Outro" text, the Malha's plate block title and photo) change no print of this fixture.
 */

/**
 * The types whose v14 sheet prints differently from v13's by design (batch e24s): the TC without
 * FUSÍVEIS (Story 24.10), the transformer's 17 items (Story 24.11) and the Inspeção de QGBT's 12
 * items (Story 24.12). The TP's FUSÍVEIS hint shows on the sheet only, so the TP prints as v13's.
 */
const E24S_TYPES: ReadonlySet<string> = new Set(['tc', 'transformador_forca', 'inspecao_qgbt']);
/** The print titles of the parts batch e24s changes on those sheets: the checklist, and the v14 inspection's thermography (its own). */
const CHECKLIST_PART = 'VERIFICAÇÕES GERAIS';
const INSPECTION_THERMOGRAPHY = 'TERMOGRAFIA';

describe('24.2-UNIT-SAME a v14 relatório with the v13 fixture\'s answers lays out as the v13 one, its rule flags off', () => {
  beforeEach(() => {
    rulesOff.v14 = true;
  });
  afterEach(() => {
    rulesOff.v14 = false;
  });

  /** The version's ids, op ids and name masked (`019a6100-00VV-…`, `019a6100-01VV-…`, `vVV`). */
  const masked = (version: string, json: string) => {
    const hex = Number(version.slice(1)).toString(16).padStart(2, '0');
    return json
      .replaceAll(`019a6100-00${hex}-`, '019a6100-00VV-')
      .replaceAll(`019a6100-01${hex}-`, '019a6100-01VV-')
      .replaceAll(new RegExp(`\\b${version}\\b`, 'g'), 'vVV');
  };

  /** The layout of the version's fixture, split: its section 9 sheets by masked block id with their type, and the rest. */
  /** Batch e24s (Story 24.13): v14 without the type v13 does not offer, so the two fixtures allocate the same ids. */
  const COMPARED = { withoutTypes: ['no_break_comando'] };
  const layoutOf = (version: string) => {
    const snapshot = layoutLockSnapshot(version, COMPARED);
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
    const typeOf = new Map(snapshot.blocks.map((block) => [block.id, block.block_type]));
    const sheets = new Map<string, { type: string; json: string; core: string }>();
    for (const section of layout.sections) {
      if (section.kind !== 'sheets') continue;
      for (const subsection of section.subsections) {
        for (const sheet of subsection.sheets) {
          // The sheet without the parts batch e24s changes by design: its VERIFICAÇÕES GERAIS table and (the v14 Inspeção de
          // QGBT's) its thermography. The fixture's NC answer is every list's item 2, so a conclusion naming it reads the same
          // number on both versions and needs no mask.
          const changed = typeOf.get(sheet.blockId) === 'inspecao_qgbt' ? [CHECKLIST_PART, INSPECTION_THERMOGRAPHY] : [CHECKLIST_PART];
          const kept = sheet.parts.filter((part) => part.kind !== 'table' || !changed.some((title) => part.table.rows[0]?.cells[0]?.text.includes(title)));
          sheets.set(masked(version, sheet.blockId), {
            type: typeOf.get(sheet.blockId)!,
            json: masked(version, JSON.stringify(sheet)),
            core: masked(version, JSON.stringify({ ...sheet, parts: kept })),
          });
        }
        subsection.sheets = subsection.sheets.map((sheet) => ({ ...sheet, parts: [] }));
      }
    }
    return { rest: masked(version, JSON.stringify(layout)), sheets };
  };

  it('v13 and v14 give one layout once ids and the version are masked, but for the sheets of the types batch e24s changes and its new No-break', () => {
    // The mock is the one the domain reads: v14's flags are off here and on outside this block.
    expect(seedRule('v14', 'conclusion_restriction_by_choice')).toBe(false);
    const v13 = layoutLockFixture('v13');
    const v14 = layoutLockFixture('v14', undefined, COMPARED);
    // Batch e24s: the TC answers one item less, the transformer three more, the Inspeção de QGBT two more.
    expect(v14.log.length - v13.log.length).toBe(-1 + 3 + 2);
    expect(layoutLockSnapshot('v14').relatorio.seed_version).toBe('v14');
    const a = layoutOf('v13');
    const b = layoutOf('v14');
    // Every section but the sheets' parts, the sheets' titles and order included.
    expect(b.rest).toBe(a.rest);
    expect([...b.sheets.keys()]).toEqual([...a.sheets.keys()]);
    const differing = [...a.sheets].filter(([key, sheet]) => b.sheets.get(key)!.json !== sheet.json).map(([, sheet]) => sheet.type);
    // Only the named types differ, and each of them does (the list is not stale).
    expect(new Set(differing)).toEqual(E24S_TYPES);
    for (const [key, sheet] of a.sheets) if (!E24S_TYPES.has(sheet.type)) expect(b.sheets.get(key)!.json, sheet.type).toBe(sheet.json);
    // The named types differ only in the parts batch e24s changes: their plate, tests, observations and conclusion are v13's.
    for (const [key, sheet] of a.sheets) if (E24S_TYPES.has(sheet.type)) expect(b.sheets.get(key)!.core, `${sheet.type} outside its checklist`).toBe(sheet.core);
  });

  it('batch e24s (Story 24.13): v14 as the fixture builds it whole holds one sheet more than v13, the No-break de comando\'s', () => {
    // A company type's key carries the version's ids: read as its kind.
    const types = (version: string) =>
      layoutLockSnapshot(version)
        .blocks.filter((block) => block.equipment_id !== null)
        .map((block) => (block.block_type.startsWith('type:') ? 'type:' : block.block_type));
    const v14 = types('v14');
    expect(v14.filter((type) => type === 'no_break_comando')).toHaveLength(1);
    expect(v14.filter((type) => type !== 'no_break_comando')).toEqual(types('v13'));
  });

  it('control: with its flags on, as v14 ships, its layout is not v13\'s (the comparison above is not vacuous)', () => {
    rulesOff.v14 = false;
    expect(seedRule('v14', 'conclusion_restriction_by_choice')).toBe(true);
    expect(layoutOf('v14').rest).not.toBe(layoutOf('v13').rest);
  });
});

/**
 * Story 25.5 (25.5-UNIT-SAME): at its opening seed v15 changes no rule, so a v15 relatório with the same
 * answers as the v14 one (the Epic 25 fixture, built on each version) concludes and prints the same: every
 * ficha's effective pair and the composed parecer are equal, and the layout and the DOCX parts differ in
 * nothing but the ids the fixture derives from the version, its op ids and the version's own name. The
 * comparison reads v15 through v14's rule flags only (`rulesOff.v15ReadsV14`), so a later Epic 25 story
 * that adds a v15 flag keeps this pin: every v15 difference comes through a flag.
 */
describe('25.5-UNIT-SAME a v15 relatório with the v14 Epic 25 fixture\'s answers concludes and prints as the v14 one', () => {
  beforeEach(() => {
    rulesOff.v15ReadsV14 = true;
  });
  afterEach(() => {
    rulesOff.v15ReadsV14 = false;
  });

  /** The version's ids, op ids and name masked (`019a6100-02VV-…`, `019a6100-03VV-…`, the instruments' `019a6100-00VV-…`, `vVV`). */
  const masked = (version: string, text: string) => {
    const hex = Number(version.slice(1)).toString(16).padStart(2, '0');
    return text
      .replaceAll(`019a6100-00${hex}-`, '019a6100-00VV-')
      .replaceAll(`019a6100-02${hex}-`, '019a6100-02VV-')
      .replaceAll(`019a6100-03${hex}-`, '019a6100-03VV-')
      .replaceAll(new RegExp(`\\b${version}\\b`, 'g'), 'vVV');
  };

  /** Every equipment sheet's effective conclusion pair, by masked block id, and the composed parecer. */
  const verdictsOf = (version: string) => {
    const snapshot = layoutLockEpic25Snapshot(version);
    const ctx = snapshotDefinitionContext(snapshot);
    const pairs = snapshot.blocks
      .filter((block) => block.equipment_id !== null)
      .map((block) => [masked(version, block.id), effectiveConclusionPair(block, blockDefinitionIn(ctx, block)!, visitContextOf(snapshot, block))] as const);
    return { pairs, parecer: masked(version, JSON.stringify(composeParecer(snapshot))) };
  };

  it('v14 and v15 give the same verdicts: each ficha\'s pair and the parecer', () => {
    expect(layoutLockEpic25Snapshot('v15').relatorio.seed_version).toBe('v15');
    const a = verdictsOf('v14');
    const b = verdictsOf('v15');
    expect(a.pairs.length).toBeGreaterThan(10);
    expect(b.pairs).toEqual(a.pairs);
    expect(b.parecer).toBe(a.parecer);
  });

  it('v14 and v15 give one layout and one DOCX once ids and the version are masked', async () => {
    const layoutOf = (version: string) => masked(version, JSON.stringify(layoutSpec(layoutLockEpic25Snapshot(version), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT })));
    expect(layoutOf('v15')).toBe(layoutOf('v14'));
    const [a, b] = await Promise.all([partsOf('v14', layoutLockEpic25Snapshot), partsOf('v15', layoutLockEpic25Snapshot)]);
    expect([...b.keys()]).toEqual([...a.keys()]);
    for (const [name, text] of a) expect(masked('v15', b.get(name)!) === masked('v14', text), name).toBe(true);
  }, 120_000);
});
