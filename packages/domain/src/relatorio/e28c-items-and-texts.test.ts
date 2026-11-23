import { describe, expect, it } from 'vitest';
import { layoutLockEpic25Snapshot } from '../../fixtures/layout-lock/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { relatorioSetupPath } from '../ops/path.ts';
import { opValueIssue, TEXT_CAPS, textCapOf } from '../ops/value-limits.ts';
import { permissionForPath, SETUP_CREATE_FIELDS, SETUP_FILL_FIELDS } from '../permissions/map.ts';
import { layoutSpec, type LayoutSection } from '../print/layout.ts';
import type { LayoutSection10 } from '../print/section-10.ts';
import { relatorioSetupSchema, type BlockRow, type Cell } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition, getSeed, sectionText } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { additionalItemsWithoutBlanks, offersAdditionalItems, printedAdditionalItems, sameAdditionalItems, withoutAdditionalItem } from './additional-items.ts';
import { APPLICABILITY_APPLIED, testApplicability } from './applicability.ts';
import { instantiateTemplate, relatorioSectionNumber } from './instantiate.ts';
import { choiceValue } from './measurement-evaluation.ts';
import { EARTH_RESISTANCE_PARAGRAPH, holdsMalhaSheet, section2Blocks } from './section-variables.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * 28.9-UNIT and 28.10-UNIT (batch e28c, Epic 28 wave 2; B-15, B-14, B-12, B-3): the relatório's additional items (the
 * setup key, the drop of blank rows, the permission, section 10 with zero, one and three items, a v17 relatório
 * unchanged) and the fixed texts of v18 (section 1 "de ⟨cliente⟩", section 2's paragraph on earth resistance with and
 * without a Malha de aterramento and under an own text, v17 unchanged), and the applied band's sentence on every seed.
 * Every value is invented.
 */

const ISSUED_AT = '2026-12-10T15:00:00.000Z';
const ITEMS = [
  'O ensaio de isolação dos cabos de saída da Coluna 4 foi feito em conjunto, pelo barramento, com as duas chaves fechadas.',
  'Os ajustes dos relés seguem o estudo de seletividade fornecido pelo cliente, que não foi revisado nesta manutenção.',
  'Os equipamentos da concessionária não foram ensaiados.',
];

/** A relatório freshly instantiated from the standard template on `seedVersion`, with its live section blocks. */
function standardSnapshot(seedVersion: string): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0281-7000-8000-000000000001', seedVersion }),
    { id: TEST_PROJECT },
    { service_start: '2026-12-01', service_end: '2026-12-03', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0282-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-e28c' }, { newId: idSequence('019966b0-0283-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const withItems = (snapshot: RelatorioSnapshot, items: string[]): RelatorioSnapshot => ({
  ...snapshot,
  relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, additional_items: items } },
});

const sectionOf = (snapshot: RelatorioSnapshot, fixed: number): LayoutSection => {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  // The printed number of a FO.SERV-03 section is its position; find it by the seed's title.
  const title = getSeed(snapshot.relatorio.seed_version, 'cabine_primaria').section_titles[String(fixed)];
  return layout.sections.find((section) => section.title === title)!;
};
const section10 = (snapshot: RelatorioSnapshot) => sectionOf(snapshot, 10) as LayoutSection10;
const paragraphsOf = (section: LayoutSection): string[] => (section.kind === 'text' ? section.paragraphs.map((paragraph) => paragraph.text) : []);

