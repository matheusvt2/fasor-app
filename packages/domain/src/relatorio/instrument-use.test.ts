import { describe, expect, it } from 'vitest';
import { type EntityState } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { section11Instruments } from '../print/section-11.ts';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, NOT_TESTED_REASON_KEYS } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import {
  instrumentSheetCounts,
  instrumentTickLocked,
  instrumentTwinLines,
  sameCertificateText,
  sameModelText,
  sharedCertificateTwins,
  sharedModelTwins,
  tickedUnusedInstruments,
  tickedUnusedText,
  usedInSheetsText,
} from './instrument-use.ts';
import { exportPrecheck, preIssue, preIssueRowsFor, type PreIssueRow } from './pre-issue.ts';
import { namedWarningSection } from './pre-issue-warnings.ts';
import { progress } from './progress.ts';
import { setupGaps } from './setup-complete.ts';
import { sumarioRows } from './sumario.ts';

/*
 * Story 25.13 (M25): the instruments of a relatório follow its sheets (Etapa 4's derived mark and
 * count, the ticked-unused warning), and two registry rows sharing a certificate number or a model
 * are compared in the kernel; the rows before generating. Section 11 does not change.
 */

const TEMPLATE_ID = '019966b0-0091-7000-8000-000000000001';
const NOW = new Date('2026-09-26T12:00:00.000Z');
const ID_A = '019966b0-0095-7000-8000-000000000001';
const ID_B = '019966b0-0095-7000-8000-000000000002';
const ID_C = '019966b0-0095-7000-8000-000000000003';
const ID_D = '019966b0-0095-7000-8000-000000000004';

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0092-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0093-7000-8000-'), now: T0 }), seq: i + 1 }));
  const state: EntityState = replay(ops);
  return buildSnapshot(state, relatorioId);
}

function instrument(overrides: Partial<InstrumentRow>): InstrumentRow {
  return {
    id: ID_A,
    kind: 'instrument',
    code: '2E',
    name: 'Megôhmetro digital',
    manufacturer: 'Instrum',
    model: 'DMG10Ki',
    serial: null,
    cert_number: null,
    laboratory: null,
    calibrated_at: '2026-01-10',
    calibration_interval_months: 12,
    rbc_accredited: null,
    test_isolacao: null,
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: '019966b0-0095-7000-8000-0000000000ff',
    removed_at: null,
    ...overrides,
  } as InstrumentRow;
}

/** The block with `instrumentId` copied into its `testKey` header. */
function withHeader(block: BlockRow, testKey: string, instrumentId: string, code: string): BlockRow {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  return {
    ...block,
    sheet: { ...block.sheet, test: { ...block.sheet.test, [testKey]: { ...test, instrument: { value: { instrument_id: instrumentId, code }, source_suggestion_id: null, op_id: '019966b0-0094-7000-8000-000000000001' } } } },
  } as BlockRow;
}

function replaceBlocks(snapshot: RelatorioSnapshot, replaced: readonly BlockRow[]): RelatorioSnapshot {
  const byId = new Map(replaced.map((block) => [block.id, block]));
  return { ...snapshot, blocks: snapshot.blocks.map((block) => byId.get(block.id) ?? block) };
}

function withSetup(snapshot: RelatorioSnapshot, instrumentIds: string[], instruments: InstrumentRow[]): RelatorioSnapshot {
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, instrument_ids: instrumentIds } }, instruments };
}

const view = (rows: readonly PreIssueRow[]) => rows.map((row) => [row.kind, row.row, row.severity, row.text]);
const ofKind = (rows: readonly PreIssueRow[], kind: PreIssueRow['kind']) => view(rows.filter((row) => row.kind === kind));

