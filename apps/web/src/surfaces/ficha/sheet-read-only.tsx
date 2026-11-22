import { createContext, useContext, type ReactNode } from 'react';
import { copy } from '../../copy/pt-br.ts';

/*
 * Story 5.9 (AR-17): once a sheet is marked not tested, its nameplate and checklist (and,
 * once Batch B builds them, its measurement table and conclusion) go read-only. The sheet
 * surface wraps `.content` in this provider so every section under it reads one boolean
 * without a prop threaded through call sites Batch B also edits (spec Design Notes).
 *
 * Story 26.5: a second cause, the role (no `relatorio.fill`), gives the same read-only look.
 * The reason follows the cause: a not tested sheet keeps its line beside each section head; a
 * sheet the role cannot fill says it once, in the info Banner under the sheet header
 * (EXPERIENCE.md § State Patterns, "A relatório the role cannot fill": "instead of a line
 * beside every control"), so its sections draw no line of their own.
 */

export type SheetReadOnlyCause = 'not_tested' | 'role';

const SheetReadOnlyContext = createContext<SheetReadOnlyCause | null>(null);

/** `value`: true (or `'not_tested'`) for a not tested sheet, `'role'` for a role that cannot fill, false for an editable sheet. */
export function SheetReadOnlyProvider({ value, children }: { value: boolean | SheetReadOnlyCause; children: ReactNode }) {
  const cause: SheetReadOnlyCause | null = value === true ? 'not_tested' : value === false ? null : value;
  return <SheetReadOnlyContext value={cause}>{children}</SheetReadOnlyContext>;
}

/** True once the sheet's block is marked not tested (`block.not_tested !== null`) or the role cannot fill it. */
export function useSheetReadOnly(): boolean {
  return useContext(SheetReadOnlyContext) !== null;
}

/** The line a read-only section head draws, or null (an editable sheet, or the role's cause: the Banner says it). */
export function useSheetReadOnlyReason(): string | null {
  return useContext(SheetReadOnlyContext) === 'not_tested' ? copy.ficha.checklist.readOnlyReason : null;
}

/** Why the sheet is read-only, or null when it is not. */
export function useSheetReadOnlyCause(): SheetReadOnlyCause | null {
  return useContext(SheetReadOnlyContext);
}
