import type { OpDraft } from '@app/domain';
import type { Build, RelatorioEditor } from '../relatorio/relatorio-editor.ts';
import type { Author } from '../relatorio/relatorio-ops.ts';

/**
 * What every section of the sheet writes through (Story 5.1: "every committed field value
 * is an op, no Save button"). Typed fields commit through `commit`, the field-commit path
 * (`useFieldCommit` reports a refused write); taps, chips and bulk actions go through the
 * relatório's one edit queue (`edit`). Both retire a stale undo toast on success (a typed
 * correction after a copy or bulk action must not be lost to that toast's "Desfazer") and
 * announce the throttled "Salvo".
 */
export interface FichaApi {
  relatorioId: string;
  projectId: string;
  blockId: string;
  author: Author | null;
  /** One typed field's ops, committed now (rejects on a refused write). */
  commit: (drafts: OpDraft[]) => Promise<void>;
  /** A discrete edit through the relatório's edit queue; resolves to its batch id, null when nothing was written. */
  edit: (build: Build) => Promise<string | null>;
  undoable: RelatorioEditor['undoable'];
  announce: (text: string) => void;
}
