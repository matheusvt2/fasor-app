import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow, Cell, RelatorioParecer } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, SEED_VERSIONS } from '../seed/definitions.ts';
import type { SeedRuleFlag } from '../seed/schema.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { composeParecer, derivedParecer, parecerCounts, parecerReasonText, parecerReplacedText, parecerTextForPrint } from './parecer.ts';
import { preIssue } from './pre-issue.ts';
import { progress } from './progress.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { sumarioRows } from './sumario.ts';

/*
 * 27.3-UNIT (batch e27a, Story 27.3, F7 of the 2026-11-21 pass): an open ficha whose floor is Reprovado is
 * named apart from the concluded reprovadas on screen, on every seed; the minimum Não apto stays; a chosen
 * verdict replaced by a stricter one says so in Etapa 6 and the Sumário; the print of a seed that does not
 * turn `parecer_open_apart` on keeps its bytes. Every value is invented.
 */

const on = vi.hoisted(() => new Set<string>());
vi.mock('../seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../seed/definitions.ts')>();
  return { ...actual, seedRule: (version: string, flag: SeedRuleFlag) => (on.has(flag) ? true : actual.seedRule(version, flag)) };
});

afterEach(() => on.clear());

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

/** Every equipment sheet but `keep` removed, so the parecer reads those alone. */
function only(snapshot: RelatorioSnapshot, keep: readonly string[]): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (isEquipmentBlock(block) && !keep.includes(block.id) ? { ...block, removed_at: '2026-11-21T10:00:00.000Z' } : block)) };
}

function edit(snapshot: RelatorioSnapshot, blockId: string, fn: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === blockId ? fn(structuredClone(block)) : block)) };
}

/** Contact resistance on the three poles; 310 µΩ is out of the breaker's < 250 µΩ criterion. */
function contacts(block: BlockRow, a: string): BlockRow {
  const test = block.sheet.test['resistencia_contato'] ?? { cells: {} };
  const values = [a, '200', '205'];
  values.forEach((raw, row) => {
    test.cells[String(row)] = { ...test.cells[String(row)], '0': cell(measured(raw, 'µΩ')) };
  });
  block.sheet.test['resistencia_contato'] = test as BlockRow['sheet']['test'][string];
  return block;
}

function stored(block: BlockRow, result: 'aprovado' | 'reprovado', concluded: boolean): BlockRow {
  block.sheet.conclusion.result = cell(result);
  block.sheet.conclusion.restriction = cell(result === 'aprovado' ? 'sem_restricoes' : null);
  return concluded ? { ...block, concluded_by: CONCLUDED } : block;
}

function withParecer(snapshot: RelatorioSnapshot, verdict: RelatorioParecer['verdict']): RelatorioSnapshot {
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, parecer: { verdict, text: null, text_status: null, text_basis: null } } } };
}

const row10Meta = (snapshot: RelatorioSnapshot): string => {
  const computed = progress(snapshot);
  return sumarioRows(snapshot, preIssue(snapshot, computed), computed).find((row) => row.rowKey === 'section_10')!.meta;
};

/** One v16 relatório holding only its first two breakers; `a` is open with a reading out, `b` as `bState` leaves it. */
function state(bState: 'none' | 'aprovado' | 'reprovado' | 'open-out' | 'open-stored-reprovado', seedVersion = 'v16') {
  const base = relatorioOf(seedVersion);
  const [a, b] = breakers(base) as [BlockRow, BlockRow];
  let snapshot = only(base, [a.id, b.id]);
  snapshot = edit(snapshot, a.id, (block) => contacts(block, '310'));
  if (bState === 'aprovado') snapshot = edit(snapshot, b.id, (block) => stored(contacts(block, '200'), 'aprovado', true));
  if (bState === 'reprovado') snapshot = edit(snapshot, b.id, (block) => stored(contacts(block, '310'), 'reprovado', true));
  if (bState === 'open-out') snapshot = edit(snapshot, b.id, (block) => contacts(block, '320'));
  if (bState === 'open-stored-reprovado') snapshot = edit(snapshot, b.id, (block) => stored(contacts(block, '100'), 'reprovado', false));
  if (bState === 'none') snapshot = only(snapshot, [a.id]);
  return { snapshot, a: tagOf(base, a), b: tagOf(base, b) };
}

