import { describe, expect, it } from 'vitest';
import { makeOp, type Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { composeConclusion, findingClauses } from '../relatorio/conclusion.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { readingSlotsOf } from '../print/reading-slots.ts';
import { cellAddressesOf, evaluateTest } from '../relatorio/readings.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import { NO_VISIT_CONTEXT, type VisitContext } from '../relatorio/visit-context.ts';
import { companyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, definitionContext, EMPTY_DEFINITION_CONTEXT, findDefinition, getDefinition, seedRule } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { opValueIssue, TEXT_CAPS } from '../ops/value-limits.ts';
import { parsePath } from '../ops/path.ts';
import { newPointRow } from './checks.ts';
import { duplicateSeededType, typeVersionRow } from '../types/duplicate.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { sheetPointFindings, type SheetPointFinding } from './derived.ts';

/*
 * 25.10-UNIT (batch e25c, Story 25.10, M14 and Matheus's M-6): on seed v15 (`names_every_reading_out`) the
 * text a point starts with when it is created from a test names every reading of that test out of its
 * criterion in row order, each with its value, and the criterion once ("⟨Ensaio⟩ fora do critério
 * (⟨critério⟩): ⟨linha⟩ ⟨valor⟩; ⟨linha⟩ ⟨valor⟩."), within the point text's cap; the conclusion paragraph
 * and the parecer's Reprovado sentence (`findingClauses`) name each of them with its place, value and reason.
 * v14 names the worst one, as before. Every value is invented.
 */

const id = (n: number) => `019966b0-2510-7000-8000-${n.toString(16).padStart(12, '0')}`;
const TYPE_ID = id(1);
const TYPE_VERSION_ID = id(2);
const COPY_BLOCK = id(3);
const COPY_EQUIPMENT = id(4);

let opSeq = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opSeq) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function fresh(version: string): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-2510-7100-8000-000000000001', seedVersion: version }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId: idSequence('019966b0-2510-7200-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-2510-7300-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

function seededOf(snapshot: RelatorioSnapshot, type: string): BlockRow {
  const node = sheetOrder(snapshot).find((one) => snapshot.blocks.find((block) => block.id === one.blockId)?.block_type === type)!;
  return snapshot.blocks.find((block) => block.id === node.blockId)!;
}

/** The relatório with its seeded sheet of `type` edited by `fn`. */
function editSeeded(snapshot: RelatorioSnapshot, type: EquipmentBlockType, fn: (block: BlockRow) => void): { snapshot: RelatorioSnapshot; block: BlockRow } {
  const target = seededOf(snapshot, type);
  const next = structuredClone(target);
  fn(next);
  return { snapshot: { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === target.id ? next : block)) }, block: next };
}

function cells(block: BlockRow, testKey: string, values: Record<string, unknown>): void {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(values)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  block.sheet.test[testKey] = test;
}

/** The switch's three contact poles, in row order. */
function poles(block: BlockRow, values: readonly string[]): void {
  const addresses = cellAddressesOf(findDefinition(block.seed_version, 'chave_seccionadora')!, 'resistencia_contato');
  cells(block, 'resistencia_contato', Object.fromEntries(values.map((value, i) => [`${addresses[i]!.row}/${addresses[i]!.col}`, measured(value, 'µΩ')])));
}

const definitionOf = (block: BlockRow): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
const contactOf = (block: BlockRow, visit: VisitContext = NO_VISIT_CONTEXT) => {
  const definition = definitionOf(block);
  return evaluateTest(block, definition, definition.tests.find((test) => test.key === 'resistencia_contato')!, visit);
};
/** Where each pole is, as the sentences name it ("T1-T2"), in row order. */
const wheres = (block: BlockRow): string[] => {
  const test = contactOf(block);
  return test.tables.flatMap((table) => table.rows.map((row) => row.connection.filter((text) => text !== '').slice(0, 2).join('–')));
};

const SWITCH = 'chave_seccionadora' as const;
const contactFinding = (snapshot: RelatorioSnapshot, blockId: string): SheetPointFinding | undefined => sheetPointFindings(snapshot, blockId).find((one) => one.testKey === 'resistencia_contato');

