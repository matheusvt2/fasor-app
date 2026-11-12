import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition, seedRule } from '../seed/definitions.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { composeConclusion, conclusionTextState } from './conclusion.ts';
import { instantiateTemplate } from './instantiate.ts';
import { blockingRows, exportPrecheck, issueBlockedReason, parecerMissingReason, preIssue } from './pre-issue.ts';
import { progress } from './progress.ts';
import { evaluatedCells } from './readings.ts';
import { sheetReadings } from './sheet-evaluation.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { generateReason, sumarioRows } from './sumario.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * 25.7-UNIT (batch e25c, Story 25.7; M20, decision 7, and F12 by M-7). Two halves:
 * - every seed: a concluded sheet whose stored conclusion text is stale is a blocking pre-issue row (it was
 *   pending), named with the sheet it leads to; the Export dialog's reason and the Sumário's row 9 name it;
 * - seed v15 (`conclusion_names_choice_and_unmeasured`): the composed paragraph names each live test left
 *   "Não medido", says that the responsible reproved a ficha whose floor does not reprove it, and, over a sheet
 *   whose paragraph indicates no point, never recommends correcting "os pontos indicados" (F12). The basis moves
 *   with both clauses; v14 composes as before. Every value is invented.
 */

const id = (n: number) => `019966b0-0e25-7007-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const notMeasured = (unit: string | null) => ({ raw: '', unit, state: 'not_measured' as const });
const CONCLUDED = { actor_id: TEST_USER, at: '2026-11-12T12:00:00.000Z' };

const REPROVED = 'Ficha reprovada por avaliação do responsável técnico, conforme as observações.';
const RESTRICTED = 'Ficha aprovada com restrições por avaliação do responsável técnico, conforme as observações.';
const RECOMMENDATION = 'Recomenda-se a correção dos pontos indicados antes da próxima manutenção.';

function sheet(type: EquipmentBlockType, seedVersion: string): BlockRow {
  return newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'SEC-T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
}

const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function put(block: BlockRow, testKey: string, row: number, col: number, value: unknown): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  test.cells[String(row)] = { ...test.cells[String(row)], [String(col)]: cell(value) };
  next.sheet.test[testKey] = test;
  return next;
}

/** Every capture of `testKey` written `value(unit)` (a seeded table's typed cells; never a ratio input). */
function readings(block: BlockRow, testKey: string, value: (unit: string | null) => unknown): BlockRow {
  let next = block;
  for (const one of evaluatedCells(sheetReadings(block, definitionOf(block)))) {
    if (one.role === 'input' || one.address.testKey !== testKey) continue;
    next = put(next, one.address.testKey, one.address.row, one.address.col, value(one.unit));
  }
  return next;
}

/** A plate value by kind, invented; a select takes its first option. */
function plateValue(field: FieldDef, n: number): unknown {
  switch (field.kind) {
    case 'text':
      return `E25C7-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante sintético';
    case 'number':
      return measured(String(100 + n * 10), field.unit ?? null);
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options![0]!;
  }
}

/** The plate filled and every checklist row Conforme. */
function conforming(block: BlockRow): BlockRow {
  const next = structuredClone(block);
  definitionOf(block).nameplate.forEach((field, n) => {
    next.sheet.nameplate[field.key] = cell(plateValue(field, n));
  });
  for (const item of definitionOf(block).checklist ?? []) next.sheet.checklist[item.key] = { result: cell('C') };
  return next;
}

/** A checklist row NC with its observation. */
function nc(block: BlockRow, n: number, observation: string): BlockRow {
  const next = structuredClone(block);
  const item = definitionOf(block).checklist![n]!;
  next.sheet.checklist[item.key] = { result: cell('NC'), observation: cell(observation) };
  return next;
}

function stored(block: BlockRow, result: string, restriction: string | null): BlockRow {
  const next = structuredClone(block);
  next.sheet.conclusion.result = cell(result);
  next.sheet.conclusion.restriction = cell(restriction);
  return { ...next, concluded_by: CONCLUDED, sheet: { ...next.sheet, observations: cell('Observação do responsável.') } };
}

/** Within every criterion: insulation 20 GΩ, contact 40 µΩ. */
const insulationOk = (block: BlockRow) => readings(block, 'isolacao', () => measured('20', 'GΩ'));
const contactOk = (block: BlockRow) => readings(block, 'resistencia_contato', () => measured('40', 'µΩ'));
const contactUnmeasured = (block: BlockRow) => readings(block, 'resistencia_contato', (unit) => notMeasured(unit));
/** Every insulation reading out of its criterion. */
const insulationOut = (block: BlockRow) => readings(block, 'isolacao', () => measured('0.1', 'MΩ'));