describe('28.9-UNIT the relatório\'s additional items', () => {
  it('the setup key is a list of texts, empty by default, and a stored row without it parses as none', () => {
    const parsed = relatorioSetupSchema.parse({ service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null, site_altitude_m: null, site_altitude_confirmed: false, next_intervention_date: null, next_intervention_justification: null });
    expect(parsed.additional_items).toEqual([]);
    expect(relatorioSetupSchema.shape.additional_items.parse(ITEMS)).toEqual(ITEMS);
    expect(() => relatorioSetupSchema.shape.additional_items.parse([1])).toThrow();
    expect(standardSnapshot('v18').relatorio.setup.additional_items).toEqual([]);
  });

  it('a blank row is never stored nor printed; the order is kept; remove and compare', () => {
    expect(additionalItemsWithoutBlanks([ITEMS[0]!, '', '   ', ITEMS[1]!, '\n'])).toEqual([ITEMS[0], ITEMS[1]]);
    expect(printedAdditionalItems([ITEMS[1]!, ' ', ITEMS[0]!])).toEqual([ITEMS[1], ITEMS[0]]);
    expect(printedAdditionalItems(undefined)).toEqual([]);
    expect(withoutAdditionalItem(ITEMS, 1)).toEqual([ITEMS[0], ITEMS[2]]);
    expect(sameAdditionalItems([ITEMS[0]!], [ITEMS[0]!])).toBe(true);
    expect(sameAdditionalItems([ITEMS[0]!, ITEMS[1]!], [ITEMS[1]!, ITEMS[0]!])).toBe(false);
  });

  it('is written under relatorio.fill, each text capped as the long texts', () => {
    expect(SETUP_FILL_FIELDS).toContain('additional_items');
    expect(SETUP_CREATE_FIELDS).not.toContain('additional_items');
    expect(permissionForPath(relatorioSetupPath('additional_items'), { kind: 'put', value: ITEMS })).toBe('relatorio.fill');
    expect(textCapOf('relatorio/setup', 'additional_items')).toBe(TEXT_CAPS.long);
    const op = (value: unknown) => ({ kind: 'put', path: relatorioSetupPath('additional_items'), value }) as never;
    const path = { family: 'relatorio/setup', field: 'additional_items' } as never;
    expect(opValueIssue(op(ITEMS), path)).toBeNull();
    expect(opValueIssue(op(['x'.repeat(TEXT_CAPS.long)]), path)).toBeNull();
    expect(opValueIssue(op(['x'.repeat(TEXT_CAPS.long + 1)]), path)).not.toBeNull();
  });

  it('is offered on v18 only', () => {
    expect(offersAdditionalItems('v18')).toBe(true);
    for (const version of ['v1', 'v14', 'v15', 'v16', 'v17']) expect(offersAdditionalItems(version), version).toBe(false);
  });

  it('section 10 on v18: zero items is v17\'s list; one and three print as topics after the fixed items, in order, before the validity line', () => {
    const v18 = standardSnapshot('v18');
    const fixed = section10(v18).bullets;
    expect(fixed.map((bullet) => bullet.text)).toEqual(section10({ ...v18, relatorio: { ...v18.relatorio, seed_version: 'v17' } }).bullets.map((bullet) => bullet.text));
    for (const items of [[ITEMS[0]!], ITEMS]) {
      const printed = section10(withItems(v18, items));
      expect(printed.bullets.slice(0, fixed.length)).toEqual(fixed);
      expect(printed.bullets.slice(fixed.length)).toEqual(items.map((text) => ({ kind: 'item', text, runs: [{ text }] })));
      expect(printed.validityLine).toBe(section10(v18).validityLine);
    }
    // A blank row that reached the store from elsewhere does not print.
    expect(section10(withItems(v18, [' ', ITEMS[2]!])).bullets.slice(fixed.length).map((bullet) => bullet.text)).toEqual([ITEMS[2]]);
  });

  it('a v17 relatório holding items prints section 10 as without them', () => {
    const v17 = standardSnapshot('v17');
    expect(section10(withItems(v17, ITEMS))).toEqual(section10(v17));
  });
});

