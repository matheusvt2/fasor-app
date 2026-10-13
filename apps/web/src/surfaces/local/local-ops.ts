import { locationChecklistPath, relatorioOpEnvelope, type Author, type JsonValue, type OpDraft } from '@app/domain';

/*
 * Story 14.3: the ops "Verificações do local" writes, `location/{id}/checklist/{item_key}/
 * {result|observation}` puts on the local (the root `kind = cabine` row), relatório scope, one
 * op per committed value (AD-1). `applyOp` refuses them off a cabine and for an item the
 * relatório's seed does not list. The envelope is the kernel's, as `ficha-ops.ts` uses it.
 */

function put(author: Author, relatorioId: string, path: string, value: JsonValue): OpDraft {
  return { ...relatorioOpEnvelope(author, relatorioId), kind: 'put', path, value };
}

/** `location/{id}/checklist/{itemKey}/result` put: "C", "NC", "NA", or null to clear. */
export function siteResultOp(author: Author, relatorioId: string, locationId: string, itemKey: string, value: 'C' | 'NC' | 'NA' | null): OpDraft {
  return put(author, relatorioId, locationChecklistPath(locationId, itemKey, 'result'), value);
}

/** `location/{id}/checklist/{itemKey}/observation` put (null clears it). */
export function siteObservationOp(author: Author, relatorioId: string, locationId: string, itemKey: string, value: string | null): OpDraft {
  return put(author, relatorioId, locationChecklistPath(locationId, itemKey, 'observation'), value);
}