const clean = (version: string) => contactOk(insulationOk(conforming(sheet('chave_seccionadora', version))));
const partly = (version: string) => contactUnmeasured(insulationOk(conforming(sheet('chave_seccionadora', version))));
const text = (block: BlockRow) => composeConclusion(block, definitionOf(block), 'SEC-T1').text;
const basis = (block: BlockRow) => composeConclusion(block, definitionOf(block), 'SEC-T1').basis;
const SUBJECT = 'A seccionadora SEC-T1 (Fabricante sintético, 15 kV';

// ===================================================================================================

describe('25.7-UNIT the seed flag', () => {
  it('v15 turns on `conclusion_names_choice_and_unmeasured`; v14 and older read it off', () => {
    expect(seedRule('v15', 'conclusion_names_choice_and_unmeasured')).toBe(true);
    for (const version of ['v14', 'v13', 'v5']) expect(seedRule(version, 'conclusion_names_choice_and_unmeasured'), version).toBe(false);
  });
});

describe('25.7-UNIT the composed paragraph on v15', () => {
  it('a test left "Não medido" is named, and "dentro dos critérios" is said only of what was measured; v14 reads as today', () => {
    const v15 = text(stored(partly('v15'), 'aprovado', 'sem_restricoes'));
    expect(v15.startsWith(SUBJECT)).toBe(true);
    expect(v15).toMatch(/ apresentou valores medidos dentro dos critérios de aceitação e todos os itens verificados conformes\. Não medido: ensaio de resistência ôhmica de contato\.$/);
    const v14 = text(stored(partly('v14'), 'aprovado', 'sem_restricoes'));
    expect(v14).toMatch(/ apresentou valores medidos dentro dos critérios de aceitação e todos os itens verificados conformes\.$/);
    expect(v14).not.toContain('Não medido');
  });

  it('a test partly measured is not named; a switched-off test is not named', () => {
    const half = put(insulationOk(conforming(sheet('chave_seccionadora', 'v15'))), 'resistencia_contato', 0, 0, notMeasured('µΩ'));
    expect(text(stored(contactOk(half), 'aprovado', 'sem_restricoes'))).not.toContain('Não medido');
    const off = structuredClone(partly('v15'));
    (off.config as { sub_blocks: Record<string, { enabled: boolean }> }).sub_blocks.resistencia_contato = { enabled: false };
    expect(text(stored(off, 'aprovado', 'sem_restricoes'))).not.toContain('Não medido');
  });

  it('a Reprovado over a clean sheet says the responsible reproved it, points to the observations and recommends nothing; v14 keeps its recommendation', () => {
    const v15 = text(stored(clean('v15'), 'reprovado', null));
    expect(v15).toMatch(/ apresentou valores medidos dentro dos critérios de aceitação e todos os itens verificados conformes\. Ficha reprovada por avaliação do responsável técnico, conforme as observações\.$/);
    expect(v15).not.toContain(RECOMMENDATION);
    const v14 = text(stored(clean('v14'), 'reprovado', null));
    expect(v14).toMatch(/ conformes\. Recomenda-se a correção dos pontos indicados antes da próxima manutenção\.$/);
    expect(v14).not.toContain(REPROVED);
  });

  it('the two clauses together: the test left out, then the Reprovado by hand', () => {
    expect(text(stored(partly('v15'), 'reprovado', null))).toMatch(/ conformes\. Não medido: ensaio de resistência ôhmica de contato\. Ficha reprovada por avaliação do responsável técnico, conforme as observações\.$/);
  });

  it('with NC items a Reprovado by hand names them, says it was the responsible\'s, and recommends correcting them', () => {
    const block = stored(nc(partly('v15'), 0, 'Isolador trincado.'), 'reprovado', null);
    expect(text(block)).toMatch(/ \(item 1, NC\)\. Não medido: ensaio de resistência ôhmica de contato\. Ficha reprovada por avaliação do responsável técnico, conforme as observações\. Recomenda-se a correção dos pontos indicados antes da próxima manutenção\.$/);
  });

  it('a failed test reproves by itself: no "by hand" sentence, the finding and the recommendation, and a test left out still named', () => {
    const failed = stored(contactUnmeasured(insulationOut(conforming(sheet('chave_seccionadora', 'v15')))), 'reprovado', null);
    const composed = text(failed);
    // Story 25.10 (seed v15): every reading out is named, so none is "the" minimum.
    expect(composed).toContain('resistência de isolação de 0,1 MΩ em ');
    expect(composed).not.toContain(REPROVED);
    expect(composed).toMatch(/\. Não medido: ensaio de resistência ôhmica de contato\. Recomenda-se a correção dos pontos indicados antes da próxima manutenção\.$/);
  });

  it('F12: Com restrições chosen over a sheet that indicates no point says it was the responsible\'s, with no recommendation; v14 keeps its text', () => {
    const v15 = text(stored(clean('v15'), 'aprovado', 'com_restricoes'));
    expect(v15).toMatch(/ conformes\. Ficha aprovada com restrições por avaliação do responsável técnico, conforme as observações\.$/);
    expect(v15).not.toContain(RECOMMENDATION);
    expect(text(stored(clean('v14'), 'aprovado', 'com_restricoes'))).toMatch(/ conformes\. Recomenda-se a correção dos pontos indicados antes da próxima manutenção\.$/);
    // Over an NC item the restriction is the floor's: the paragraph names the item and recommends its correction, as before.
    const withNc = text(stored(nc(clean('v15'), 0, 'Isolador trincado.'), 'aprovado', 'com_restricoes'));
    expect(withNc).not.toContain(RESTRICTED);
    expect(withNc.endsWith(RECOMMENDATION)).toBe(true);
  });

  it('the basis moves with each clause; a v15 sheet without them keeps the bytes v14 gives it', () => {
    expect(basis(stored(clean('v15'), 'aprovado', 'sem_restricoes'))).toBe(basis(stored(clean('v14'), 'aprovado', 'sem_restricoes')));
    // The test left out: its cells move the basis on both seeds, and v15 adds the names.
    expect(basis(stored(partly('v15'), 'aprovado', 'sem_restricoes'))).not.toBe(basis(stored(partly('v14'), 'aprovado', 'sem_restricoes')));
    // The choice: the same pair, named on v15 only.
    expect(basis(stored(clean('v15'), 'reprovado', null))).not.toBe(basis(stored(clean('v14'), 'reprovado', null)));
    expect(basis(stored(clean('v15'), 'aprovado', 'com_restricoes'))).not.toBe(basis(stored(clean('v14'), 'aprovado', 'com_restricoes')));
  });

  it('a text confirmed before the contact was set "Não medido" reads stale', () => {
    const before = stored(clean('v15'), 'aprovado', 'sem_restricoes');
    const composed = composeConclusion(before, definitionOf(before), 'SEC-T1');
    const confirmed = (block: BlockRow): BlockRow => ({ ...block, sheet: { ...block.sheet, conclusion: { ...block.sheet.conclusion, text: cell(composed.text), text_status: cell('confirmed'), text_basis: cell(composed.basis) } } });
    expect(conclusionTextState(confirmed(before), composed)).toBe('confirmed');
    const after = confirmed(contactUnmeasured(before));
    expect(conclusionTextState(after, composeConclusion(after, definitionOf(after), 'SEC-T1'))).toBe('stale');
  });
});

