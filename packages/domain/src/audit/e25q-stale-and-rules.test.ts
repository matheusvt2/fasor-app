import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_CHAVE_ID, portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { SERVER_DEVICE_ID } from '../ids.ts';
import { makeOp, type Op } from '../ops/op.ts';
import { parsePath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { layoutSpec } from '../print/layout.ts';
import { conclusionFloorReasonText } from '../relatorio/conclusion.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { preIssue } from '../relatorio/pre-issue.ts';
import { progress } from '../relatorio/progress.ts';
import { sumarioRows } from '../relatorio/sumario.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { auditRunRowSchema, type AuditRunRow, type BlockRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, EMPTY_DEFINITION_CONTEXT, findDefinition, snapshotDefinitionContext } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import type { RelatorioStream, StreamCandidate } from '../status/edited-since.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { AUDIT_RULE_KIND_LABELS, auditRuleRows, sharedRun } from './rules.ts';
import { auditFindingSchema } from './schema.ts';
import { AUDIT_FINDING_KIND_LABELS, auditRunStale, auditSummaryText } from './text.ts';
import { validateAuditFindings } from './validate.ts';

/*
 * 25.24-UNIT (batch e25p, Story 25.24; M16 and the last part of M20, Matheus's decision 10): the
 * Conferência por IA says when it is out of date, and three checks are fixed rules of the kernel.
 * The stale test over the device's ops, the run's new key and the model's new kind in the schemas,
 * the three rules over a relatório of the standard template, and that neither a rule nor a finding
 * reaches the document, the counts or the rows before generating. Every value is invented.
 */

const ISSUED_AT = '2026-11-12T12:00:00.000Z';
const RUN_ID = '019966c1-0e25-7024-8000-00000000a0d1';
const RELATORIO = '019966c1-0e25-7024-8000-0000000000aa';
const BLOCK = '019966c1-0e25-7024-8000-0000000000b1';

function run(over: Partial<AuditRunRow> = {}): AuditRunRow {
  return {
    id: RUN_ID,
    relatorio_id: RELATORIO,
    status: 'done',
    findings: [],
    error: null,
    prompt_version: 'audit-2',
    created_at: '2026-11-12T14:30:00.000Z',
    started_at: '2026-11-12T14:30:01.000Z',
    finished_at: '2026-11-12T14:30:09.000Z',
    coverage: { sent: 1, total: 1 },
    snapshot_seq: 40,
    ...over,
  };
}

/** A run as a version-51 server wrote it: no `snapshot_seq` key at all. */
function olderRun(): AuditRunRow {
  const row: Partial<AuditRunRow> = run();
  delete row.snapshot_seq;
  return row as AuditRunRow;
}

const STREAM: RelatorioStream = { relatorioId: RELATORIO, equipmentIds: new Set() };
const op = (path: string, over: Partial<StreamCandidate> = {}): StreamCandidate => ({ path, actor_id: TEST_USER, kind: 'put', value: null, relatorio_id: RELATORIO, scope: 'relatorio', ...over });
const reading = (seq?: number) => op(`sheet/${BLOCK}/test/resistencia_contato/cell/0/0`, seq === undefined ? {} : { seq });

describe('25.24-UNIT the stale test', () => {
  it('a finished run with no edit after its point is current; a reading changed after it makes it out of date', () => {
    expect(auditRunStale(run(), [], [], STREAM)).toBe(false);
    // An op at the point is part of what the run read.
    expect(auditRunStale(run(), [reading(40)], [], STREAM)).toBe(false);
    expect(auditRunStale(run(), [reading(41)], [], STREAM)).toBe(true);
    // An edit of this device the server has not applied yet counts at once.
    expect(auditRunStale(run(), [], [reading()], STREAM)).toBe(true);
  });

  it("the run's own puts, a system op and another relatório's edit never make it stale", () => {
    const own = op(`audit_run/${RUN_ID}/status`, { seq: 45, actor_id: 'system:audit' });
    const system = op(`sheet/${BLOCK}/test/resistencia_contato/cell/0/0`, { seq: 46, actor_id: 'system:reading' });
    const other = op(`sheet/${BLOCK}/observations`, { seq: 47, relatorio_id: '019966c1-0e25-7024-8000-0000000000ab' });
    expect(auditRunStale(run(), [own, system, other], [], STREAM)).toBe(false);
  });

  it('a run written before contract 52 (no point) is out of date; a run not done, or none, is never marked', () => {
    expect(auditRunStale(olderRun(), [], [], STREAM)).toBe(true);
    expect(auditRunStale(run({ snapshot_seq: null }), [], [], STREAM)).toBe(true);
    expect(auditRunStale(run({ status: 'running' }), [reading(99)], [], STREAM)).toBe(false);
    expect(auditRunStale(null, [reading(99)], [], STREAM)).toBe(false);
  });
});

describe("25.24-UNIT the run's point and the new kind in the schemas", () => {
  it('the run row takes snapshot_seq; one written before 52 parses to the same keys (never defaulted)', () => {
    const older = olderRun();
    expect(Object.keys(auditRunRowSchema.parse(older))).not.toContain('snapshot_seq');
    expect(auditRunRowSchema.parse(older)).toEqual(older);
    expect(auditRunRowSchema.parse(run()).snapshot_seq).toBe(40);
    expect(auditRunRowSchema.safeParse(run({ snapshot_seq: -1 })).success).toBe(false);
    expect(parsePath(`audit_run/${RUN_ID}/snapshot_seq`)).toEqual({ family: 'audit_run/field', id: RUN_ID, field: 'snapshot_seq' });
  });

  it('a finding may be observation_vs_items, labelled as the frame names it, and the validator keeps it', () => {
    const finding = { kind: 'observation_vs_items', text: 'A observação cita o item 9.', ref: `sheet:${BLOCK}`, label: 'TC TC-02', target: { kind: 'sheet', blockId: BLOCK } };
    expect(auditFindingSchema.safeParse(finding).success).toBe(true);
    expect(AUDIT_FINDING_KIND_LABELS.observation_vs_items).toBe('Observação e itens');
    const { kept, dropped } = validateAuditFindings([{ kind: 'observation_vs_items', ref: `sheet:${BLOCK}`, text: 'A observação cita o item 9.' }], [
      { id: `sheet:${BLOCK}`, label: 'TC TC-02', target: { kind: 'sheet', blockId: BLOCK } },
    ]);
    expect(dropped).toEqual([]);
    expect(kept).toEqual([finding]);
  });

  it('the summary counts the rules listed beside the findings', () => {
    expect(auditSummaryText(run(), 0)).toBe('Nenhum ponto encontrado');
    expect(auditSummaryText(run(), 1)).toBe('1 ponto para conferir');
    expect(auditSummaryText(run({ findings: [auditFindingSchema.parse({ kind: 'caption_equipment', text: 'x', ref: 'photo:a', label: 'Imagem 1', target: { kind: 'photos' } })] }), 2)).toBe('3 pontos para conferir');
  });
});

// --- the three rules ------------------------------------------------------------------------------

const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });

