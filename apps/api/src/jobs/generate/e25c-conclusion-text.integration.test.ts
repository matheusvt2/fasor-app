import { layoutSpec, type RelatorioSnapshot } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it, vi } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.7-INT (batch e25c, Story 25.7, seed v15 `conclusion_names_choice_and_unmeasured`; M20): the DOCX of a v15
 * relatório holding the two sheets of the story (the Epic 25 fixture, `layoutLockEpic25Fixture`): a chave
 * seccionadora concluded Aprovado with its insulation measured and its contact resistance left "Não medido", and
 * a cabos de saída the technician concluded Reprovado with an observation over readings within their criteria.
 * Each sheet's confirmed text is the one "Concluir ficha" composed (the fixture's cabos de entrada, every reading
 * "Não medido", is a third such sheet). On v15 section 9 prints the contact resistance
 * named as not measured, and the Reprovado said to be the responsible's, pointing to the observations; the v14
 * relatório with the same answers prints today's paragraphs. Every other table of the two documents is the same.
 *
 * So that another Epic 25 flag never moves this comparison, v15 reads v14's rule flags here plus this story's own
 * (`seedRule` is the one reader of a flag, mocked as `docx-layout-lock.test.ts` mocks it).
 */
vi.mock('../../../../../packages/domain/src/seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../packages/domain/src/seed/definitions.ts')>();
  return {
    ...actual,
    seedRule: (version: string, flag: Parameters<typeof actual.seedRule>[1]) =>
      version === 'v15' && flag !== 'conclusion_names_choice_and_unmeasured' ? actual.seedRule('v14', flag) : actual.seedRule(version, flag),
  };
});

async function tablesOf(version: string): Promise<{ snapshot: RelatorioSnapshot; tables: string[][][] }> {
  const snapshot = layoutLockEpic25Snapshot(version);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return { snapshot, tables: extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) })).tables };
}

/** The TAG of the fixture's first live sheet of `type`. */
function tagOf(snapshot: RelatorioSnapshot, type: string): string {
  const block = snapshot.blocks.find((row) => row.block_type === type && row.removed_at === null)!;
  return snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag;
}

const isConclusion = (table: string[][]) => table[0]?.[0] === 'CONCLUSÃO';
/** The index of the CONCLUSÃO table whose paragraph opens with `subject`. */
const conclusionOf = (tables: string[][][], subject: string) => tables.findIndex((table) => isConclusion(table) && (table[2]?.[0] ?? '').startsWith(subject));

const UNMEASURED = 'Não medido: ensaio de resistência ôhmica de contato.';
const REPROVED = 'Ficha reprovada por avaliação do responsável técnico, conforme as observações.';
const RECOMMENDATION = 'Recomenda-se a correção dos pontos indicados antes da próxima manutenção.';

describe('25.7-INT the DOCX of a v15 relatório with a test left unmeasured and a Reprovado by hand', () => {
  it('section 9: the seccionadora names its contact resistance as not measured and the cabos de saída its Reprovado as the responsible\'s on v15; v14 prints today\'s paragraphs; every other table the same', async () => {
    const [v14, v15] = await Promise.all([tablesOf('v14'), tablesOf('v15')]);
    const seccionadora = `A seccionadora ${tagOf(v14.snapshot, 'chave_seccionadora')}`;
    const cabos = `Os cabos de saída ${tagOf(v14.snapshot, 'cabos_saida')}`;
    const partly = conclusionOf(v14.tables, seccionadora);
    const byHand = conclusionOf(v14.tables, cabos);
    expect(partly).toBeGreaterThan(-1);
    expect(byHand).toBeGreaterThan(-1);
    expect(conclusionOf(v15.tables, seccionadora)).toBe(partly);
    expect(conclusionOf(v15.tables, cabos)).toBe(byHand);
    const paragraph = (tables: string[][][], at: number) => tables[at]!.slice(2).map((row) => row.join(' ')).join(' ');

    // The seccionadora: "dentro dos critérios" of what was measured, its NC item, then the test left out (v15 only).
    expect(paragraph(v15.tables, partly)).toContain('apresentou valores medidos dentro dos critérios de aceitação e ');
    expect(paragraph(v15.tables, partly)).toContain(`(item 2, NC). ${UNMEASURED} ${RECOMMENDATION}`);
    expect(paragraph(v14.tables, partly)).not.toContain('Não medido');
    // The cabos de saída: the Reprovado is the responsible's and points to the observations; v14 recommends the correction.
    expect(paragraph(v15.tables, byHand)).toContain(REPROVED);
    expect(paragraph(v14.tables, byHand)).not.toContain(REPROVED);
    expect(paragraph(v14.tables, byHand)).toContain(RECOMMENDATION);
    // Both print their boxes as before: the verdict does not move.
    expect(v15.tables[partly]![1]).toEqual(v14.tables[partly]![1]);
    expect(v15.tables[byHand]![1]).toEqual(v14.tables[byHand]![1]);

    expect(v15.tables).toHaveLength(v14.tables.length);
    // Story 25.22: v15's ratio tables are headed "TPs" and "TCs" (v14: "TP's" and "TPS"), read as v14's here.
    const asV14Ratio = (json: string) => json.replace('["TPs",', '["TP\'s",').replace('["TCs",', '["TPS",');
    const differing = v15.tables.flatMap((table, n) => (asV14Ratio(JSON.stringify(table)) === JSON.stringify(v14.tables[n]) ? [] : [n]));
    // The fixture's cabos de entrada (Story 25.6's sheet, concluded Aprovado here since that flag stays off) left
    // its one test "Não medido": it is named too.
    const cable = conclusionOf(v14.tables, `Os cabos de entrada ${tagOf(v14.snapshot, 'cabos_entrada')}`);
    expect(paragraph(v15.tables, cable)).toBe(`${paragraph(v14.tables, cable)} Não medido: ensaio de isolação.`);
    expect(differing).toEqual([cable, partly, byHand].sort((a, b) => a - b));
  }, 120_000);
});
