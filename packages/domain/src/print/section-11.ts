import { sheetOrder } from '../relatorio/ficha.ts';
import { storedInstrumentHeader, type InstrumentHeader } from '../relatorio/instrument-pick.ts';
import { integrityFindings } from '../relatorio/integrity.ts';
import { enabledSubBlocksOf } from '../relatorio/sheet-state.ts';
import { SUB_BLOCK_KEYS, type SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition } from '../seed/definitions.ts';
import { plural } from '../text/plural.ts';

/*
 * Story 7.3 (AC2): section 11, the calibration certificates. The instruments are the union
 * of those checked at setup (`relatorio.setup.instrument_ids`, in that order) and those
 * the sheets copied into a test header (AR-18), in `sheetOrder` then test order. Only a
 * live, tested sheet's enabled test counts. Each certificate prints as full-page images
 * (the renderer rasterizes a PDF with LibreOffice and an image through sharp) with no
 * caption, as in the source; an instrument whose certificate is not attached, or whose
 * file the server cannot read, prints the placeholder line instead. A sheet header whose
 * `cert_number` disagrees with the registry is an `integrity` finding
 * (`cert_number_mismatch`); the print still uses the registry's certificate.
 */

export interface Section11Instrument {
  instrument_id: string;
  code: string;
  /** The registry name, else "⟨manufacturer⟩ ⟨model⟩"; null when neither is known. */
  name: string | null;
  /** The registry's certificate number, else the first one a sheet copied; null when none. */
  cert_number: string | null;
  certificate_file_id: string | null;
  /** The distinct trimmed `cert_number` values the sheets copied, first-seen order. */
  sheet_cert_numbers: string[];
  cert_mismatch: boolean;
  /** "Certificado não anexado: 2E — Megôhmetro (nº 37428/26)": what prints when no page can. */
  placeholder: string;
}

export interface LayoutCertificate {
  instrumentId: string;
  certificateFileId: string | null;
  placeholder: string;
}

export interface LayoutSectionCertificates {
  number: number;
  title: string;
  kind: 'certificates';
  certificates: LayoutCertificate[];
}

type Section11Snapshot = Pick<RelatorioSnapshot, 'relatorio' | 'instruments' | 'blocks' | 'locations' | 'equipment'>;

function present(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The block's test keys in the definition's order, then any other stored key. */
function testKeysOf(block: BlockRow): string[] {
  const defined: string[] = findDefinition(block.seed_version, block.block_type)?.tests.map((test) => test.key) ?? [];
  return [...defined, ...Object.keys(block.sheet.test).filter((key) => !defined.includes(key))];
}

/** The instrument headers a live, tested sheet copied into its enabled tests, in test order. */
function sheetHeaders(block: BlockRow): InstrumentHeader[] {
  if (block.removed_at !== null || block.not_tested !== null) return [];
  const enabled = enabledSubBlocksOf(block);
  return testKeysOf(block).flatMap((key) => {
    if ((SUB_BLOCK_KEYS as readonly string[]).includes(key) && !enabled.has(key as SubBlockKey)) return [];
    const header = storedInstrumentHeader(block.sheet.test[key]?.instrument?.value);
    return header === null ? [] : [header];
  });
}

/** authored: the line printed for an instrument whose certificate cannot print (open for Bruno). */
export function certificatePlaceholderText(entry: { code: string; name: string | null; cert_number: string | null }): string {
  const who = [entry.code, entry.name].filter((part): part is string => present(part) !== null).join(' — ');
  return `Certificado não anexado: ${who}${entry.cert_number === null ? '' : ` (nº ${entry.cert_number})`}`;
}

/** Every instrument of section 11, in print order. */
export function section11Instruments(snapshot: Section11Snapshot): Section11Instrument[] {
  const registry = new Map(snapshot.instruments.filter((row) => row.removed_at === null).map((row) => [row.id, row]));
  const order: string[] = [];
  const add = (id: string) => {
    if (!order.includes(id)) order.push(id);
  };
  for (const id of snapshot.relatorio.setup.instrument_ids) add(id);

  const headers = new Map<string, InstrumentHeader[]>();
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  for (const node of sheetOrder(snapshot)) {
    const block = blocks.get(node.blockId);
    if (block === undefined) continue;
    for (const header of sheetHeaders(block)) {
      add(header.instrument_id);
      headers.set(header.instrument_id, [...(headers.get(header.instrument_id) ?? []), header]);
    }
  }

  const mismatched = new Set(
    integrityFindings({ equipment: [], blocks: snapshot.blocks, instruments: snapshot.instruments })
      .filter((finding) => finding.kind === 'cert_number_mismatch')
      .map((finding) => finding.instrument_id),
  );

  return order.flatMap((id) => {
    const row = registry.get(id);
    const copied = headers.get(id) ?? [];
    const first = copied[0];
    // An instrument checked at setup whose registry row is gone, and no sheet names: nothing to print.
    if (row === undefined && first === undefined) return [];
    const sheetCerts = [...new Set(copied.map((header) => present(header.cert_number)).filter((cert): cert is string => cert !== null))];
    const code = row?.code ?? first!.code;
    const madeBy = [present(row?.manufacturer ?? first?.manufacturer), present(row?.model ?? first?.model)].filter((part): part is string => part !== null).join(' ');
    const name = present(row?.name) ?? (madeBy === '' ? null : madeBy);
    const cert = present(row?.cert_number) ?? sheetCerts[0] ?? null;
    return [
      {
        instrument_id: id,
        code,
        name,
        cert_number: cert,
        certificate_file_id: row?.certificate_file_id ?? null,
        sheet_cert_numbers: sheetCerts,
        cert_mismatch: mismatched.has(id),
        placeholder: certificatePlaceholderText({ code, name, cert_number: cert }),
      },
    ];
  });
}

/** The instruments of section 11 with no certificate file attached (Story 7.5's pre-issue row reads it). */
export function missingCertificates(snapshot: Section11Snapshot): Section11Instrument[] {
  return section11Instruments(snapshot).filter((entry) => entry.certificate_file_id === null);
}

/**
 * authored: Sumário row 11 counts the instruments section 11 prints: "3 instrumentos",
 * "1 instrumento", "Nenhum instrumento". Review fixes 2026-10-06 (F-15): it counted them as
 * certificates ("3 certificados") with none attached.
 */
export function instrumentsCountText(n: number): string {
  return n === 0 ? 'Nenhum instrumento' : plural(n, 'instrumento', 'instrumentos');
}

/**
 * authored (F-15): how many of the `total` printed instruments have a certificate file attached:
 * "nenhum certificado anexado" with none, "2 certificados" with some, null with all (or none to
 * attach), where the instrument count alone says it.
 */
export function certificatesAttachedText(attached: number, total: number): string | null {
  if (total === 0 || attached >= total) return null;
  return attached === 0 ? 'nenhum certificado anexado' : plural(attached, 'certificado', 'certificados');
}

/** Section 11's layout under its heading; null when no instrument prints (the section prints the empty note). */
export function section11Layout(snapshot: Section11Snapshot, heading: { number: number; title: string }): LayoutSectionCertificates | null {
  const certificates = section11Instruments(snapshot).map((entry) => ({
    instrumentId: entry.instrument_id,
    certificateFileId: entry.certificate_file_id,
    placeholder: entry.placeholder,
  }));
  return certificates.length === 0 ? null : { number: heading.number, title: heading.title, kind: 'certificates', certificates };
}