describe('27.3-UNIT an open ficha with a reading out of criterion is named apart from the reprovadas', () => {
  it('one open ficha out, none concluded: Não apto, the open sentence and Critérios item, no "reprovada" word', () => {
    const { snapshot, a } = state('none');
    expect(derivedParecer(snapshot)).toBe('nao_apto');
    expect(parecerCounts(snapshot)).toMatchObject({ reprovado: [a], openOut: [a] });
    const composed = composeParecer(snapshot);
    expect(composed.text).toBe(`Foi registrada 1 ficha de ensaio: 1 ainda não concluída. 1 ficha em aberto com leitura fora do critério: ${a}.`);
    expect(composed.text).not.toMatch(/reprovad/);
    expect(composed.criteriaItems).toEqual(['1 ficha', '0 concluídas', `em aberto com leitura fora do critério (${a})`]);
    expect(parecerReasonText(snapshot)).toBe(`O relatório exige no mínimo Não apto: 1 ficha em aberto com leitura fora do critério (${a}).`);
    expect(parecerReplacedText(snapshot)).toBeNull();
  });

  it('two open fichas out: the plural sentence names both', () => {
    const { snapshot, a, b } = state('open-out');
    expect(composeParecer(snapshot).text).toBe(`Foram registradas 2 fichas de ensaio: 2 ainda não concluídas. 2 fichas em aberto com leitura fora do critério: ${a} e ${b}.`);
    expect(composeParecer(snapshot).criteriaItems).toContain(`em aberto com leitura fora do critério (${a}, ${b})`);
    expect(parecerReasonText(snapshot)).toBe(`O relatório exige no mínimo Não apto: 2 fichas em aberto com leitura fora do critério (${a} e ${b}).`);
  });

  it('one concluded Reprovado and one open out: each in its own sentence, the reprovada first', () => {
    const { snapshot, a, b } = state('reprovado');
    const { text, criteriaItems } = composeParecer(snapshot);
    const reprovada = text.indexOf('1 ficha foi reprovada');
    const open = text.indexOf(`1 ficha em aberto com leitura fora do critério: ${a}.`);
    expect(reprovada).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(reprovada);
    expect(text.slice(reprovada, open)).toContain(b);
    expect(text.slice(reprovada, open)).not.toContain(a);
    expect(criteriaItems).toContain(`1 reprovada (${b})`);
    expect(criteriaItems).toContain(`em aberto com leitura fora do critério (${a})`);
    expect(parecerReasonText(snapshot)).toBe(`O relatório exige no mínimo Não apto: 1 ficha reprovada (${b}) e 1 ficha em aberto com leitura fora do critério (${a}).`);
  });

  it('a concluded Aprovado ficha is named in neither sentence', () => {
    const { snapshot, a, b } = state('aprovado');
    const { text } = composeParecer(snapshot);
    expect(text).toBe(`Foram registradas 2 fichas de ensaio: 1 concluída e 1 ainda não concluída. 1 ficha em aberto com leitura fora do critério: ${a}.`);
    expect(text).not.toContain(b);
  });

  it('an open ficha whose Reprovado is only stored, with no floor, stays among the reprovadas', () => {
    const { snapshot, a, b } = state('open-stored-reprovado');
    expect(parecerCounts(snapshot).openOut).toEqual([a]);
    expect(composeParecer(snapshot).criteriaItems).toContain(`1 reprovada (${b})`);
  });

  it('the replaced choice: a stored Apto under the derived Não apto says so in one line, in Etapa 6 and in the Sumário row 10', () => {
    const { snapshot, a } = state('none');
    const chosen = withParecer(snapshot, 'apto');
    const line = `O parecer escolhido (Apto) foi substituído por Não apto: 1 ficha em aberto com leitura fora do critério (${a}).`;
    expect(parecerReplacedText(chosen)).toBe(line);
    expect(row10Meta(chosen)).toBe(`Não apto · ${line}`);
    // A stored verdict not looser than the derived one replaces nothing: the row reads the verdict alone.
    expect(parecerReplacedText(withParecer(snapshot, 'nao_apto'))).toBeNull();
    expect(row10Meta(withParecer(snapshot, 'nao_apto'))).toBe('Não apto');
    expect(row10Meta(snapshot)).toBe('Não apto');
  });

  it('the replaced choice under a derived Apto com restrições lists its parts', () => {
    const base = relatorioOf('v16');
    const [a] = breakers(base) as [BlockRow];
    const restricted = edit(only(base, [a.id]), a.id, (block) => ({ ...block, not_tested: { reason: 'impossibilidade_desligamento', text: null, at: CONCLUDED.at, by: TEST_USER } }));
    expect(parecerReplacedText(withParecer(restricted, 'apto'))).toBe('O parecer escolhido (Apto) foi substituído por Apto com restrições: 1 não ensaiada.');
  });
});