describe('25.10-UNIT the seed: v15 turns `names_every_reading_out` on; v14 does not', () => {
  it('reads the flag on v15 only', () => {
    expect(seedRule('v15', 'names_every_reading_out')).toBe(true);
    expect(seedRule('v14', 'names_every_reading_out')).toBe(false);
  });
});

describe('25.10-UNIT a point started from a seeded test names every reading out of its criterion', () => {
  it('a v15 switch at 273, 266 and 548 µΩ against < 250 µΩ: the three poles in row order with their values, the criterion once', () => {
    const { snapshot, block } = editSeeded(fresh('v15'), SWITCH, (one) => poles(one, ['273', '266', '548']));
    const [a, b, c] = wheres(block);
    const test = contactOf(block);
    const finding = contactFinding(snapshot, block.id)!;
    expect(finding).toMatchObject({ origin: 'reading', testKey: 'resistencia_contato', place: 'test', positions: [] });
    expect(finding.text).toBe(`${test.title} fora do critério (${test.criterionText}): ${a} 273 µΩ; ${b} 266 µΩ; ${c} 548 µΩ.`);
    expect(finding.text.split(test.criterionText)).toHaveLength(2);
  });

  it('one reading out on v15: the same form with one row', () => {
    const { snapshot, block } = editSeeded(fresh('v15'), SWITCH, (one) => poles(one, ['100', '548', '90']));
    const [, b] = wheres(block);
    const test = contactOf(block);
    expect(contactFinding(snapshot, block.id)!.text).toBe(`${test.title} fora do critério (${test.criterionText}): ${b} 548 µΩ.`);
  });

  it('a v14 switch with the same three poles names the worst one, as today', () => {
    const { snapshot, block } = editSeeded(fresh('v14'), SWITCH, (one) => poles(one, ['273', '266', '548']));
    const [, , c] = wheres(block);
    const test = contactOf(block);
    expect(contactFinding(snapshot, block.id)!.text).toBe(`${test.title}: 548 µΩ em ${c} (critério: ${test.criterionText})`);
  });

  it('a ratio table names each row out as its deviation (the TC at 41 and 39 against 200/5 A, class 0,3)', () => {
    const build = (version: string) =>
      editSeeded(fresh(version), 'tc', (block) => {
        block.sheet.nameplate.exatidao = cell('0,3');
        const definition = findDefinition(version, 'tc')!;
        const rows = definition.tests.find((test) => test.key === 'relacao_transformacao')!.tables[0]!.rows.length;
        const values: Record<string, unknown> = {};
        for (let row = 0; row < Math.min(rows, 2); row += 1) {
          values[`${row}/0`] = measured('200', 'A');
          values[`${row}/1`] = measured('5', 'A');
          values[`${row}/3`] = measured(row === 0 ? '41' : '39', null);
        }
        cells(block, 'relacao_transformacao', values);
      });
    const v15 = build('v15');
    const text = sheetPointFindings(v15.snapshot, v15.block.id).find((one) => one.testKey === 'relacao_transformacao')?.text ?? '';
    expect(text).toMatch(/^Ensaio de relação de transformação fora do critério \(.+\): .+ desvio de [0-9,]+ %(; .+ desvio de [0-9,]+ %)*\.$/);
    const v14 = build('v14');
    expect(sheetPointFindings(v14.snapshot, v14.block.id).find((one) => one.testKey === 'relacao_transformacao')?.text).toMatch(/^Ensaio de relação de transformação: desvio de /);
  });

  it('a failed prerequisite beside out readings: the readings, then the prerequisite as a sentence of its own (the arrester, Desligador íntegro: NÃO)', () => {
    const build = (version: string) =>
      editSeeded(fresh(version), 'para_raio', (block) => {
        block.sheet.nameplate.desligador_integro = cell('NÃO');
        const addresses = cellAddressesOf(findDefinition(version, 'para_raio')!, 'isolacao');
        cells(block, 'isolacao', Object.fromEntries(addresses.slice(0, 2).map((address) => [`${address.row}/${address.col}`, measured('100', 'MΩ')])));
      });
    const v15 = build('v15');
    const text = sheetPointFindings(v15.snapshot, v15.block.id).find((one) => one.testKey === 'isolacao')?.text ?? '';
    expect(text).toMatch(/^Ensaio de isolação fora do critério \(.+\): .+ 100 MΩ; .+ 100 MΩ\. Pré-requisito não atendido \(Desligador íntegro: NÃO\)\.$/);
    const v14 = build('v14');
    expect(sheetPointFindings(v14.snapshot, v14.block.id).find((one) => one.testKey === 'isolacao')?.text).toMatch(/^Ensaio de isolação: pré-requisito não atendido \(Desligador íntegro: NÃO\); 100 MΩ em /);
  });

  it('a prerequisite failed alone on v15 keeps the text it had (no reading out to list)', () => {
    const build = (version: string) => editSeeded(fresh(version), 'para_raio', (block) => void (block.sheet.nameplate.desligador_integro = cell('NÃO')));
    const v15 = build('v15');
    const v14 = build('v14');
    expect(sheetPointFindings(v15.snapshot, v15.block.id)).toEqual(sheetPointFindings(v14.snapshot, v14.block.id));
  });

  it('a restricted test keeps the list it has (the cable at 5, 5 and 1,5 GΩ)', () => {
    const build = (version: string) =>
      editSeeded(fresh(version), 'cabos_entrada', (block) => {
        const [a, b, c] = cellAddressesOf(findDefinition(version, 'cabos_entrada')!, 'isolacao');
        cells(block, 'isolacao', { [`${a!.row}/${a!.col}`]: measured('5', 'GΩ'), [`${b!.row}/${b!.col}`]: measured('5', 'GΩ'), [`${c!.row}/${c!.col}`]: measured('1.5', 'GΩ') });
      });
    const v15 = build('v15');
    const v14 = build('v14');
    const [r15] = sheetPointFindings(v15.snapshot, v15.block.id);
    const [r14] = sheetPointFindings(v14.snapshot, v14.block.id);
    expect(r15).toMatchObject({ origin: 'restricao' });
    expect(r15!.text).toBe(r14!.text);
  });
});

