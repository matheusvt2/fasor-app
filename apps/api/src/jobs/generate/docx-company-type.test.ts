import { buildSnapshot, layoutSpec, replay, TEST_HELP_KEYS, type RelatorioSnapshot, type TestHelp } from '@app/domain';
import { companyTypes, RELATORIO_ID } from '@app/domain/fixtures/company-types';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure, readZipEntries } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * Story 14.6 (AD-15 note of 2026-11-06): section 9 of the DOCX with company equipment types. The
 * AD-3 log of `fixtures/company-types` (a no-break published as v1 and renamed in v2, a retired
 * fonte auxiliar, a block of each version) is folded with the kernel's `replay` and rendered from
 * its snapshot alone: the renderer resolves each company sheet through `snapshot.equipment_types`
 * and prints it in "Outros equipamentos", titled by its own version (`print_title`, else `label`),
 * with the seeded grammars' tables. No database and no LibreOffice.
 */

const ISSUED_AT = '2026-11-07T12:00:00.000Z';
const SECTION_9 = '9 RELATÓRIOS DOS ENSAIOS';

async function render() {
  const snapshot = buildSnapshot(replay(companyTypes.log), RELATORIO_ID);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  const structure = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
  const from = structure.paragraphs.lastIndexOf(SECTION_9);
  const to = structure.paragraphs.findIndex((p, i) => i > from && p.startsWith('10 CONCLUSÃO'));
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return { snapshot, structure, section: structure.paragraphs.slice(from, to) };
}

describe('Story 14.6: company types in section 9 of the DOCX', () => {
  it('prints every company sheet under "Outros equipamentos", each titled by the version its block references', async () => {
    const { snapshot, section } = await render();
    expect(snapshot.equipment_types?.length).toBe(3);
    expect(section).toContain('9.1 Outros equipamentos da Cabine principal');
    // The sheet title bars (paragraphs, as `docx.test.ts` reads them), in tree order: v1 keeps its
    // label, v2 prints its print title, and the retired type's v1 still prints.
    const titles = section.filter((p) => /^(NO-BREAK DE COMANDO|FONTE AUXILIAR) [A-Z]+-\d+$/.test(p));
    expect(titles).toEqual(['NO-BREAK DE COMANDO NB-01', 'NO-BREAK DE COMANDO NB-02', 'FONTE AUXILIAR FA-01']);
  });

  it('draws a company sheet with the seeded grammars: its plate, its checklist and its measurement table', async () => {
    const { structure } = await render();
    const text = structure.tables.flat(2).join(' | ');
    expect(text).toContain('MODELO');
    expect(text).toContain('NB-3000');
    expect(text).toContain('BORNES E CONEXÕES DAS BATERIAS');
    expect(text).toContain('Tensão de flutuação do banco');
  });
});

describe('Story 23.10 (batch e23h): "Como ensaiar" is never printed', () => {
  /** A distinctive synthetic text per heading and test, so any leak into the document is found. */
  const marker = (testKey: string, key: string) => `COMO-ENSAIAR-${testKey}-${key}-e23h`;

  /** The snapshot with every test of every company version carrying all eight headings. */
  function withHelp(snapshot: RelatorioSnapshot): RelatorioSnapshot {
    const helpOf = (testKey: string): TestHelp => Object.fromEntries(TEST_HELP_KEYS.map((key) => [key, marker(testKey, key)]));
    return {
      ...snapshot,
      equipment_types: snapshot.equipment_types!.map((row) => ({
        ...row,
        definition: {
          ...row.definition,
          tests: row.definition.tests.map((test) => ({ ...test, help: helpOf(test.key) })),
          ...(row.definition.measurement_tests === undefined ? {} : { measurement_tests: row.definition.measurement_tests.map((test) => ({ ...test, help: helpOf(test.key) })) }),
        },
      })),
    };
  }

  async function parts(snapshot: RelatorioSnapshot): Promise<Map<string, Buffer>> {
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    return readZipEntries(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
  }

  it('a relatório whose tests all carry help renders word/document.xml byte-equal to the help-free render, and no part holds a help text', async () => {
    const plain = buildSnapshot(replay(companyTypes.log), RELATORIO_ID);
    const helped = withHelp(plain);
    const keys = helped.equipment_types!.flatMap((row) => [...row.definition.tests, ...(row.definition.measurement_tests ?? [])].map((test) => test.key));
    expect(keys.length).toBeGreaterThan(0);
    const a = await parts(plain);
    const b = await parts(helped);
    expect(b.get('word/document.xml')!.equals(a.get('word/document.xml')!)).toBe(true);
    expect([...b.keys()]).toEqual([...a.keys()]);
    for (const [name, bytes] of b) {
      const text = bytes.toString('utf8');
      expect(text.includes('COMO-ENSAIAR-'), name).toBe(false);
    }
  });
});