interface Fresh {
  relatorioId: string;
  ops: Op[];
  breakers: BlockRow[];
  transformer: BlockRow;
}

function fresh(): Fresh {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0e25-7024-8000-0000000000f0' }),
    { id: TEST_PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966c1-0e25-7024-8001-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966c1-0e25-7024-8002-'), now: T0 }), seq: i + 1 }));
  const snapshot = buildSnapshot(replay(ops), relatorioId);
  const live = snapshot.blocks.filter((block) => block.removed_at === null && block.equipment_id !== null);
  return {
    relatorioId,
    ops,
    breakers: live.filter((block) => block.block_type === 'disjuntor_mt'),
    transformer: live.find((block) => block.block_type === 'transformador_forca')!,
  };
}

const newOpId = idSequence('019966c1-0e25-7024-8003-');

function withPuts(base: Fresh, puts: readonly [string, unknown][]): RelatorioSnapshot {
  const extra = puts.map(([path, value], i) => ({
    ...makeOp(
      { kind: 'put', scope: 'relatorio', company_id: TEST_COMPANY, project_id: null, relatorio_id: base.relatorioId, path, value: value as never, prev_op_id: null, batch_id: null, meta: null, actor_id: TEST_USER, device_id: 'tablet-test' },
      { newId: newOpId, now: new Date(T0.getTime() + (i + 1) * 60_000) },
    ),
    seq: base.ops.length + i + 1,
  }));
  return buildSnapshot(replay([...base.ops, ...extra]), base.relatorioId);
}

const contact = (blockId: string, values: readonly string[]): [string, unknown][] =>
  values.map((raw, row) => [`sheet/${blockId}/test/resistencia_contato/cell/${row}/0`, measured(raw, 'µΩ')]);

const labelOf = (snapshot: RelatorioSnapshot, block: BlockRow) => `Disjuntor MT ${snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag}`;

describe('25.24-UNIT the three fixed rules', () => {
  const base = fresh();

  it('the standard template carries two breakers and a transformer on seed v15', () => {
    expect(base.breakers.length).toBeGreaterThanOrEqual(2);
    expect(base.transformer.seed_version).toBe('v15');
  });

  it('a relatório with none of the three lists no rule', () => {
    expect(auditRuleRows(buildSnapshot(replay(base.ops), base.relatorioId))).toEqual([]);
    // Readings within their criterion, different on each breaker, and a secondary tested at 1 kV: still none.
    const clean = withPuts(base, [
      ...contact(base.breakers[0]!.id, ['45', '47', '46']),
      ...contact(base.breakers[1]!.id, ['52', '50', '51']),
      [`sheet/${base.transformer.id}/nameplate/tensao_nominal_bt`, measured('380', 'V')],
      [`sheet/${base.transformer.id}/test/isolacao/cell/2/5`, measured('1', 'kV')],
    ]);
    expect(auditRuleRows(clean)).toEqual([]);
  });

  it('1. a ficha concluded Aprovado whose reading was later typed out of its criterion', () => {
    const breaker = base.breakers[0]!;
    const snapshot = withPuts(base, [
      ...contact(breaker.id, ['45', '47', '46']),
      [`sheet/${breaker.id}/conclusion/result`, 'aprovado'],
      [`sheet/${breaker.id}/conclusion/restriction`, 'sem_restricoes'],
      // Later: the third reading typed out of its criterion, and the ficha not concluded again.
      [`sheet/${breaker.id}/test/resistencia_contato/cell/2/0`, measured('5000', 'µΩ')],
    ]);
    const block = snapshot.blocks.find((row) => row.id === breaker.id)!;
    const floor = conclusionFloorReasonText(block, blockDefinitionIn(snapshotDefinitionContext(snapshot), block), visitContextOf(snapshot, block));
    expect(floor).toMatch(/^A ficha exige no mínimo Reprovado/);
    const rows = auditRuleRows(snapshot);
    expect(rows).toEqual([
      {
        key: `rule:stored_result_looser:${breaker.id}`,
        kindLabel: AUDIT_RULE_KIND_LABELS.stored_result_looser,
        targetLabel: labelOf(snapshot, block),
        text: `Ficha concluída Aprovado · Sem restrições. ${floor}`,
        target: { kind: 'sheet', blockId: breaker.id },
        rule: true,
      },
    ]);
    expect(rows[0]!.kindLabel).toBe('Resultado da ficha');
    // Concluded again (Reprovado), the rule goes.
    const again = withPuts(base, [...contact(breaker.id, ['45', '47', '5000']), [`sheet/${breaker.id}/conclusion/result`, 'reprovado']]);
    expect(auditRuleRows(again)).toEqual([]);
  });

  it('1. a Reprovado ficha keeping a restriction stored before is never named against a restriction floor (review of PR #333)', () => {
    const breaker = base.breakers[0]!;
    const item = findDefinition(breaker.seed_version, 'disjuntor_mt')!.checklist![0]!.key;
    const snapshot = withPuts(base, [
      ...contact(breaker.id, ['45', '47', '46']),
      [`sheet/${breaker.id}/checklist/${item}/result`, 'NC'],
      // A restriction stored before, then Reprovado written alone (an older client, another device).
      [`sheet/${breaker.id}/conclusion/restriction`, 'sem_restricoes'],
      [`sheet/${breaker.id}/conclusion/result`, 'reprovado'],
    ]);
    const block = snapshot.blocks.find((row) => row.id === breaker.id)!;
    expect(conclusionFloorReasonText(block, blockDefinitionIn(snapshotDefinitionContext(snapshot), block), visitContextOf(snapshot, block))).toMatch(/^A ficha exige no mínimo Aprovado · Com restrições/);
    expect(auditRuleRows(snapshot)).toEqual([]);
  });

  it('2. two breakers whose contact readings are the same three values in the same order, naming both', () => {
    const [first, second] = base.breakers as [BlockRow, BlockRow];
    const snapshot = withPuts(base, [...contact(first.id, ['45', '47.5', '46']), ...contact(second.id, ['45', '47.5', '46'])]);
    const rows = auditRuleRows(snapshot);
    expect(rows).toHaveLength(1);
    const a = labelOf(snapshot, first);
    const b = labelOf(snapshot, second);
    expect(rows[0]).toMatchObject({ kindLabel: 'Valores repetidos', targetLabel: b, target: { kind: 'sheet', blockId: second.id }, rule: true });
    expect(rows[0]!.text).toBe(`Ensaio de resistência ôhmica de contato: os mesmos valores, na mesma ordem, em ${a} e ${b} (45 µΩ; 47,5 µΩ; 46 µΩ).`);
  });

  it('2. not a run: another order, two values, one repeated value, or a unit that differs', () => {
    const [first, second] = base.breakers as [BlockRow, BlockRow];
    const cases: [readonly string[], readonly string[]][] = [
      [['45', '47', '46'], ['46', '47', '45']],
      [['45', '47', '99'], ['45', '47', '12']],
      [['30', '30', '30'], ['30', '30', '30']],
    ];
    for (const [x, y] of cases) expect(auditRuleRows(withPuts(base, [...contact(first.id, x), ...contact(second.id, y)]))).toEqual([]);
    const units = withPuts(base, [
      ...contact(first.id, ['45', '47', '46']),
      ...['45', '47', '46'].map((raw, row): [string, unknown] => [`sheet/${second.id}/test/resistencia_contato/cell/${row}/0`, measured(raw, 'mΩ')]),
    ]);
    expect(auditRuleRows(units)).toEqual([]);
  });

  it('2. sharedRun finds the longest run of three or more, not all one value', () => {
    expect(sharedRun([1, 2, 3, 4, 9], [7, 2, 3, 4, 5])).toEqual([2, 3, 4]);
    expect(sharedRun([1, 2, 3, 4], [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(sharedRun([5, 5, 5, 1], [5, 5, 5, 2])).toBeNull();
    expect(sharedRun([5, 5, 5, 1], [5, 5, 5, 1])).toEqual([5, 5, 5, 1]);
    expect(sharedRun([1, 2], [1, 2])).toBeNull();
  });

  it("3. a transformer's secondary row of 380 V tested at 10 kV, in the sheet's notice", () => {
    const transformer = base.transformer;
    const snapshot = withPuts(base, [
      [`sheet/${transformer.id}/nameplate/tensao_nominal_bt`, measured('380', 'V')],
      [`sheet/${transformer.id}/test/isolacao/cell/2/5`, measured('10', 'kV')],
    ]);
    const rows = auditRuleRows(snapshot);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: `rule:voltage_above_winding:${transformer.id}:isolacao:2`, kindLabel: 'Tensão de ensaio', target: { kind: 'sheet', blockId: transformer.id }, rule: true });
    expect(rows[0]!.text).toBe('Tensão de ensaio acima do suportado pelo enrolamento Secundário (380 V): use 0,5 ou 1 kV.');
  });

  it('all three on one relatório, in tree order with the repeated runs last; nothing in the snapshot changes', () => {
    const [first, second] = base.breakers as [BlockRow, BlockRow];
    const snapshot = withPuts(base, [
      ...contact(first.id, ['45', '47', '5000']),
      ...contact(second.id, ['45', '47', '5000']),
      [`sheet/${first.id}/conclusion/result`, 'aprovado'],
      [`sheet/${first.id}/conclusion/restriction`, 'sem_restricoes'],
      [`sheet/${base.transformer.id}/nameplate/tensao_nominal_bt`, measured('380', 'V')],
      [`sheet/${base.transformer.id}/test/isolacao/cell/2/5`, measured('10', 'kV')],
    ]);
    const before = structuredClone(snapshot);
    const issues = preIssue(snapshot, progress(snapshot), { now: new Date(ISSUED_AT) });
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT, draft: true });
    const rows = auditRuleRows(snapshot);
    expect(rows.map((row) => row.kindLabel).sort()).toEqual(['Resultado da ficha', 'Tensão de ensaio', 'Valores repetidos']);
    expect(rows.at(-1)!.kindLabel).toBe('Valores repetidos');
    expect(snapshot).toEqual(before);
    expect(preIssue(snapshot, progress(snapshot), { now: new Date(ISSUED_AT) })).toEqual(issues);
    expect(layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT, draft: true })).toEqual(layout);
  });
});