// --- the pre-issue row, on every seed -----------------------------------------------------------------

function relatorioOf(seedVersion: string): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0e25-7073-8000-000000000001', seedVersion }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-10', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0e25-7071-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((draft, i) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e25-7072-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

/** The relatório of `version` with its first `count` seccionadoras concluded and their texts stale, and every other sheet removed. */
function staleRelatorio(version: string, count = 1, parecer = true): { snapshot: RelatorioSnapshot; tags: string[] } {
  const snapshot = relatorioOf(version);
  const seccionadoras = snapshot.blocks.filter((block) => block.block_type === 'chave_seccionadora' && block.removed_at === null).slice(0, count);
  const ids = new Set(seccionadoras.map((block) => block.id));
  const blocks = snapshot.blocks.map((block) => {
    if (!ids.has(block.id)) return isEquipmentBlock(block) ? { ...block, removed_at: '2026-11-11T10:00:00.000Z' } : block;
    const written = stored(contactOk(insulationOk(conforming(block))), 'aprovado', 'sem_restricoes');
    // A text confirmed under a basis the values no longer compose, worded differently: stale.
    return { ...written, sheet: { ...written.sheet, conclusion: { ...written.sheet.conclusion, text: cell('Texto composto antes da mudança.'), text_status: cell('confirmed'), text_basis: cell('deadbeef') } } };
  });
  const tags = seccionadoras.map((block) => snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag);
  const setup = parecer ? { ...snapshot.relatorio.setup, parecer: { verdict: 'apto' as const, text: null, text_status: null, text_basis: null } } : snapshot.relatorio.setup;
  return { snapshot: { ...snapshot, blocks, relatorio: { ...snapshot.relatorio, setup } }, tags };
}

describe('25.7-UNIT a stale conclusion text blocks the issue on every seed', () => {
  it.each(['v5', 'v14', 'v15'])('%s: the row is blocking, names the sheet it leads to, and the Export dialog lists it as a blocker', (version) => {
    const { snapshot, tags } = staleRelatorio(version);
    const rows = preIssue(snapshot);
    const stale = rows.find((row) => row.kind === 'conclusion_stale')!;
    const blockId = snapshot.blocks.find((block) => block.block_type === 'chave_seccionadora' && block.removed_at === null)!.id;
    expect(stale).toMatchObject({ row: 'section_9', severity: 'blocking', text: `Texto de conclusão desatualizado: ${tags[0]}`, sheets: [{ blockId, name: tags[0] }] });
    expect(blockingRows(rows).map((row) => row.kind)).toEqual(['conclusion_stale']);
    const precheck = exportPrecheck(rows);
    expect(precheck.blocking.map((row) => row.kind)).toEqual(['conclusion_stale']);
    expect(precheck.explicit.some((row) => row.kind === 'conclusion_stale')).toBe(false);
  });

  it('with the text replaced (its basis and text the ones composed now) the row goes', () => {
    const { snapshot } = staleRelatorio('v15');
    const blocks = snapshot.blocks.map((block) => {
      if (block.block_type !== 'chave_seccionadora' || block.removed_at !== null) return block;
      const composed = composeConclusion(block, definitionOf(block), snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag);
      return { ...block, sheet: { ...block.sheet, conclusion: { ...block.sheet.conclusion, text: cell(composed.text), text_basis: cell(composed.basis) } } };
    });
    expect(preIssue({ ...snapshot, blocks }).some((row) => row.kind === 'conclusion_stale')).toBe(false);
    // An edit of the text stores the basis of the moment: the edited text then reads as edited, never stale.
    const edited = blocks.map((block) => (block.block_type === 'chave_seccionadora' && block.removed_at === null ? { ...block, sheet: { ...block.sheet, conclusion: { ...block.sheet.conclusion, text: cell('Texto do responsável.'), text_status: cell('edited') } } } : block));
    expect(preIssue({ ...snapshot, blocks: edited }).some((row) => row.kind === 'conclusion_stale')).toBe(false);
  });

  it('the reason beside "Gerar relatório" names the stale text alone, the parecer and the text together, and the plural', () => {
    const one = staleRelatorio('v15');
    expect(issueBlockedReason(blockingRows(preIssue(one.snapshot)), 3, 10)).toBe(`Atualize o texto da conclusão de ${one.tags[0]} para emitir a revisão 3. O rascunho pode ser visto antes.`);
    // The mock's sentence (`73-exportar.html` `#exportar-gen-blocked-reason`). A concluded sheet derives a verdict
    // (e22f S5), so the two rows meet only in principle: the reason is read over both rows as given.
    const parecerRow = { id: 'parecer_missing', row: 'section_10', severity: 'blocking', text: 'Parecer não preenchido', kind: 'parecer_missing' } as const;
    expect(issueBlockedReason([parecerRow, ...blockingRows(preIssue(one.snapshot))], 3, 10)).toBe(
      `Preencha o parecer (linha 10 do sumário) e atualize o texto da conclusão de ${one.tags[0]} para emitir a revisão 3. O rascunho pode ser visto antes.`,
    );
    // With the parecer unset the derived verdict stands: the stale text alone blocks.
    expect(blockingRows(preIssue(staleRelatorio('v15', 1, false).snapshot)).map((row) => row.kind)).toEqual(['conclusion_stale']);
    const two = staleRelatorio('v15', 2);
    expect(two.tags).toHaveLength(2);
    expect(issueBlockedReason(blockingRows(preIssue(two.snapshot)), 1, 10)).toBe(`Atualize os textos da conclusão de ${two.tags[0]} e ${two.tags[1]} para emitir a revisão 1. O rascunho pode ser visto antes.`);
    // The parecer alone reads as before; nothing blocking, no reason.
    expect(issueBlockedReason([parecerRow], 2, 10)).toBe(parecerMissingReason(2, 10));
    expect(issueBlockedReason([], 2, 10)).toBeNull();
  });

  it('the Sumário\'s row 9 draws the stale text as its blocking part, and the foot names the row', () => {
    const { snapshot, tags } = staleRelatorio('v14');
    const computed = progress(snapshot);
    const issues = preIssue(snapshot, computed);
    const rows = sumarioRows(snapshot, issues, computed);
    const row9 = rows.find((row) => row.rowKey === 'section_9')!;
    expect(row9.blocking).toBe(true);
    expect(row9.metaParts!.filter((part) => part.blocking)).toEqual([{ text: `Texto de conclusão desatualizado: ${tags[0]} — impede gerar`, blocking: true }]);
    expect(row9.meta).toBe(row9.metaParts!.map((part) => part.text).join(' · '));
    expect(rows.filter((row) => row.rowKey !== 'section_9').some((row) => row.metaParts !== undefined)).toBe(false);
    expect(generateReason(rows, issues)).toBe(`Só Relatórios dos ensaios (linha ${row9.number}) impede gerar. O resto está escrito em cada linha.`);
  });
});
