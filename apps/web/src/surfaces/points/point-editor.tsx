import {
  createPointOp,
  extractPhotoRefs,
  newPointRow,
  numberPhotos,
  photoRefLabel,
  pointOrderText,
  pointTitle,
  putPointOp,
  recurringFindings,
  type OpDraft,
  type PointRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Chip, FormDialog } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { pointRowsOf } from '../../db/home-store.ts';
import { useRelatorioPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { newId } from '../../ids.ts';
import { useSectionTextArea } from '../../input/use-section-text-area.ts';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { PhotoRefTile } from './photo-ref-tile.tsx';
import { insertPhotoChip, insertPlainText, quickTextAt, relabelPhotoChips, renderPointText } from './point-text-editor.ts';
import './points.css';

/*
 * Story 6.6 (`72-pontos.html` "4 in edit mode"): the point of attention editor. The text is
 * the section text editor's `contenteditable` area with photo-reference chips ("Imagem N",
 * stored as `[[foto:<id>]]`, never a number), the "Textos rápidos" chips insert the seed's
 * recurring findings as plain text at the caret, "Fotos referenciadas" lists the cited
 * photos and opens the picker of the relatório's live photos, and "Ação recomendada" is a
 * plain field. "Concluir" commits one batch: the `point` create on a new point, a put per
 * changed field after. No priority, deadline or owner field (`source-deltas.md` row 29), no
 * Dictation button (Epic 9), no photo draft (FR-75).
 *
 * The same editor opens inline on the Points surface (`variant: 'card'`, the mock's
 * `.is-editing` card) and in a Form dialog from an NC row or an untested sheet.
 */

/** What a new point starts with: its text, its equipment and where it came from. */
export interface PointSeed {
  text: string;
  equipmentId: string | null;
  origin: PointRow['origin'];
}

export interface PointEditorProps {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  /** The point being edited, or null for a new one. */
  point: PointRow | null;
  /** A new point's start; ignored when editing. */
  seed?: PointSeed;
  /** 1-based position of the edited point among the live ones, and how many there are. */
  position?: number;
  total?: number;
  /** Called after "Concluir": the point id when a write landed, null when nothing changed. */
  onDone: (pointId: string | null) => void;
  onCancel: () => void;
  /** "Remover ponto" of an existing point (the caller confirms). */
  onRemove?: () => void;
  /** The heading id a dialog names itself by; the card names itself. */
  variant: 'card' | 'dialog';
}

const EMPTY_SEED: PointSeed = { text: '', equipmentId: null, origin: 'manual' };

export function PointEditor({ relatorioId, snapshot, point, seed = EMPTY_SEED, position, total, onDone, onCancel, onRemove, variant }: PointEditorProps) {
  const t = copy.points;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const edits = useUndoableEdits();
  const tiles = useRelatorioPhotoTiles(db, relatorioId);

  const numbers = useMemo(() => numberPhotos(snapshot.files), [snapshot.files]);
  const numbersRef = useRef(numbers);
  numbersRef.current = numbers;
  const labelOf = useCallback((id: string) => {
    const n = numbersRef.current.get(id);
    return n === undefined ? copy.points.removedPhoto : photoRefLabel(n);
  }, []);

  const initialText = point?.text ?? seed.text;
  const [text, setText] = useState(initialText);
  const [action, setAction] = useState(point?.action ?? '');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const area = useSectionTextArea({
    initialText,
    onChange: setText,
    render: (element, value) => renderPointText(element, value, labelOf),
    paste: insertPlainText,
  });
  const { areaRef, editAtCaret } = area;

  // A photo added or removed elsewhere renumbers the chips already drawn.
  useEffect(() => {
    if (areaRef.current !== null) relabelPhotoChips(areaRef.current, labelOf);
  }, [numbers, areaRef, labelOf]);

  // The text is where the editor starts: typing is the first thing a person does here.
  useEffect(() => {
    const frame = requestAnimationFrame(() => areaRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [areaRef]);

  const refs = useMemo(() => extractPhotoRefs(text), [text]);
  const tileOf = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);
  const findings = recurringFindings(snapshot.relatorio.seed_version);
  const equipmentTitle = pointTitle({ equipment_id: point?.equipment_id ?? seed.equipmentId }, snapshot);

  const textLabelId = useId();
  const helperId = useId();
  const photosLabelId = useId();
  const actionId = useId();

  const insertQuick = (value: string) => editAtCaret((element, range) => insertPlainText(element, range, quickTextAt(element, range, value)));

  const pick = (id: string) => {
    editAtCaret((element, range) => insertPhotoChip(element, range, id, labelOf(id)));
    setPicking(false);
  };

  const unref = (id: string) =>
    editAtCaret((element) => {
      for (const chip of element.querySelectorAll<HTMLElement>('.var-chip.photo-ref[data-photo]')) {
        if (chip.dataset.photo === id) chip.remove();
      }
    });

  async function save(): Promise<void> {
    if (db === null || user === null || saving) return;
    const author = { id: user.id, companyId: user.companyId };
    const actionValue = action.trim() === '' ? null : action.trim();
    const pointId = point?.id ?? newId();
    setSaving(true);
    let batch: string | null;
    try {
      batch = await edits.write(async () => {
        const fresh = await pointRowsOf(db, relatorioId);
        const drafts: OpDraft[] = [];
        if (point === null) {
          if (text.trim() === '' && actionValue === null) return null;
          const row = newPointRow({ id: pointId, relatorioId, text, equipmentId: seed.equipmentId, origin: seed.origin, action: actionValue }, fresh);
          drafts.push(createPointOp(author, row));
        } else {
          const current = fresh.find((row) => row.id === point.id);
          if (current === undefined || current.removed_at !== null) {
            edits.notify(t.gone);
            return null;
          }
          if (text !== current.text) drafts.push(putPointOp(author, relatorioId, point.id, 'text', text));
          if (actionValue !== current.action) drafts.push(putPointOp(author, relatorioId, point.id, 'action', actionValue));
          if (drafts.length === 0) return null;
        }
        return (await commitBatch(db, drafts, { newId, now })).batch_id;
      });
    } catch {
      // Refused: the queue toasted it and the editor keeps what was typed.
      setSaving(false);
      return;
    }
    setSaving(false);
    onDone(batch === null ? null : pointId);
  }

  const order = position === undefined || total === undefined ? t.newOrder : pointOrderText(position, total);

  const body = (
    <div className="poa-body">
      <div>
        <span className="poa-order">{order}</span>
      </div>

      <div className="field">
        <span className="field-label">{t.equipmentLabel}</span>
        <p className="poa-equipment">{equipmentTitle}</p>
      </div>

      <div className="field">
        <span className="field-label" id={textLabelId}>
          {t.textLabel}
        </span>
        {findings.length === 0 ? null : (
          <>
            <p className="section-note poa-quick-note" aria-hidden="true">
              {t.quickTexts}
            </p>
            <div className="chip-row" role="group" aria-label={t.quickTexts}>
              {findings.map((finding) => (
                <Chip key={finding.label} onPress={() => insertQuick(finding.text)}>
                  {finding.label}
                </Chip>
              ))}
            </div>
          </>
        )}
        <div {...area.areaProps} className="observation-field poa-text-area" aria-labelledby={textLabelId} aria-describedby={helperId} />
        <span className="helper" id={helperId}>
          {t.textHelper}
        </span>
      </div>

      <div className="field">
        <span className="field-label" id={photosLabelId}>
          {t.photosLabel}
        </span>
        <div className="poa-photo-picker" role="group" aria-labelledby={photosLabelId}>
          {refs.map((id) => (
            <PhotoRefTile
              key={id}
              thumb={tileOf.get(id)?.thumb ?? null}
              number={numbers.get(id) ?? null}
              label={t.unrefPhotoLabel(labelOf(id))}
              onPress={() => unref(id)}
            />
          ))}
          <Button variant="secondary" onPress={() => setPicking(true)}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-image" />
            </svg>
            {t.choosePhotos}
          </Button>
        </div>
      </div>

      <div className="poa-fields-edit">
        <div className="field">
          <label className="field-label" htmlFor={actionId}>
            {t.actionLabel}
          </label>
          <textarea id={actionId} className="observation-field poa-action" value={action} onChange={(event) => setAction(event.target.value)} />
        </div>
      </div>

      <div className="poa-edit-actions">
        <Button variant="primary" onPress={() => void save()}>
          {t.concluir}
        </Button>
        <Button variant="secondary" onPress={onCancel}>
          {t.cancel}
        </Button>
        {onRemove === undefined ? null : (
          <Button variant="destructive" onPress={onRemove}>
            {t.removePoint}
          </Button>
        )}
      </div>

      <PhotoPicker isOpen={picking} onOpenChange={setPicking} tiles={tiles} numbers={numbers} onPick={pick} />
    </div>
  );

  if (variant === 'dialog') return body;
  return (
    <article className="point-of-attention-card is-editing" aria-label={t.editingLabel(position ?? null)}>
      {body}
    </article>
  );
}

/** The picker of the relatório's live photos (`key-photos.html` tiles with their number). */
function PhotoPicker({
  isOpen,
  onOpenChange,
  tiles,
  numbers,
  onPick,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tiles: readonly PhotoTile[];
  numbers: ReadonlyMap<string, number>;
  onPick: (id: string) => void;
}) {
  const t = copy.points;
  return (
    <FormDialog isOpen={isOpen} onOpenChange={onOpenChange} title={t.pickerTitle} className="poa-picker-dialog">
      {tiles.length === 0 ? (
        <p className="section-note">{t.pickerEmpty}</p>
      ) : (
        <div className="poa-picker-grid" role="group" aria-label={t.pickerLabel}>
          {tiles.map((tile) => {
            const n = numbers.get(tile.id) ?? null;
            return (
              <PhotoRefTile
                key={tile.id}
                thumb={tile.thumb}
                number={n}
                label={t.pickPhotoLabel(n === null ? t.removedPhoto : photoRefLabel(n), tile.caption)}
                onPress={() => onPick(tile.id)}
              />
            );
          })}
        </div>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          {t.cancel}
        </Button>
      </div>
    </FormDialog>
  );
}

/** "Criar ponto de atenção" from a sheet (an NC row, an untested sheet): the editor in a Form dialog. */
export function PointEditorDialog({
  isOpen,
  onOpenChange,
  relatorioId,
  snapshot,
  seed,
  onDone,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  seed: PointSeed;
  onDone: (pointId: string | null) => void;
}) {
  return (
    <FormDialog isOpen={isOpen} onOpenChange={onOpenChange} title={copy.points.createFromRow} className="point-editor-dialog">
      <PointEditor variant="dialog" relatorioId={relatorioId} snapshot={snapshot} point={null} seed={seed} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </FormDialog>
  );
}