// --- measurement tests: a company copy of the library CTA ----------------------------------------

const CTA = 'chave_transferencia_automatica' as const;
const E2 = 'cta_isolamento_principal';

/** The relatório with a company copy of the CTA (version 1) beside the cable; `rows` replaces its main insulation table's rows when given. */
function withCta(version: string, rows?: number): { snapshot: RelatorioSnapshot; definition: CompanyTypeDefinition } {
  const snapshot = fresh(version);
  const draft = duplicateSeededType(version, CTA).draft;
  const definition: CompanyTypeDefinition =
    rows === undefined
      ? draft
      : {
          ...draft,
          measurement_tests: draft.measurement_tests!.map((test) => (test.key !== E2 ? test : { ...test, rows: Array.from({ length: rows }, (_, i) => ({ ...test.rows[0]!, key: `linha_${i + 1}`, label: `Linha ${i + 1}` })) })),
        };
  const row: EquipmentTypeVersionRow = typeVersionRow({ id: TYPE_VERSION_ID, type: { id: TYPE_ID, latest_version: 0 }, definition, publishedBy: TEST_USER, publishedAt: T0.toISOString() });
  const { block, equipment } = newEquipmentBlock({
    definitions: definitionContext([row]),
    blockId: COPY_BLOCK,
    equipmentId: COPY_EQUIPMENT,
    relatorioId: snapshot.relatorio.id,
    projectId: TEST_PROJECT,
    locationId: seededOf(snapshot, 'cabos_entrada').location_id!,
    type: companyBlockType(TYPE_ID),
    tag: 'CTA-01',
    seedVersion: version,
    orderKey: 'z0',
    typeVersion: { version: 1, id: TYPE_VERSION_ID },
  });
  const config = block.config as { options?: Record<string, string> };
  config.options = { ...config.options, tensao: 'mt' };
  return { snapshot: { ...snapshot, equipment_types: [row], equipment: [...snapshot.equipment, equipment], blocks: [...snapshot.blocks, block] }, definition };
}