describe('25.13-UNIT the used set, over live sheets only', () => {
  it('counts each live, tested sheet once; a removed or not-tested sheet does not count', () => {
    const base = fresh();
    const [first, second, third, fourth] = base.blocks.filter((block) => block.block_type === 'para_raio' || block.block_type === 'cabos_entrada' || block.block_type === 'disjuntor_mt');
    const snapshot = replaceBlocks(base, [
      withHeader(first!, 'isolacao', ID_A, '2E'),
      withHeader(second!, 'isolacao', ID_A, '2E'),
      { ...withHeader(third!, 'isolacao', ID_B, '3M'), removed_at: '2026-09-08T12:00:00.000Z' },
      { ...withHeader(fourth!, 'isolacao', ID_C, '1T'), not_tested: { reason: NOT_TESTED_REASON_KEYS[0]!, text: null, at: '2026-09-08T12:00:00.000Z', by: TEST_USER } } as BlockRow,
    ]);
    const counts = instrumentSheetCounts(snapshot);
    expect(counts.get(ID_A)).toBe(2);
    expect(counts.has(ID_B)).toBe(false);
    expect(counts.has(ID_C)).toBe(false);
  });

  it('two tests of one sheet on the same instrument count one sheet', () => {
    const base = fresh();
    const sheet = base.blocks.find((block) => block.block_type === 'disjuntor_mt')!;
    const snapshot = replaceBlocks(base, [withHeader(withHeader(sheet, 'isolacao', ID_A, '2E'), 'resistencia_contato', ID_A, '2E')]);
    expect(instrumentSheetCounts(snapshot).get(ID_A)).toBe(1);
  });

  it('"Usado em 1 ficha", "Usado em 12 fichas"', () => {
    expect(usedInSheetsText(1)).toBe('Usado em 1 ficha');
    expect(usedInSheetsText(12)).toBe('Usado em 12 fichas');
  });

  it('a sheet uses an instrument Etapa 4 did not tick: section 11 prints it as today, and it is not ticked-unused', () => {
    const base = fresh();
    const sheet = base.blocks.find((block) => block.block_type === 'para_raio')!;
    const snapshot = withSetup(replaceBlocks(base, [withHeader(sheet, 'isolacao', ID_A, '2E')]), [], [instrument({ id: ID_A })]);
    expect(section11Instruments(snapshot).map((entry) => entry.code)).toEqual(['2E']);
    expect(tickedUnusedInstruments(snapshot)).toEqual([]);
    expect(ofKind(preIssue(snapshot, undefined, { now: NOW }), 'instrument_unused')).toEqual([]);
  });
});

describe('25.13-UNIT a ticked instrument no sheet uses', () => {
  it('raises one info row on section 11, named in the Export dialog with its section; unticking clears it', () => {
    const base = fresh();
    const sheet = base.blocks.find((block) => block.block_type === 'para_raio')!;
    const used = replaceBlocks(base, [withHeader(sheet, 'isolacao', ID_A, '2E')]);
    const snapshot = withSetup(used, [ID_A, ID_B], [instrument({ id: ID_A }), instrument({ id: ID_B, code: '1T', model: 'HTRT-8K' })]);
    expect(tickedUnusedInstruments(snapshot).map((row) => row.code)).toEqual(['1T']);
    const rows = preIssue(snapshot, undefined, { now: NOW });
    expect(ofKind(rows, 'instrument_unused')).toEqual([['instrument_unused', 'section_11', 'info', '1T: marcado, sem uso nas fichas']]);
    const row = rows.find((r) => r.kind === 'instrument_unused')!;
    expect(namedWarningSection(row)).toBe(11);
    expect(exportPrecheck(rows).explicit.map((r) => r.kind)).toContain('instrument_unused');
    // The Sumário row 11 carries it.
    const row11 = sumarioRows(snapshot, rows, progress(snapshot)).find((r) => r.rowKey === 'section_11')!;
    expect(row11.meta).toContain('1T: marcado, sem uso nas fichas');

    const unticked = withSetup(used, [ID_A], snapshot.instruments);
    expect(ofKind(preIssue(unticked, undefined, { now: NOW }), 'instrument_unused')).toEqual([]);
    expect(tickedUnusedText('7E')).toBe('7E: marcado, sem uso nas fichas');
  });

  it('a ticked instrument whose registry row is removed prints nothing and raises nothing', () => {
    const snapshot = withSetup(fresh(), [ID_B], [instrument({ id: ID_B, code: '1T', removed_at: '2026-09-08T12:00:00.000Z' })]);
    expect(tickedUnusedInstruments(snapshot)).toEqual([]);
  });
});

