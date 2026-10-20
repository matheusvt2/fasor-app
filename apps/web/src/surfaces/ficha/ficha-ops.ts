import {
  choiceValue,
  oilCrossingClearedCount,
  oilCrossingPuts,
  safeParsePath,
  locationEnvPath,
  locationSePath,
  putBlockOp,
  registryPath,
  relatorioOpEnvelope,
  sheetChecklistPath,
  sheetConclusionPath,
  sheetNameplatePath,
  sheetObservationsPath,
  sheetTestCellPath,
  sheetTestPath,
  sheetTestValuePath,
  type Author,
  type BlockRow,
  type InstrumentHeader,
  type JsonValue,
  type OpDraft,
  type OpMeta,
  type RelatorioSnapshot,
} from '@app/domain';

/*
 * The ops the equipment sheet writes (Stories 5.1-5.4): `sheet/{blockId}/nameplate/{key}`,
 * `sheet/{blockId}/checklist/{item}/{result|observation}`, `sheet/{blockId}/observations`,
 * the cabine's `location/{id}/se/{field}` and `location/{id}/env/{field}` (never on the
 * sheet, AR-5) and `block/{id}/concluded_by`; Stories 5.5-5.8 add the test cells, the
 * instrument header and the conclusion fields. All relatório scope, one op per committed
 * value (AD-1); `applyOp` validates the seed-defined keys (E3-A3). The envelope is the
 * kernel's `relatorioOpEnvelope` (Epic 4 retro item 7), the same one `relatorio-ops.ts` uses;
 * the two `block/{id}/…` puts are the kernel's `putBlockOp` (E4-A4, E5-Q16).
 */

const envelope = relatorioOpEnvelope;

function put(author: Author, relatorioId: string, path: string, value: unknown): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path, value: (value ?? null) as JsonValue };
}

/** `sheet/{blockId}/nameplate/{fieldKey}` put (null clears it). */
export function nameplateOp(author: Author, relatorioId: string, blockId: string, fieldKey: string, value: unknown): OpDraft {
  return put(author, relatorioId, sheetNameplatePath(blockId, fieldKey), value);
}

/**
 * Story 14.11 (seed v6): `drafts` with the oil crossing each of its nameplate puts brings
 * (`oilCrossingPuts`, the kernel's): a write of TIPO DE ISOLAÇÃO or MEIO DE EXTINÇÃO that crosses
 * between oil and non-oil clears, in the same batch, the oil items, the oil fields and the photo
 * ties the kernel names (a path the batch already writes is left to it). `cleared` is what the
 * "N itens de óleo apagados" toast counts; 0 when nothing crossed.
 */
export function withOilCrossing(
  author: Author,
  relatorioId: string,
  snapshot: { readonly blocks: readonly BlockRow[]; readonly files: RelatorioSnapshot['files'] },
  drafts: readonly OpDraft[],
): { drafts: OpDraft[]; cleared: number } {
  const written = new Set(drafts.map((draft) => draft.path));
  const extra: OpDraft[] = [];
  let cleared = 0;
  for (const draft of drafts) {
    const path = draft.kind === 'put' ? safeParsePath(draft.path) : null;
    if (path === null || path.family !== 'sheet/nameplate') continue;
    const crossing = oilCrossingPuts(snapshot, path.block_id, path.field_key, draft.value).filter((entry) => !written.has(entry.path));
    cleared += oilCrossingClearedCount(crossing, snapshot);
    for (const entry of crossing) {
      written.add(entry.path);
      extra.push(put(author, relatorioId, entry.path, entry.value));
    }
  }
  return { drafts: [...drafts, ...extra], cleared };
}

/** `sheet/{blockId}/checklist/{itemKey}/result` put: "C", "NC", "NA", or null to clear. */
export function checklistResultOp(author: Author, relatorioId: string, blockId: string, itemKey: string, value: 'C' | 'NC' | 'NA' | null): OpDraft {
  return put(author, relatorioId, sheetChecklistPath(blockId, itemKey, 'result'), value);
}

/** `sheet/{blockId}/checklist/{itemKey}/observation` put. */
export function checklistObservationOp(author: Author, relatorioId: string, blockId: string, itemKey: string, value: string | null): OpDraft {
  return put(author, relatorioId, sheetChecklistPath(blockId, itemKey, 'observation'), value);
}

/** `sheet/{blockId}/observations` put: the sheet-level observation text. */
export function sheetObservationsOp(author: Author, relatorioId: string, blockId: string, value: string | null): OpDraft {
  return put(author, relatorioId, sheetObservationsPath(blockId), value);
}