/** The copy with `count` of its main insulation table's rows at 1 MΩ, in the closed column. */
function ctaOut(version: string, count: number, rows?: number): RelatorioSnapshot {
  const { snapshot, definition } = withCta(version, rows);
  const test = definition.measurement_tests!.find((one) => one.key === E2)!;
  const col = test.columns.findIndex((one) => one.key === 'normal_fechada');
  return {
    ...snapshot,
    blocks: snapshot.blocks.map((block) => {
      if (block.id !== COPY_BLOCK) return block;
      const next = structuredClone(block);
      cells(next, E2, Object.fromEntries(Array.from({ length: count }, (_, row) => [`${row}/${col}`, measured('1', 'MΩ')])));
      return next;
    }),
  };
}

const ctaFinding = (snapshot: RelatorioSnapshot) => sheetPointFindings(snapshot, COPY_BLOCK).find((one) => one.testKey === E2);

describe('25.10-UNIT a point started from a measurement test names every cell out', () => {
  it('two cells out on v15: both in row order, the criterion once; v14 names one', () => {
    const v15 = ctaFinding(ctaOut('v15', 2))!.text;
    expect(v15).toMatch(/^[^:(]+ fora do critério \([^)]+\): .+ 1 MΩ; .+ 1 MΩ\.$/);
    const v14 = ctaFinding(ctaOut('v14', 2))!.text;
    expect(v14).toMatch(/^[^:]+: 1 MΩ em .+ \(critério: .+\)$/);
  });

  it('one cell out on v15: one row', () => {
    expect(ctaFinding(ctaOut('v15', 1))!.text).toMatch(/^[^:(]+ fora do critério \([^)]+\): [^;]+ 1 MΩ\.$/);
  });

  it('more readings out than the point text holds: the text ends with the count of those left out, within the cap, and the server accepts its create', () => {
    const total = 2500;
    const text = ctaFinding(ctaOut('v15', total, total))!.text;
    expect(text.length).toBeLessThanOrEqual(TEXT_CAPS.long);
    const match = /; e mais (\d+) leituras\.$/.exec(text);
    expect(match, text.slice(-80)).not.toBeNull();
    const shown = text.split('; ').length - 1;
    expect(shown + Number(match![1])).toBe(total);
    // One more row would not have fit.
    expect(text.length + `; Linha ${shown + 1}, Normal fechada 1 MΩ`.length).toBeGreaterThan(TEXT_CAPS.long - 30);
    // The server's own check of a create (`opValueIssue`, run by the sync route's apply): the point the editor
    // stores with that text is accepted; one character more past the cap would be refused.
    const snapshot = ctaOut('v15', total, total);
    const createOf = (body: string): Op => {
      const row = newPointRow({ id: id(700), relatorioId: snapshot.relatorio.id, text: body, equipmentId: COPY_EQUIPMENT, origin: 'reading', action: null, testKey: E2 }, snapshot.points);
      return makeOp(
        { kind: 'create', scope: 'relatorio', company_id: TEST_COMPANY, project_id: null, relatorio_id: snapshot.relatorio.id, path: `point/${row.id}`, value: row, prev_op_id: null, batch_id: null, meta: null, actor_id: TEST_USER, device_id: 'tablet-test' },
        { newId: idSequence('019966b0-2510-7600-8000-'), now: T0 },
      );
    };
    const accepted = createOf(text);
    expect(opValueIssue(accepted, parsePath(accepted.path))).toBeNull();
    const refused = createOf('x'.repeat(TEXT_CAPS.long + 1));
    expect(opValueIssue(refused, parsePath(refused.path))).not.toBeNull();
  });
});

// --- the conclusion paragraph and the parecer's Reprovado sentence (M-6) --------------------------

/** A previous visit issued on v15 with the switch's contact poles `values`. */
function previous(values: readonly string[]): VisitContext {
  const keys = readingSlotsOf(getDefinition('v15', 'cabine_primaria', SWITCH))
    .filter((slot) => slot.testKey === 'resistencia_contato')
    .map((slot) => slot.key);
  return {
    ambientC: null,
    previous: {
      relatorio_id: id(900),
      revision_number: 1,
      issued_at: '2026-11-05T15:00:00.000Z',
      seed_version: 'v15',
      block_type: SWITCH,
      readings: Object.fromEntries(values.map((value, i) => [keys[i]!, measured(value, 'µΩ')])),
    },
  };
}

