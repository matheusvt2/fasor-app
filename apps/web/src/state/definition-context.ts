import { definitionContext, EMPTY_DEFINITION_CONTEXT, type DefinitionContext } from '@app/domain';
import { useMemo } from 'react';
import { useLiveQuery } from '../db/live.ts';
import { equipmentTypeRows } from '../db/type-store.ts';
import { useSession } from './session.tsx';

/*
 * Story 14.6 (AD-21 note of 2026-11-06, item 4): the device's definition context, a live query on
 * its company equipment types (the published versions and the type rows, `db/type-store.ts`).
 * Every surface that hands a kernel call a block of a company type outside a snapshot (palettes,
 * the composer, the type list, the ficha's helpers) passes this; a reader over a snapshot builds
 * its own from `snapshot.equipment_types`. The same object until a version or a type is written.
 */
export function useDefinitionContext(): DefinitionContext {
  const db = useSession().database;
  const lists = useLiveQuery(() => (db === null ? undefined : equipmentTypeRows(db)), [db]);
  return useMemo(() => (lists === undefined ? EMPTY_DEFINITION_CONTEXT : definitionContext(lists.versions, lists.types)), [lists]);
}
