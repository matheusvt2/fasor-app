import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { entityKey } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import type { BlockRow, RegistryRow, RelatorioRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { EMPTY_SECTION_NOTE, layoutSpec } from './layout.ts';
import { certificatePlaceholderText, certificatesCountText, missingCertificates, section11Instruments, section11Layout } from './section-11.ts';

/*
 * 7.3-UNIT: section 11's instruments (the I/O rows S11 union, missing, mismatch, none) on a
 * relatório of the standard template and on the full Porto Seguro fixture.
 */

type InstrumentRow = Extract<RegistryRow, { kind: 'instrument' }>;

const I1 = '019966b0-0b01-7000-8000-000000000001';
const I2 = '019966b0-0b01-7000-8000-000000000002';
const I3 = '019966b0-0b01-7000-8000-000000000003';
const I4 = '019966b0-0b01-7000-8000-000000000004';
const CERT = '019966b0-0b02-7000-8000-000000000001';
const OP = '019966b0-0b03-7000-8000-000000000001';

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0b04-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0b05-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0b06-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

function instrument(id: string, overrides: Partial<InstrumentRow> = {}): InstrumentRow {
  return {
    id,
    kind: 'instrument',
    code: `C${id.slice(-1)}`,
    name: `Instrumento ${id.slice(-1)}`,
    manufacturer: 'Fabricante',
    model: 'M-1',
    serial: null,
    cert_number: `100${id.slice(-1)}/26`,
    laboratory: null,
    calibrated_at: null,
    calibration_interval_months: null,
    rbc_accredited: null,
    test_isolacao: null,
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
    ...overrides,
  };
}

/** A copied header (AR-18) for `row`, its cert number overridable. */
function header(row: InstrumentRow, cert: string | null = row.cert_number) {
  return { instrument_id: row.id, code: row.code, manufacturer: row.manufacturer, model: row.model, serial: null, cert_number: cert, calibrated_at: null, valid_until: null, test_parameter: null };
}

function withHeader(block: BlockRow, testKey: string, value: unknown): BlockRow {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  return { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, [testKey]: { ...test, instrument: { value: value as never, source_suggestion_id: null, op_id: OP } } } } };
}

const base = fresh();
const order = sheetOrder(base);
const testsOf = (blockId: string) => {
  const block = base.blocks.find((b) => b.id === blockId)!;
  return getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.map((t) => t.key);
};
/** The first two sheets in tree order that have at least two tests. */
const [first, second] = order.filter((node) => testsOf(node.blockId).length >= 2).map((node) => node.blockId);
const heading = { number: 11, title: 'CERTIFICADOS' };

function snapshotWith(options: { setup?: string[]; instruments: InstrumentRow[]; edit?: (block: BlockRow) => BlockRow }): RelatorioSnapshot {
  const relatorio: RelatorioRow = { ...base.relatorio, setup: { ...base.relatorio.setup, instrument_ids: options.setup ?? [] } };
  return { ...base, relatorio, instruments: options.instruments, blocks: base.blocks.map(options.edit ?? ((b) => b)) };
}

