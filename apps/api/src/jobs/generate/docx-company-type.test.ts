import { buildSnapshot, layoutSpec, replay } from '@app/domain';
import { companyTypes, RELATORIO_ID } from '@app/domain/fixtures/company-types';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
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
