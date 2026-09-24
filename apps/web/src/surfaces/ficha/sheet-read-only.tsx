import { createContext, useContext, type ReactNode } from 'react';

/*
 * Story 5.9 (AR-17): once a sheet is marked not tested, its nameplate and checklist (and,
 * once Batch B builds them, its measurement table and conclusion) go read-only. The sheet
 * surface wraps `.content` in this provider so every section under it reads one boolean
 * without a prop threaded through call sites Batch B also edits (spec Design Notes).
 */

const SheetReadOnlyContext = createContext(false);

export function SheetReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <SheetReadOnlyContext value={value}>{children}</SheetReadOnlyContext>;
}

/** True once the sheet's block is marked not tested (`block.not_tested !== null`). */
export function useSheetReadOnly(): boolean {
  return useContext(SheetReadOnlyContext);
}
