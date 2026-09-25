import { useEffect } from 'react';
import { listDrafts } from '../../db/drafts.ts';
import { useDrafts } from '../../state/drafts.tsx';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { writeErrorText } from '../../state/use-undoable-edits.ts';
import { pointDraftValue, POINT_DRAFT_SURFACE, writePoint } from './point-writes.ts';

/*
 * E6-Q2, FR-61: a point editor's draft outlives the editor. The editor is a dialog or an
 * inline card, so after a reload it is closed and no source of its key is mounted; the
 * surfaces that write points (the sheet and the Points surface) mount this instead. For
 * every point draft of this relatório on the device it registers a source that holds
 * nothing of its own (`read` is null, so a tab-hide never rewrites the row) and whose
 * "Recuperar" writes the draft through the editor's own write path: the create op of a new
 * point, or the field puts of a stored one.
 */
export function usePointDraftRecovery(relatorioId: string): void {
  const session = useSession();
  const db = session.database;
  const userId = session.user?.id ?? null;
  const companyId = session.user?.companyId ?? null;
  const { register } = useDrafts();
  const { showToast } = useToast();
  useEffect(() => {
    if (db === null || userId === null || companyId === null) return;
    const author = { id: userId, companyId };
    let cancelled = false;
    const unregister: (() => void)[] = [];
    void listDrafts(db).then(
      (rows) => {
        if (cancelled) return;
        for (const row of rows) {
          if (row.surface !== POINT_DRAFT_SURFACE) continue;
          const draft = pointDraftValue(row.value);
          if (draft === null || draft.relatorio_id !== relatorioId) continue;
          unregister.push(
            register({
              surface: POINT_DRAFT_SURFACE,
              entity_id: row.entity_id,
              read: () => null,
              apply: (value) => {
                const recovered = pointDraftValue(value);
                if (recovered === null) return;
                const link = recovered.is_new ? { equipmentId: recovered.equipmentId, origin: recovered.origin } : null;
                void writePoint(db, author, relatorioId, row.entity_id, recovered, ['text', 'action'], link).catch((error: unknown) => showToast(writeErrorText(error)));
              },
            }),
          );
        }
      },
      () => {},
    );
    return () => {
      cancelled = true;
      unregister.forEach((drop) => drop());
    };
  }, [db, userId, companyId, relatorioId, register, showToast]);
}