function switchBlock(version: string, values: readonly string[]): BlockRow {
  const block = newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(10),
    equipmentId: id(11),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(12),
    type: SWITCH,
    tag: 'SEC-01',
    seedVersion: version,
    orderKey: 'a0',
  }).block;
  const next = structuredClone(block);
  poles(next, values);
  return next;
}

describe('25.10-UNIT M-6: the conclusion and section 10 name every reading out on v15', () => {
  // Pole A 273 µΩ out; pole B 61 µΩ within < 250 µΩ but out by its rise over 40 µΩ; pole C 300 µΩ out.
  const VALUES = ['273', '61', '300'];
  const BEFORE = ['260', '40', '290'];

  it('two readings out of the criterion and a third out by its rise: each named with its place, value and reason, in row order', () => {
    const visit = previous(BEFORE);
    const block = switchBlock('v15', VALUES);
    const test = contactOf(block, visit);
    const captures = test.tables.flatMap((table) => table.rows.map((row) => row.cells.find((one) => one.role === 'capture')!));
    expect(captures.map((one) => one.verdict)).toEqual(['out', 'out', 'out']);
    const rise = captures[1]!.rise!.reason;
    const [a, b, c] = wheres(block);
    const criterion = `critério: ${test.criterionText}, ${test.sourceName}`;
    const clauses = findingClauses(block, definitionOf(block), visit);
    expect(clauses).toEqual([
      `resistência de contato de 273 µΩ em ${a} (${criterion})`,
      `resistência de contato de 61 µΩ em ${b} (${rise})`,
      `resistência de contato de 300 µΩ em ${c} (${criterion})`,
    ]);
    const text = composeConclusion(block, definitionOf(block), 'SEC-01', visit).text;
    for (const clause of clauses) expect(text).toContain(clause);
    expect(text.indexOf(clauses[0]!)).toBeLessThan(text.indexOf(clauses[1]!));
    expect(text.indexOf(clauses[1]!)).toBeLessThan(text.indexOf(clauses[2]!));
  });

  it('its v14 twin names the worst one, as today', () => {
    const visit = previous(BEFORE);
    const v14 = switchBlock('v14', VALUES);
    const clauses = findingClauses(v14, definitionOf(v14), visit);
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatch(/^resistência de contato máxima de 300 µΩ em /);
    const text = composeConclusion(v14, definitionOf(v14), 'SEC-01', visit).text;
    expect(text).not.toContain('273 µΩ');
  });

  it('a single reading out on v15 reads as on v14, the qualifier kept (it is the maximum)', () => {
    const v15 = switchBlock('v15', ['100', '310', '90']);
    const v14 = switchBlock('v14', ['100', '310', '90']);
    expect(findingClauses(v15, definitionOf(v15))).toEqual(findingClauses(v14, definitionOf(v14)));
    expect(findingClauses(v15, definitionOf(v15))[0]).toMatch(/^resistência de contato máxima de 310 µΩ em /);
  });

  it('the criteria line names every reading out on v15, the worst on v14', () => {
    const v15 = switchBlock('v15', ['273', '266', '548']);
    const v14 = switchBlock('v14', ['273', '266', '548']);
    expect(composeConclusion(v15, definitionOf(v15), 'SEC-01').criteriaItems.filter((item) => item.includes('µΩ'))).toHaveLength(3);
    expect(composeConclusion(v14, definitionOf(v14), 'SEC-01').criteriaItems.filter((item) => item.includes('µΩ'))).toHaveLength(1);
  });

  it('a measurement test names every cell out in the paragraph on v15 (the CTA copy, two cells)', () => {
    const at = (version: string) => {
      const snapshot = ctaOut(version, 2);
      const block = snapshot.blocks.find((one) => one.id === COPY_BLOCK)!;
      return findingClauses(block, blockDefinitionIn(definitionContext(snapshot.equipment_types), block)!, NO_VISIT_CONTEXT);
    };
    expect(at('v15').filter((clause) => clause.includes('1 MΩ'))).toHaveLength(2);
    expect(at('v14').filter((clause) => clause.includes('1 MΩ'))).toHaveLength(1);
  });
});