describe('28.10-UNIT the fixed texts of v18 and the applied band', () => {
  const v18 = layoutLockEpic25Snapshot('v18');
  const v17 = layoutLockEpic25Snapshot('v17');
  const withoutMalha = (snapshot: RelatorioSnapshot): RelatorioSnapshot => ({ ...snapshot, blocks: snapshot.blocks.filter((block) => block.block_type !== 'malha_aterramento') });

  it('the Epic 25 fixture holds a live Malha; without its block, or with it removed, it holds none', () => {
    expect(holdsMalhaSheet(v18)).toBe(true);
    expect(holdsMalhaSheet(withoutMalha(v18))).toBe(false);
    const removed = { ...v18, blocks: v18.blocks.map((block) => (block.block_type === 'malha_aterramento' ? { ...block, removed_at: '2026-12-02T10:00:00.000Z' } : block)) };
    expect(holdsMalhaSheet(removed)).toBe(false);
  });

  it('section 1 reads "de ⟨cliente⟩" on v18, "da ⟨cliente⟩" on v17', () => {
    // The fixture names no client, so the variable prints as its missing label; the preposition is the seed's.
    const first = (snapshot: RelatorioSnapshot) => paragraphsOf(sectionOf(snapshot, 1))[0]!;
    expect(first(v18)).toMatch(/Transformação de \S.*, unidade /u);
    expect(first(v18)).not.toContain('Transformação da ');
    expect(first(v17)).toMatch(/Transformação da \S.*, unidade /u);
  });

  it('section 2 on v18 prints the paragraph after the insulation one with a Malha, none without; v17 never', () => {
    const date = '2026-12-10';
    const seeded = sectionText('v18', 2, date);
    const at = seeded.findIndex((block) => block.text.startsWith('Resistência de Isolação:'));
    const withMalha = section2Blocks('v18', date, true);
    expect(withMalha).toEqual([...seeded.slice(0, at + 1), { kind: 'paragraph', text: EARTH_RESISTANCE_PARAGRAPH }, ...seeded.slice(at + 1)]);
    expect(withMalha[at + 2]!.text.startsWith('Obs:')).toBe(true);
    expect(section2Blocks('v18', date, false)).toEqual(seeded);
    expect(section2Blocks('v17', date, true)).toEqual(sectionText('v17', 2, date));
    expect(EARTH_RESISTANCE_PARAGRAPH).toBe('Resistência Ôhmica de Aterramento: Medir os valores de resistência de aterramento para verificar se demonstram valores dentro da margem de tolerância exigida pelas normas NBR 15749 e NBR 15751.');

    expect(paragraphsOf(sectionOf(v18, 2))).toContain(EARTH_RESISTANCE_PARAGRAPH);
    expect(paragraphsOf(sectionOf(withoutMalha(v18), 2)).some((text) => text.startsWith('Resistência Ôhmica de Aterramento'))).toBe(false);
    expect(paragraphsOf(sectionOf(v17, 2)).some((text) => text.startsWith('Resistência Ôhmica de Aterramento'))).toBe(false);
  });

  it('an own section 2 text prints as it is, with no paragraph added', () => {
    const own = 'Definições próprias deste relatório.';
    const section2Block = v18.blocks.find((block) => relatorioSectionNumber(block.block_type) === 2);
    expect(section2Block, 'the Epic 25 fixture has a section 2 block').toBeDefined();
    const snapshot: RelatorioSnapshot = { ...v18, blocks: v18.blocks.map((block) => (block === section2Block ? { ...block, config: { ...(block.config as object), section_text: own } } : block)) };
    expect(holdsMalhaSheet(snapshot)).toBe(true);
    expect(paragraphsOf(sectionOf(snapshot, 2))).toEqual([own]);
  });

  it('the band over a v15 thermography applied by hand while out of load reads Bruno\'s sentence', () => {
    let opCounter = 0;
    const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: `019966b0-0284-7000-8000-${(++opCounter).toString(16).padStart(12, '0')}` });
    const block: BlockRow = newEquipmentBlock({
      definitions: EMPTY_DEFINITION_CONTEXT,
      blockId: '019966b0-0285-7000-8000-000000000001',
      equipmentId: '019966b0-0285-7000-8000-000000000002',
      relatorioId: TEST_RELATORIO,
      projectId: TEST_PROJECT,
      locationId: '019966b0-0285-7000-8000-000000000004',
      type: 'para_raio',
      tag: 'PR-01',
      seedVersion: 'v15',
      orderKey: 'a0',
    }).block;
    const out = structuredClone(block);
    out.sheet.test.termografia = { cells: {}, values: { em_carga: cell(choiceValue('nao')) } };
    const definition = getDefinition('v15', 'cabine_primaria', 'para_raio');
    expect(testApplicability(out, definition, 'termografia')).toMatchObject({ state: 'na', reason: 'Não se aplica: Equipamento fora de carga.' });
    out.sheet.test.termografia.applicability = cell(APPLICABILITY_APPLIED);
    const applied = testApplicability(out, definition, 'termografia');
    expect(applied).toMatchObject({ state: 'applied', appliedLead: 'Ensaio aplicado por você.', appliedText: 'O app tinha marcado N.A.: equipamento fora de carga.' });
    expect(`${applied.appliedLead} ${applied.appliedText}`).toBe('Ensaio aplicado por você. O app tinha marcado N.A.: equipamento fora de carga.');
  });
});