describe('25.13-UNIT review of PR #332: the setup gap and the tick follow the same "used"', () => {
  const notTested = (block: BlockRow): BlockRow => ({ ...block, not_tested: { reason: NOT_TESTED_REASON_KEYS[0]!, text: null, at: '2026-09-08T12:00:00.000Z', by: TEST_USER } }) as BlockRow;

  it('finding 1: an instrument a live, tested sheet uses closes the "no instrument" gap with no tick; one used only on a not-tested sheet does not', () => {
    const base = fresh();
    const sheet = base.blocks.find((block) => block.block_type === 'para_raio')!;
    const used = withSetup(replaceBlocks(base, [withHeader(sheet, 'isolacao', ID_A, '2E')]), [], [instrument({ id: ID_A })]);
    expect(setupGaps(used)).not.toContain('instruments');
    expect(preIssue(used, undefined, { now: NOW }).map((row) => row.id)).not.toContain('setup_missing:instruments');
    // Section 11 prints as before: the instrument the sheet uses.
    expect(section11Instruments(used).map((entry) => entry.code)).toEqual(['2E']);

    const onNotTested = withSetup(replaceBlocks(base, [notTested(withHeader(sheet, 'isolacao', ID_A, '2E'))]), [], [instrument({ id: ID_A })]);
    expect(setupGaps(onNotTested)).toContain('instruments');
    expect(setupGaps(withSetup(base, [], []))).toContain('instruments');
    expect(setupGaps(withSetup(base, [ID_A], [instrument({ id: ID_A })]))).not.toContain('instruments');
  });

  it('finding 3: a tick whose only use is a not-tested sheet is ticked-unused and may be unticked; a used one is locked', () => {
    const base = fresh();
    const [first, second] = base.blocks.filter((block) => block.block_type === 'para_raio');
    const snapshot = withSetup(
      replaceBlocks(base, [withHeader(first!, 'isolacao', ID_A, '2E'), notTested(withHeader(second!, 'isolacao', ID_B, '1T'))]),
      [ID_A, ID_B],
      [instrument({ id: ID_A }), instrument({ id: ID_B, code: '1T', model: 'HTRT-8K' })],
    );
    expect(tickedUnusedInstruments(snapshot).map((row) => row.code)).toEqual(['1T']);
    expect(instrumentTickLocked(snapshot, ID_B)).toBe(false);
    expect(instrumentTickLocked(snapshot, ID_A)).toBe(true);
  });
});

