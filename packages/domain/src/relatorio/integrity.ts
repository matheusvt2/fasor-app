import { SUB_BLOCK_KEYS, type SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow, EquipmentRow, RegistryRow } from '../schemas/entities.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';
import { normalizeTag } from './tag.ts';

/*
 * Story 4.1: the kernel `integrity` surface (Epic 4 context: "TAG uniqueness is a kernel
 * integrity check ... never a database constraint"). A finding is data two devices may
 * both produce after a merge; nothing here throws or rejects. Later rules (unresolved
 * section variables, instruments still referenced, ...) append their own `kind` to the
 * union and their own `push` below, so the Sumário and the Export read one list.
 */

export interface DuplicateTagFinding {
  kind: 'duplicate_tag';
  /** The tag as compared (trimmed, uppercased). */
  tag: string;
  /** Every live equipment row carrying it, in input order. */
  equipment_ids: string[];
}

/**
 * Story 7.3: a sheet's copied instrument header (AR-18) names a certificate number the
 * registry row no longer carries (both trimmed and non-empty). Section 11 still prints the
 * registry's certificate; the finding only says the two disagree.
 */
export interface CertNumberMismatchFinding {
  kind: 'cert_number_mismatch';
  instrument_id: string;
  /** The registry row's `cert_number`, trimmed. */
  registry: string;
  /** The sheets' copied `cert_number`, trimmed. */
  sheet: string;
  /** The live, tested blocks whose enabled tests copied that number, in input order. */
  block_ids: string[];
}

export type IntegrityFinding = DuplicateTagFinding | CertNumberMismatchFinding;

export interface IntegrityInput {
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[];
  /** With `instruments`, the sheets whose copied instrument headers are compared with the registry. */
  blocks?: readonly Pick<BlockRow, 'id' | 'config' | 'sheet' | 'not_tested' | 'removed_at'>[];
  instruments?: readonly Pick<Extract<RegistryRow, { kind: 'instrument' }>, 'id' | 'cert_number' | 'removed_at'>[];
}

function trimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Every `(instrument_id, cert_number)` a live, tested sheet copied into an enabled test's
 * header, with its blocks. The header is read inline (`storedInstrumentHeader` sits beside
 * the tree code, which imports this file).
 */
function sheetCertNumbers(blocks: NonNullable<IntegrityInput['blocks']>): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  for (const block of blocks) {
    if (block.removed_at !== null || block.not_tested !== null) continue;
    const enabled = enabledSubBlocksOf(block);
    for (const [key, test] of Object.entries(block.sheet.test)) {
      if ((SUB_BLOCK_KEYS as readonly string[]).includes(key) && !enabled.has(key as SubBlockKey)) continue;
      const value = test.instrument?.value as { instrument_id?: unknown; cert_number?: unknown } | null | undefined;
      if (typeof value !== 'object' || value === null || typeof value.instrument_id !== 'string') continue;
      const cert = trimmed(value.cert_number);
      if (cert === null) continue;
      const byCert = out.get(value.instrument_id) ?? new Map<string, string[]>();
      out.set(value.instrument_id, byCert);
      const ids = byCert.get(cert) ?? [];
      byCert.set(cert, ids);
      if (!ids.includes(block.id)) ids.push(block.id);
    }
  }
  return out;
}

/**
 * Every integrity finding of a project's equipment and, given `blocks` and `instruments`,
 * of its sheets' instrument headers (a `RelatorioSnapshot` fits the input).
 */
export function integrityFindings(input: IntegrityInput & { blocks?: undefined }): DuplicateTagFinding[];
export function integrityFindings(input: IntegrityInput): IntegrityFinding[];
export function integrityFindings(input: IntegrityInput): IntegrityFinding[] {
  const byTag = new Map<string, string[]>();
  for (const row of input.equipment) {
    if (row.removed_at !== null) continue;
    const tag = normalizeTag(row.tag);
    const ids = byTag.get(tag);
    if (ids === undefined) byTag.set(tag, [row.id]);
    else ids.push(row.id);
  }
  const findings: IntegrityFinding[] = [];
  for (const [tag, equipment_ids] of byTag) {
    if (equipment_ids.length > 1) findings.push({ kind: 'duplicate_tag', tag, equipment_ids });
  }
  if (input.blocks !== undefined && input.instruments !== undefined) {
    const registry = new Map(input.instruments.filter((row) => row.removed_at === null).map((row) => [row.id, trimmed(row.cert_number)]));
    for (const [instrument_id, byCert] of sheetCertNumbers(input.blocks)) {
      const expected = registry.get(instrument_id) ?? null;
      if (expected === null) continue;
      for (const [sheet, block_ids] of byCert) {
        if (sheet !== expected) findings.push({ kind: 'cert_number_mismatch', instrument_id, registry: expected, sheet, block_ids });
      }
    }
  }
  return findings;
}
