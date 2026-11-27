import { hasNotTestedPoint, isUtilityNotTested, notTestedJustification, notTestedOffersPoint, notTestedPointText, notTestedReasonText, textCapOf, type BlockRow, type RelatorioSnapshot } from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { notTestedSynced } from '../../db/sync-store.ts';
import { AudioButton, AudioFieldLines } from '../../speech/audio-field.tsx';
import { useSession } from '../../state/session.tsx';
import type { FichaApi } from './ficha-api.ts';
import { useTypedText } from './ficha-fields.tsx';
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
  snapshot: RelatorioSnapshot;
}) {
  const tag = block.equipment_id === null ? null : (snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? null);
  const t = copy.ficha;
  const db = useSession().database;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const desfazerRef = useRef<HTMLButtonElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  if (block.not_tested === null) return null;
  const reason = notTestedReasonText(block);
  if (reason === null) return null;
  const standing = hasNotTestedPoint(snapshot.points, block.equipment_id);

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
      {/* Story 28.5 (B-8, Q-4): a sheet not tested for the utility's equipment offers no point (the kernel's rule). */}
      {/* Fix batch e24x (D1): the action stays mounted (in an unstyled, empty wrapper once the point stands), so the
          editor its tap opened stays open when its own autosave stores the point; only the button goes. */}
      {/* Review of e24x: hidden once the point stands, so the empty wrapper adds no gap to the sheet's column (the dialog is portaled). */}
      {notTestedOffersPoint(block) ? (
        <div className={standing ? undefined : 'row-wrap not-tested-point'} ref={standing ? undefined : createRef} hidden={standing || undefined}>
          <CreatePointAction
            relatorioId={api.relatorioId}
            snapshot={snapshot}
            seed={() => ({ text: notTestedPointText(block, tag), equipmentId: block.equipment_id, origin: 'not_tested' })}
            // The saved point takes this button away: the focus stays on the band.
            focusAfterSave={() => (createRef.current?.isConnected === true ? null : desfazerRef.current)}
            hideButton={standing}
          />
        </div>
      ) : null}
      {/* Seed v18 (Story 28.4, Bruno's Q-4): the utility's name and the editable justification, the frame's `#/ficha/TP-04`. */}
      {isUtilityNotTested(block) ? <UtilityJustification key={block.id} api={api} block={block} tag={tag} /> : null}
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

/** Story 20.9: the kernel's caps of the mark's two texts. */
const NAME_CAP = textCapOf('block/field', 'not_tested.utility_name');
const TEXT_CAP = textCapOf('block/field', 'not_tested.text');

/**
 * Seed v18, batch e28a (Story 28.4, Bruno's Q-4; `60-ficha.html` `#/ficha/TP-04` and `#/ficha/TC-03`): on a sheet not
 * tested for "Equipamento da concessionária", the utility's name and the justification section 9 prints, both editable
 * while the rest of the sheet is read-only. The text is the kernel's (`notTestedJustification`): Bruno's default with
 * the sheet's TAG and the name filled, the slot left while the name is empty; a rewritten text is stored as the mark's
 * `text` (cleared, or put back to the default, it follows the default again). Each field writes the whole mark.
 */
function UtilityJustification({ api, block, tag }: { api: FichaApi; block: Pick<BlockRow, 'id' | 'not_tested' | 'seed_version'>; tag: string | null }) {
  const t = copy.ficha.utilityJustification;
  const headingId = useId();
  const nameId = useId();
  const textId = useId();
  const mark = block.not_tested!;
  const latest = useRef(mark);
  latest.current = mark;
  const defaultText = notTestedJustification({ ...block, not_tested: { ...mark, text: null } }, tag) ?? '';
  const write = (next: { utility_name?: string | null; text?: string | null }) => {
    const current = latest.current;
    if (api.author === null) return undefined;
    return api.commit([
      notTestedOp(api.author, api.relatorioId, block.id, {
        reason: current.reason,
        text: next.text === undefined ? current.text : next.text,
        at: current.at,
        utility_name: next.utility_name === undefined ? (current.utility_name ?? null) : next.utility_name,
      }),
    ]);
  };
  const name = useTypedText(mark.utility_name ?? '', (text) => write({ utility_name: text.trim() === '' ? null : text.trim() }), { entityId: block.id, field: 'concessionaria-nome' }, { cap: NAME_CAP });
  const text = useTypedText(
    notTestedJustification(block, tag) ?? '',
    (typed) => write({ text: typed.trim() === '' || typed.trim() === defaultText ? null : typed.trim() }),
    { entityId: block.id, field: 'concessionaria-justificativa' },
    { cap: TEXT_CAP },
  );
  // Story 31.7: the justification's audio adds to the stored text (the mark's note), at the polish level.
  const audio = useMemo(() => ({ type: 'sheet_field' as const, block_id: block.id, field: 'not_tested_text' as const }), [block.id]);
  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{t.title}</h2>
      </div>
      <div className="e28-just">
        <div className="field e28-name">
          <label className="field-label" htmlFor={nameId}>
            {t.nameLabel}
          </label>
          <input
            id={nameId}
            className="input"
            value={name.text}
            placeholder={t.namePlaceholder}
            maxLength={NAME_CAP ?? undefined}
            onChange={(event) => name.change(event.target.value)}
            onBlur={() => name.blur()}
          />
          <span className="helper">{name.text.trim() === '' ? t.nameEmpty : t.nameTyped}</span>
        </div>
        <div className="field">
          <div className="section-head">
            <label className="field-label" htmlFor={textId}>
              {t.textLabel}
            </label>
            <AudioButton target={audio} label={t.audioField} />
          </div>
          <textarea
            id={textId}
            className="observation-field"
            value={text.text}
            maxLength={TEXT_CAP ?? undefined}
            onChange={(event) => text.change(event.target.value)}
            onBlur={() => text.blur()}
          />
          <AudioFieldLines target={audio} text={text.text} label={t.audioField} />
          <span className="helper">{t.textHelper}</span>
        </div>
      </div>
    </section>
  );
}
