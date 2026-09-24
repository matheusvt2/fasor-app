import { relatorioOpEnvelope, type Author, type JsonValue, type OpDraft } from '@app/domain';

/*
 * The ops the equipment sheet writes (Stories 5.1-5.4): `sheet/{blockId}/nameplate/{key}`,
 * `sheet/{blockId}/checklist/{item}/{result|observation}`, `sheet/{blockId}/observations`,
 * the cabine's `location/{id}/se/{field}` and `location/{id}/env/{field}` (never on the
 * sheet, AR-5) and `block/{id}/concluded_by`. All relatório scope, one op per committed
 * value (AD-1); `applyOp` validates the seed-defined keys (E3-A3). The envelope is the
 * kernel's `relatorioOpEnvelope` (Epic 4 retro item 7), the same one `relatorio-ops.ts` uses.
 */

const envelope = relatorioOpEnvelope;

function put(author: Author, relatorioId: string, path: string, value: unknown): OpDraft {
  return { ...envelope(author, relatorioId), kind: 'put', path, value: (value ?? null) as JsonValue };
}

/** `sheet/{blockId}/nameplate/{fieldKey}` put (null clears it). */
export function nameplateOp(author: Author, relatorioId: string, blockId: string, fieldKey: string, value: unknown): OpDraft {
  return put(author, relatorioId, `sheet/${blockId}/nameplate/${fieldKey}`, value);
}

/** `sheet/{blockId}/checklist/{itemKey}/result` put: "C", "NC", "NA", or null to clear. */
export function checklistResultOp(author: Author, relatorioId: string, blockId: string, itemKey: string, value: 'C' | 'NC' | 'NA' | null): OpDraft {
  return put(author, relatorioId, `sheet/${blockId}/checklist/${itemKey}/result`, value);
}

/** `sheet/{blockId}/checklist/{itemKey}/observation` put. */
export function checklistObservationOp(author: Author, relatorioId: string, blockId: string, itemKey: string, value: string | null): OpDraft {
  return put(author, relatorioId, `sheet/${blockId}/checklist/${itemKey}/observation`, value);
}

/** `sheet/{blockId}/observations` put: the sheet-level observation text. */
export function sheetObservationsOp(author: Author, relatorioId: string, blockId: string, value: string | null): OpDraft {
  return put(author, relatorioId, `sheet/${blockId}/observations`, value);
}

/** `location/{id}/se/{field}` put on the cabine (TIPO DE SE, tensões, potência). */
export function cabineSeOp(author: Author, relatorioId: string, cabineId: string, field: string, value: unknown): OpDraft {
  return put(author, relatorioId, `location/${cabineId}/se/${field}`, value);
}

/** `location/{id}/env/{field}` put on the cabine (temperatura, umidade). */
export function cabineEnvOp(author: Author, relatorioId: string, cabineId: string, field: string, value: unknown): OpDraft {
  return put(author, relatorioId, `location/${cabineId}/env/${field}`, value);
}

/** `registry/{manufacturer|voltage_class}/{id}` create, company scope: "Criar “…”" of a nameplate chip field (Story 2.5 AC3). */
export function createWordOp(author: Author, kind: 'manufacturer' | 'voltage_class', id: string, name: string): OpDraft {
  return {
    ...envelope(author, ''),
    scope: 'company',
    relatorio_id: null,
    kind: 'create',
    path: `registry/${kind}/${id}`,
    value: { id, kind, name, gender: null, number: null, removed_at: null },
  };
}

/** `block/{id}/concluded_by` put: `{actor_id, at}` (AR-17), only at Progress = Completa. */
export function concludedByOp(author: Author, relatorioId: string, blockId: string, at: string): OpDraft {
  return put(author, relatorioId, `block/${blockId}/concluded_by`, { actor_id: author.id, at });
}