describe('27.3-UNIT the print keeps its bytes unless the seed turns parecer_open_apart on', () => {
  // Story 27.8 (batch e27b): seed v17 turns the flag on; every older seed leaves it off.
  // Seed v18 (batch e28a) opens equal to v17 and keeps the flag.
  it('no shipped seed but v17 (and v18) turns the flag on', async () => {
    const actual = await vi.importActual<typeof import('../seed/definitions.ts')>('../seed/definitions.ts');
    for (const version of Object.keys(SEED_VERSIONS)) expect(actual.seedRule(version, 'parecer_open_apart'), version).toBe(version === 'v17' || version === 'v18');
  });

  it('v16, flag off: parecerTextForPrint is the sentence printed before Story 27.3', () => {
    const { snapshot, a } = state('none');
    expect(parecerTextForPrint(snapshot)).toBe(`Foi registrada 1 ficha de ensaio: 1 ainda não concluída. 1 ficha foi reprovada: ${a}, por resistência de contato máxima de 310 µΩ em T1-T2–Fase A (critério: <250 µΩ, aceitável na ficha).`);
    expect(composeParecer(snapshot, { print: true }).criteriaItems).toEqual(['1 ficha', '0 concluídas', `1 reprovada (${a})`]);
  });

  it('flag off with no open ficha out: the print and the screen compose the same text and basis', () => {
    const { snapshot } = state('aprovado');
    const concluded = edit(snapshot, breakers(snapshot)[0]!.id, (block) => stored(block, 'reprovado', true));
    expect(composeParecer(concluded, { print: true })).toEqual(composeParecer(concluded));
  });

  // Story 27.8 (batch e27b, 27.8-UNIT): seed v17 turns the flag on as shipped (no mock), so a v17 relatório prints Story
  // 27.3's sentence; the v16 one beside it keeps the sentence printed before Story 27.3 (the test above).
  it('v17, as shipped: the print names the open ficha apart, as the screen does; v16 keeps its printed sentence', () => {
    expect(on.size).toBe(0);
    const v17 = state('none', 'v17');
    expect(v17.snapshot.relatorio.seed_version).toBe('v17');
    expect(parecerTextForPrint(v17.snapshot)).toBe(`Foi registrada 1 ficha de ensaio: 1 ainda não concluída. 1 ficha em aberto com leitura fora do critério: ${v17.a}.`);
    expect(composeParecer(v17.snapshot, { print: true })).toEqual(composeParecer(v17.snapshot));
    const v16 = state('none');
    expect(parecerTextForPrint(v16.snapshot)).toMatch(/1 ficha foi reprovada: /);
    expect(parecerTextForPrint(v16.snapshot)).not.toMatch(/em aberto/);
  });

  it('flag on: the print equals the screen', () => {
    on.add('parecer_open_apart');
    for (const kind of ['none', 'reprovado', 'open-out'] as const) {
      const { snapshot } = state(kind);
      expect(parecerTextForPrint(snapshot), kind).toBe(composeParecer(snapshot).text);
      expect(composeParecer(snapshot, { print: true }), kind).toEqual(composeParecer(snapshot));
    }
  });
});
