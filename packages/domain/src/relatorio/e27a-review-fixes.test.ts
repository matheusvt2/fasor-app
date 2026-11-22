import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { section10Layout } from '../print/section-10.ts';
import type { BlockRow, Cell, RelatorioParecer } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { composeParecer, parecerCounts, parecerReasonText, parecerReplacedText, parecerTextForPrint, printedParecer } from './parecer.ts';
import { isEquipmentBlock } from './sheet-state.ts';

/*
 * Fix batch e27a-review, R1 and R4 (wave 1 review of PR #345, Story 27.3). R1: the Etapa 6 summary field and the
 * box say they are what section 10 prints, so they read `printedParecer`, composed as the print composes it for
 * the relatório's seed. R4: the open fichas are told apart from the reprovadas by block id, never by name. Every
 * value is invented.
 */

let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: `019966b0-0e27-7000-8000-${(++opCounter).toString(16).padStart(12, '0')}` });
const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
const CONCLUDED = { actor_id: TEST_USER, at: '2026-11-21T12:00:00.000Z' };

function relatorioOf(seedVersion: string): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0e27-7003-8000-000000000001', seedVersion }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-20', service_end: '2026-11-21', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0e27-7001-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((draft, i) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e27-7002-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const breakers = (snapshot: RelatorioSnapshot): BlockRow[] => snapshot.blocks.filter((block) => block.block_type === 'disjuntor_mt' && block.removed_at === null);
const tagOf = (snapshot: RelatorioSnapshot, block: BlockRow): string => snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag;

function only(snapshot: RelatorioSnapshot, keep: readonly string[]): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (isEquipmentBlock(block) && !keep.includes(block.id) ? { ...block, removed_at: '2026-11-21T10:00:00.000Z' } : block)) };
}

function edit(snapshot: RelatorioSnapshot, blockId: string, fn: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === blockId ? fn(structuredClone(block)) : block)) };
}

/** Contact resistance on the three poles; 310 µΩ is out of the breaker's < 250 µΩ criterion. */
function contacts(block: BlockRow, a: string): BlockRow {
  const test = block.sheet.test['resistencia_contato'] ?? { cells: {} };
  [a, '200', '205'].forEach((raw, row) => {
    test.cells[String(row)] = { ...test.cells[String(row)], '0': cell(measured(raw, 'µΩ')) };
  });
  block.sheet.test['resistencia_contato'] = test as BlockRow['sheet']['test'][string];
  return block;
}

function concludedReprovado(block: BlockRow): BlockRow {
  block.sheet.conclusion.result = cell('reprovado');
  block.sheet.conclusion.restriction = cell(null);
  return { ...block, concluded_by: CONCLUDED };
}

function withParecer(snapshot: RelatorioSnapshot, verdict: RelatorioParecer['verdict']): RelatorioSnapshot {
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, parecer: { verdict, text: null, text_status: null, text_basis: null } } } };
}

describe('e27a-review R1: the screen text that says it prints is the printed one', () => {
  it('v16, one open ficha with a reading out: the Etapa 6 summary (printedParecer) equals the printed section 10 text', () => {
    const base = relatorioOf('v16');
    const [a] = breakers(base) as [BlockRow];
    const snapshot = edit(only(base, [a.id]), a.id, (block) => contacts(block, '310'));
    const tag = tagOf(base, a);
    const printed = section10Layout(snapshot, { number: 10, title: 'CONCLUSÃO E PARECER' }).parecer.text;
    expect(printedParecer(snapshot).text).toBe(printed);
    expect(printedParecer(snapshot).text).toBe(parecerTextForPrint(snapshot));
    // On v16 (no `parecer_open_apart`) the print names the open ficha among the reprovadas, and so does the field.
    expect(printed).toBe(`Foi registrada 1 ficha de ensaio: 1 ainda não concluída. 1 ficha foi reprovada: ${tag}, por resistência de contato máxima de 310 µΩ em T1-T2–Fase A (critério: <250 µΩ, aceitável na ficha).`);
    expect(printedParecer(snapshot).criteriaItems).toEqual(['1 ficha', '0 concluídas', `1 reprovada (${tag})`]);
    // The split stays in the lines that do not claim to print.
    expect(parecerReasonText(snapshot)).toBe(`O relatório exige no mínimo Não apto: 1 ficha em aberto com leitura fora do critério (${tag}).`);
    expect(composeParecer(snapshot).text).toContain(`1 ficha em aberto com leitura fora do critério: ${tag}.`);
  });
});

describe('e27a-review R4: open fichas and reprovadas are told apart by block id', () => {
  it('two untagged breakers named by the type label, one concluded Reprovado and one open out: both appear in the reason line and in the replaced-choice line', () => {
    const base = relatorioOf('v16');
    const [a, b] = breakers(base) as [BlockRow, BlockRow];
    const untagged = { ...base, equipment: base.equipment.map((row) => (row.id === a.equipment_id || row.id === b.equipment_id ? { ...row, tag: '' } : row)) };
    let snapshot = only(untagged, [a.id, b.id]);
    snapshot = edit(snapshot, a.id, (block) => contacts(block, '310'));
    snapshot = edit(snapshot, b.id, (block) => concludedReprovado(contacts(block, '320')));
    const counts = parecerCounts(snapshot);
    const name = counts.openOut[0]!;
    // The two fichas share one name: the type's label.
    expect(counts.reprovado).toEqual([name, name]);
    expect(counts.openOut).toEqual([name]);
    const parts = `1 ficha reprovada (${name}) e 1 ficha em aberto com leitura fora do critério (${name})`;
    expect(parecerReasonText(snapshot)).toBe(`O relatório exige no mínimo Não apto: ${parts}.`);
    expect(parecerReplacedText(withParecer(snapshot, 'apto'))).toBe(`O parecer escolhido (Apto) foi substituído por Não apto: ${parts}.`);
  });
});
