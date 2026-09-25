import { hasNotTestedPoint, notTestedPointText, notTestedReasonText, type BlockRow, type RelatorioSnapshot } from '@app/domain';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { notTestedSynced } from '../../db/sync-store.ts';
import { useSession } from '../../state/session.tsx';
import type { FichaApi } from './ficha-api.ts';
import { notTestedOp } from './ficha-ops.ts';
import { CreatePointAction } from '../points/create-point-action.tsx';

/*
 * Story 5.9 (`key-sheet-states.html` frame (a)): the band above the sheet's content once
 * `block.not_tested !== null`, mock markup verbatim. "Desfazer" clears the mark at once
 * while its own write is not yet synced (nothing to lose); once the server has it, a
 * Confirm dialog asks first (Design Notes: a per-write gate, `notTestedSynced`).
 * Story 6.6: under the band, "Criar ponto de atenção" writes the sheet's section 8 point
 * (`origin: not_tested`, its equipment, the justification as text), which replaces the
 * entry the sheet lists by itself; absent once such a point stands.
 */
export function NotTestedBand({
  api,
  block,
  snapshot,
}: {
  api: FichaApi;
  block: Pick<BlockRow, 'id' | 'not_tested' | 'seed_version' | 'equipment_id'>;
  snapshot?: RelatorioSnapshot;
}) {
  const t = copy.ficha;
  const db = useSession().database;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const desfazerRef = useRef<HTMLButtonElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
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
        <button type="button" className="btn btn-text" ref={desfazerRef} onClick={() => void desfazer()}>
          {t.desfazer}
        </button>
      </div>
      {snapshot === undefined || hasNotTestedPoint(snapshot.points, block.equipment_id) ? null : (
        <div className="row-wrap not-tested-point" ref={createRef}>
          <CreatePointAction
            relatorioId={api.relatorioId}
            snapshot={snapshot}
            seed={() => ({ text: notTestedPointText(block), equipmentId: block.equipment_id, origin: 'not_tested' })}
            // The saved point takes this button away: the focus stays on the band.
            focusAfterSave={() => (createRef.current?.isConnected === true ? null : desfazerRef.current)}
          />
        </div>
      )}
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