describe('25.24-UNIT a rule or a finding changes nothing the relatório derives', () => {
  it('a run with its point and a finding of the new kind leaves the snapshot, the layout, the rows before generating and the Sumário equal', () => {
    const withoutState = replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds });
    const server = (path: string, kind: Op['kind'], value: unknown, n: number): Op => ({
      op_id: `019966c1-0e25-7024-8004-00000000000${n}`,
      kind,
      scope: 'relatorio',
      company_id: portoSeguroSmall.companyId,
      project_id: null,
      relatorio_id: portoSeguroSmall.relatorioId,
      path,
      value: value as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: 'system:audit',
      device_id: SERVER_DEVICE_ID,
      client_ts: ISSUED_AT,
    });
    const auditOps: Op[] = [
      server(`audit_run/${RUN_ID}`, 'create', { id: RUN_ID, relatorio_id: portoSeguroSmall.relatorioId, status: 'queued', findings: [], error: null, prompt_version: null, created_at: ISSUED_AT, started_at: null, finished_at: null, coverage: null }, 1),
      server(`audit_run/${RUN_ID}/findings`, 'put', [{ kind: 'observation_vs_items', text: 'A observação cita o item 9.', ref: `sheet:${BLOCK_CHAVE_ID}`, label: 'Chave seccionadora SEC-TEST', target: { kind: 'sheet', blockId: BLOCK_CHAVE_ID } }], 2),
      server(`audit_run/${RUN_ID}/snapshot_seq`, 'put', 123, 3),
      server(`audit_run/${RUN_ID}/status`, 'put', 'done', 4),
    ];
    const withState = replay([...portoSeguroSmall.log, ...auditOps], { deadOpIds: portoSeguroSmall.deadOpIds });
    const stored = auditRunRowSchema.parse(withState.get(`audit_run:${RUN_ID}` as never));
    expect(stored.snapshot_seq).toBe(123);
    const without = buildSnapshot(withoutState, portoSeguroSmall.relatorioId);
    const withRun = buildSnapshot(withState, portoSeguroSmall.relatorioId);
    expect(withRun).toEqual(without);
    expect(layoutSpec(withRun, { revisionNumber: 2, issuedAt: ISSUED_AT })).toEqual(layoutSpec(without, { revisionNumber: 2, issuedAt: ISSUED_AT }));
    const now = new Date(ISSUED_AT);
    const issuesWith = preIssue(withRun, progress(withRun), { now });
    expect(issuesWith).toEqual(preIssue(without, progress(without), { now }));
    expect(sumarioRows(withRun, issuesWith, progress(withRun))).toEqual(sumarioRows(without, issuesWith, progress(without)));
  });

  it('no module of the document, the counts or the rows before generating reads the rules', () => {
    const root = join(import.meta.dirname, '..');
    const readers = [
      ...readdirSync(join(root, 'print')).map((name) => join(root, 'print', name)),
      ...['pre-issue.ts', 'pre-issue-warnings.ts', 'parecer.ts', 'progress.ts', 'sumario.ts', 'sheet-progress.ts', 'conclusion.ts'].map((name) => join(root, 'relatorio', name)),
    ].filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'));
    for (const path of readers) expect(readFileSync(path, 'utf8'), path).not.toMatch(/from '[^']*audit\/(rules|index|text)\.ts'|auditRuleRows\(/);
  });
});