describe('25.13-UNIT the two registry comparisons', () => {
  const a = instrument({ id: ID_A, code: '3M', model: 'HTMO-10', cert_number: 'RBC-1234' });
  const b = instrument({ id: ID_B, code: '6M', model: 'HTMO-10', cert_number: '  rbc-1234 ' });
  const c = instrument({ id: ID_C, code: '2E', model: 'DMG10Ki', cert_number: 'RBC 37428/26' });
  const d = instrument({ id: ID_D, code: '7E', model: ' dmg10ki', cert_number: null });

  it('a certificate number shared, trimmed and without case: each names the other', () => {
    const twins = sharedCertificateTwins([a, b, c, d]);
    expect(twins.get(ID_A)!.map((row) => row.code)).toEqual(['6M']);
    expect(twins.get(ID_B)!.map((row) => row.code)).toEqual(['3M']);
    expect(twins.has(ID_C)).toBe(false);
    expect(twins.has(ID_D)).toBe(false);
    expect(sameCertificateText([b])).toBe('Mesmo certificado de 6M');
  });

  it('a model shared with a different certificate is the lighter line; a twin that shares the certificate is not repeated', () => {
    const models = sharedModelTwins([a, b, c, d]);
    expect(models.get(ID_C)!.map((row) => row.code)).toEqual(['7E']);
    expect(models.get(ID_D)!.map((row) => row.code)).toEqual(['2E']);
    expect(models.has(ID_A)).toBe(false);
    expect(models.has(ID_B)).toBe(false);
    expect(sameModelText([d])).toBe('Mesmo modelo de 7E: confira');
    const lines = instrumentTwinLines([a, b, c, d]);
    expect(lines.get(ID_A)).toEqual({ certificate: 'Mesmo certificado de 6M', model: null });
    expect(lines.get(ID_C)).toEqual({ certificate: null, model: 'Mesmo modelo de 7E: confira' });
  });

  it('a removed row and an empty value compare with nothing', () => {
    const removed = instrument({ id: ID_B, code: '6M', cert_number: 'RBC-1234', model: 'HTMO-10', removed_at: '2026-09-08T12:00:00.000Z' });
    const blank = instrument({ id: ID_C, code: '9X', cert_number: '   ', model: '' });
    const blank2 = instrument({ id: ID_D, code: '9Y', cert_number: '', model: '  ' });
    expect(sharedCertificateTwins([a, removed, blank, blank2]).size).toBe(0);
    expect(sharedModelTwins([a, removed, blank, blank2]).size).toBe(0);
  });
});

describe('25.13-UNIT the rows before generating for a shared certificate', () => {
  const a = instrument({ id: ID_A, code: '3M', model: 'HTMO-10', cert_number: 'RBC-1234' });
  const b = instrument({ id: ID_B, code: '6M', model: 'HTMO-10', cert_number: ' rbc-1234' });
  const c = instrument({ id: ID_C, code: '2E', model: 'DMG10Ki', cert_number: 'X1' });
  const d = instrument({ id: ID_D, code: '7E', model: 'DMG10Ki', cert_number: 'X2' });

  it('an instrument of the relatório sharing its certificate raises one pending row naming its twin; never blocking', () => {
    const base = fresh();
    const sheet = base.blocks.find((block) => block.block_type === 'para_raio')!;
    const snapshot = withSetup(replaceBlocks(base, [withHeader(sheet, 'isolacao', ID_A, '3M')]), [], [a]);
    const rows = preIssue(snapshot, undefined, { now: NOW, registryInstruments: [a, b, c, d] });
    expect(ofKind(rows, 'certificate_shared')).toEqual([['certificate_shared', 'section_11', 'pending', '3M: mesmo certificado de 6M']]);
    expect(namedWarningSection(rows.find((r) => r.kind === 'certificate_shared')!)).toBe(11);
    expect(rows.filter((r) => r.severity === 'blocking').map((r) => r.kind)).toEqual(['parecer_missing']);
    // Without the registry the kernel cannot compare: no row.
    expect(ofKind(preIssue(snapshot, undefined, { now: NOW }), 'certificate_shared')).toEqual([]);
  });

  it('a shared model raises nothing before generating, nor does a twin outside the relatório', () => {
    const base = fresh();
    const sheet = base.blocks.find((block) => block.block_type === 'para_raio')!;
    const snapshot = withSetup(replaceBlocks(base, [withHeader(sheet, 'isolacao', ID_C, '2E')]), [], [c]);
    const rows = preIssue(snapshot, undefined, { now: NOW, registryInstruments: [a, b, c, d] });
    expect(ofKind(rows, 'certificate_shared')).toEqual([]);
    expect(view(preIssueRowsFor(rows, 'section_11')).map((row) => row[0])).not.toContain('certificate_shared');
  });
});