describe('7.3-UNIT-006 section 11 instruments', () => {
  const one = instrument(I1);
  const two = instrument(I2);
  const three = instrument(I3, { certificate_file_id: CERT });
  const four = instrument(I4);
  const [t1a, t1b] = testsOf(first!);
  const [t2a] = testsOf(second!);

  it('S11 union: setup order first, then the instruments only sheets name, in sheetOrder then test order, each once', () => {
    const snapshot = snapshotWith({
      setup: [I3, I1],
      instruments: [one, two, three, four],
      edit: (block) => {
        if (block.id === first) return withHeader(withHeader(block, t1b!, header(four)), t1a!, header(two));
        if (block.id === second) return withHeader(block, t2a!, header(one));
        return block;
      },
    });
    const entries = section11Instruments(snapshot);
    expect(entries.map((e) => e.instrument_id)).toEqual([I3, I1, I2, I4]);
    expect(entries[0]).toEqual({
      instrument_id: I3,
      code: 'C3',
      name: 'Instrumento 3',
      cert_number: '1003/26',
      certificate_file_id: CERT,
      sheet_cert_numbers: [],
      cert_mismatch: false,
      placeholder: 'Certificado não anexado: C3 — Instrumento 3 (nº 1003/26)',
    });
    expect(entries[1]!.sheet_cert_numbers).toEqual(['1001/26']);
    expect(missingCertificates(snapshot).map((e) => e.instrument_id)).toEqual([I1, I2, I4]);
  });

  it('reads headers only from live, tested sheets whose test sub-block is enabled', () => {
    const snapshot = snapshotWith({
      instruments: [one, two, four],
      edit: (block) => {
        if (block.id === first) {
          const disabled = { ...block, config: { ...(block.config as object), sub_blocks: { ...(block.config as { sub_blocks: object }).sub_blocks, [t1a!]: { enabled: false } } } } as BlockRow;
          return withHeader(withHeader(disabled, t1a!, header(one)), t1b!, header(four));
        }
        if (block.id === second) return { ...withHeader(block, t2a!, header(two)), not_tested: { reason: 'outro', text: null, at: T0.toISOString(), by: TEST_USER } };
        return block;
      },
    });
    expect(section11Instruments(snapshot).map((e) => e.instrument_id)).toEqual([I4]);
    const removed = snapshotWith({ instruments: [one], edit: (block) => (block.id === first ? { ...withHeader(block, t1a!, header(one)), removed_at: '2026-09-07T10:00:00.000Z' } : block) });
    expect(section11Instruments(removed)).toEqual([]);
  });

  it('S11 missing: the placeholder omits what is unknown; a registry row gone prints from the copied header', () => {
    const unnamed = instrument(I1, { name: '  ', cert_number: null });
    const snapshot = snapshotWith({
      instruments: [unnamed],
      edit: (block) => (block.id === first ? withHeader(withHeader(block, t1a!, header(unnamed, null)), t1b!, header(instrument(I2, { manufacturer: null, model: 'HTRT' }), '77/26')) : block),
    });
    const entries = section11Instruments(snapshot);
    expect(entries.map((e) => e.placeholder)).toEqual(['Certificado não anexado: C1 — Fabricante M-1', 'Certificado não anexado: C2 — HTRT (nº 77/26)']);
    expect(entries[1]!.certificate_file_id).toBeNull();
    expect(certificatePlaceholderText({ code: 'X', name: null, cert_number: null })).toBe('Certificado não anexado: X');
    // A setup instrument with no registry row and no sheet naming it has nothing to print.
    expect(section11Instruments(snapshotWith({ setup: [I3], instruments: [] }))).toEqual([]);
  });

  it('S11 mismatch: a sheet\'s copied cert_number differing from the registry flags the instrument; an empty registry value never does', () => {
    const snapshot = snapshotWith({
      instruments: [one, instrument(I2, { cert_number: null })],
      edit: (block) => {
        if (block.id === first) return withHeader(withHeader(block, t1a!, header(one, ' 1001/26 ')), t1b!, header(instrument(I2), '55/26'));
        if (block.id === second) return withHeader(block, t2a!, header(one, '9999/25'));
        return block;
      },
    });
    const entries = section11Instruments(snapshot);
    expect(entries.map((e) => [e.instrument_id, e.cert_mismatch, e.cert_number, e.sheet_cert_numbers])).toEqual([
      [I1, true, '1001/26', ['1001/26', '9999/25']],
      [I2, false, '55/26', ['55/26']],
    ]);
  });

  it('S11 none: no instrument gives null and the empty note; the Sumário count text', () => {
    expect(section11Layout(base, heading)).toBeNull();
    const layout = layoutSpec(base, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' });
    expect(layout.sections.find((s) => s.number === 11)).toEqual({ number: 11, title: heading.title, kind: 'empty', note: EMPTY_SECTION_NOTE });
    expect(certificatesCountText(0)).toBe('Nenhum instrumento');
    expect(certificatesCountText(1)).toBe('1 certificado');
    expect(certificatesCountText(3)).toBe('3 certificados');
    const withSetup = snapshotWith({ setup: [I3], instruments: [three] });
    expect(section11Layout(withSetup, heading)).toEqual({
      number: 11,
      title: heading.title,
      kind: 'certificates',
      certificates: [{ instrumentId: I3, certificateFileId: CERT, placeholder: 'Certificado não anexado: C3 — Instrumento 3 (nº 1003/26)' }],
    });
  });
});

describe('7.3-UNIT-007 the snapshot carries the instruments checked at setup', () => {
  it('buildSnapshot adds the setup instrument_ids to the sheet-referenced instruments', () => {
    const state = new Map(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }));
    const extra = instrument(I1);
    state.set(entityKey('registry', I1), extra);
    const key = entityKey('relatorio', portoSeguro.relatorioId);
    const relatorio = state.get(key) as RelatorioRow;
    state.set(key, { ...relatorio, setup: { ...relatorio.setup, instrument_ids: [I1] } });
    const snapshot = buildSnapshot(state, portoSeguro.relatorioId);
    expect(snapshot.instruments.map((row) => row.id)).toContain(I1);
    expect(section11Instruments(snapshot)[0]!.instrument_id).toBe(I1);
  });
});

describe('7.3-UNIT-008 section 11 on the Porto Seguro fixture', () => {
  it('lists the three registry instruments, each with its placeholder line', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const section = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' }).sections.find((s) => s.number === 11)!;
    expect(section).toEqual({
      number: 11,
      title: 'CERTIFICADOS',
      kind: 'certificates',
      certificates: [
        { instrumentId: '019966c0-0000-7000-8000-000000000005', certificateFileId: null, placeholder: 'Certificado não anexado: 2E — Megôhmetro Digital (nº 37428/26)' },
        { instrumentId: '019966c0-0000-7000-8000-000000000006', certificateFileId: null, placeholder: 'Certificado não anexado: 3M — Micro-Ohmmeter (nº 37276/26)' },
        { instrumentId: '019966c0-0000-7000-8000-000000000007', certificateFileId: null, placeholder: 'Certificado não anexado: 1T — Transformer Ratiometer (nº 37274/26)' },
      ],
    });
    expect(section11Instruments(snapshot).every((e) => !e.cert_mismatch)).toBe(true);
  });
});