/** `location/{id}/se/{field}` put on the cabine (TIPO DE SE, tensões, potência). */
export function cabineSeOp(author: Author, relatorioId: string, cabineId: string, field: string, value: unknown): OpDraft {
  return put(author, relatorioId, locationSePath(cabineId, field), value);
}

/** `location/{id}/env/{field}` put on the cabine (temperatura, umidade). */
export function cabineEnvOp(author: Author, relatorioId: string, cabineId: string, field: string, value: unknown): OpDraft {
  return put(author, relatorioId, locationEnvPath(cabineId, field), value);
}

/** `registry/{manufacturer|voltage_class}/{id}` create, company scope: "Criar “…”" of a nameplate chip field (Story 2.5 AC3). */
export function createWordOp(author: Author, kind: 'manufacturer' | 'voltage_class', id: string, name: string): OpDraft {
  return {
    ...envelope(author, ''),
    scope: 'company',
    relatorio_id: null,
    kind: 'create',
    path: registryPath(kind, id),
    value: { id, kind, name, gender: null, number: null, removed_at: null },
  };
}

/**
 * `sheet/{blockId}/test/{testKey}/cell/{row}/{col}` put (Stories 5.5-5.6): `{raw, unit,
 * state}` (AR-10), null to clear. The address is the fixture's (`relatorio/readings.ts`).
 */
export function testCellOp(
  author: Author,
  relatorioId: string,
  blockId: string,
  testKey: string,
  row: number,
  col: number,
  value: { raw: string; unit: string | null; state: 'measured' | 'not_measured' } | null,
): OpDraft {
  return put(author, relatorioId, sheetTestCellPath(blockId, testKey, row, col), value);
}

/**
 * Story 14.5: a choice cell of a measurement test, the same cell family holding the kernel's
 * `choiceValue` (`{raw: optionKey, unit: null, state: 'measured'}`).
 */
export function testChoiceCellOp(author: Author, relatorioId: string, blockId: string, testKey: string, row: number, col: number, optionKey: string): OpDraft {
  return put(author, relatorioId, sheetTestCellPath(blockId, testKey, row, col), choiceValue(optionKey));
}

/**
 * Story 14.5: `sheet/{blockId}/test/{testKey}/value/{valueKey}` put, a value of a measurement
 * test outside its table (the E5 método, carga and fonte dos tempos): a number as `{raw, unit,
 * state}`, a choice as the kernel's `choiceValue`, null to clear.
 */
export function testValueOp(author: Author, relatorioId: string, blockId: string, testKey: string, valueKey: string, value: JsonValue | null): OpDraft {
  return put(author, relatorioId, sheetTestValuePath(blockId, testKey, valueKey), value);
}

/** `sheet/{blockId}/test/{testKey}/instrument` put: the instrument header copied by value (Story 5.7, AR-18). */
export function testInstrumentOp(author: Author, relatorioId: string, blockId: string, testKey: string, header: InstrumentHeader): OpDraft {
  return put(author, relatorioId, sheetTestPath(blockId, testKey, 'instrument'), header);
}

/**
 * `sheet/{blockId}/conclusion/{field}` put (Story 5.8): the pair, the confirmed text, its status
 * and basis; null clears. Contract 16: the text put of a composed, confirmed text carries
 * `meta: { composed: true }` (`mergePolicy` reads it).
 */
export function conclusionOp(
  author: Author,
  relatorioId: string,
  blockId: string,
  field: 'result' | 'restriction' | 'text' | 'text_status' | 'text_basis',
  value: string | null,
  meta?: OpMeta,
): OpDraft {
  const op = put(author, relatorioId, sheetConclusionPath(blockId, field), value);
  return meta === undefined ? op : { ...op, meta };
}

/** `block/{id}/concluded_by` put: `{actor_id, at}` (AR-17), only at Progress = Completa. */
export function concludedByOp(author: Author, relatorioId: string, blockId: string, at: string): OpDraft {
  return putBlockOp(author, relatorioId, blockId, 'concluded_by', { actor_id: author.id, at });
}

/**
 * `block/{id}/not_tested` put (AR-17): "Marcar não ensaiado" (`{reason, text, at}`, `by`
 * added here) and its "Desfazer" (`null`).
 */
export function notTestedOp(author: Author, relatorioId: string, blockId: string, value: { reason: string; text: string | null; at: string } | null): OpDraft {
  return putBlockOp(author, relatorioId, blockId, 'not_tested', value === null ? null : { ...value, by: author.id });
}
