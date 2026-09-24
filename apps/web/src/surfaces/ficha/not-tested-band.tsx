import { notTestedReasonText, type BlockRow } from '@app/domain';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { notTestedSynced } from '../../db/sync-store.ts';
import { useSession } from '../../state/session.tsx';
import type { FichaApi } from './ficha-api.ts';
import { notTestedOp } from './ficha-ops.ts';

/*
 * Story 5.9 (`key-sheet-states.html` frame (a)): the band above the sheet's content once
 * `block.not_tested !== null`, mock markup verbatim. "Desfazer" clears the mark at once
 * while its own write is not yet synced (nothing to lose); once the server has it, a
 * Confirm dialog asks first (Design Notes: a per-write gate, `notTestedSynced`).
 */
export function NotTestedBand({ api, block }: { api: FichaApi; block: Pick<BlockRow, 'id' | 'not_tested' | 'seed_version'> }) {
  const t = copy.ficha;
  const db = useSession().database;
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (block.not_tested === null) return null;
  const reason = notTestedReasonText(block);
  if (reason === null) return null;

  const undo = () => {
    void api.edit((_blocks, by) => [notTestedOp(by, api.relatorioId, block.id, null)]).catch(() => undefined);
  };

  const desfazer = async () => {
    const synced = db === null ? false : await notTestedSynced(db, block.id);
    if (synced) {
      setConfirmOpen(true);
      return;
    }
    undo();
  };

  return (
    <>
      <div className="not-tested-band" role="status">
        <span className="band-text">
          {t.notTestedBandBefore}
          <span className="band-reason">{reason}</span>
          {t.notTestedBandAfter}
        </span>
        <button type="button" className="btn btn-text" onClick={() => void desfazer()}>
          {t.desfazer}
        </button>
      </div>
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.notTestedConfirmTitle}
        description={t.notTestedConfirmDescription}
        confirmLabel={t.notTestedConfirmAction}
        onConfirm={undo}
      />
    </>
  );
}
