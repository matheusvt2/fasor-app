import {
  panelCancelOps,
  panelProposal,
  panelProvenance,
  panelReadingTarget,
  panelSuggestionOf,
  panelTypeChips,
  suggestionRowSchema,
  toIso,
  type EquipmentBlockType,
  type EquipmentRow,
  type JsonValue,
  type LocationRow,
  type PhotoFileRow,
  type SuggestionRow,
} from '@app/domain';
import { useCallback, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, Chip, TextButton } from '../../components/index.ts';
import { CropThumb } from '../../components/crop-thumb.tsx';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { SuggestionField } from '../../components/suggestion-field.tsx';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { localFileRow } from '../../db/file-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useCamera } from '../ficha/camera-view.tsx';
import type { CaptureTarget } from '../ficha/use-photo-capture.ts';
import type { PaletteTarget, PanelPhotoInput } from './block-palette-field.tsx';

/*
 * Story 9.2 (FR-38, `40-relatorio-overview.html` `#relatorio-dlg-detect` and
 * `#relatorio-dlg-detect-result`): "Fotografar equipamento". The palette's camera row opens
 * the app's single-shot camera (the real viewfinder stands in for the mock's simulated one);
 * the shot is a relatório photo created with the `panel` reading of the palette's location.
 * Once its row is on the device the result dialog opens: while the server reads it (online),
 * "Lendo a foto…"; offline, the mock's reason line; the type chips are usable at once. The
 * kernel composes everything shown ("Criar SEC-C09-2 · Chave seccionadora · Coluna 9?", the
 * chips, the provenance lines); "Confirmar" hands the proposal to the tree's create, which
 * commits equipment + block + the photo re-targeted to the new plate in one batch. "Cancelar"
 * and "Fotografar de novo" remove the unconfirmed photo and discard its suggestion. It lives
 * in the tree, not in the palette, which closes when the tile is tapped.
 */

export interface PanelCaptureHandle {
  /** Opens the camera for a block placed as the palette would place it; call it inside the tap. */
  open: (target: PaletteTarget) => void;
}

/** What "Confirmar" asks the tree to create. */
export interface PanelConfirm {
  type: EquipmentBlockType;
  locationId: string;
  anchorBlockId: string | null;
  photo: PanelPhotoInput;
}

export interface PanelCaptureProps {
  relatorioId: string;
  seedVersion: string;
  locations: readonly LocationRow[];
  equipment: readonly EquipmentRow[];
  onConfirm: (input: PanelConfirm) => void;
  ref?: Ref<PanelCaptureHandle>;
}

interface Shot {
  target: PaletteTarget;
  photoId: string;
}

function captureTarget(shot: Shot): CaptureTarget {
  return {
    blockId: null,
    itemKey: null,
    caption: null,
    fileId: shot.photoId,
    reading: { kind: 'panel', target: panelReadingTarget(shot.target.locationId) as JsonValue },
  };
}

export function PanelCapture({ relatorioId, seedVersion, locations, equipment, onConfirm, ref }: PanelCaptureProps) {
  const t = copy.sumario.panel;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const [shot, setShot] = useState<Shot | null>(null);
  const shotRef = useRef<Shot | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [picked, setPicked] = useState<EquipmentBlockType | null>(null);
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const chipsLabelId = useId();

  const camera = useCamera(
    relatorioId,
    () => captureTarget(shotRef.current ?? { target: { locationId: '', anchorBlockId: null }, photoId: newId() }),
    opener,
    { singleShot: true, shotHint: () => t.cameraHint },
  );
  const cameraOpen = camera.open;

  const open = useCallback(
    (target: PaletteTarget) => {
      const next = { target, photoId: newId() };
      shotRef.current = next;
      setShot(next);
      setPicked(null);
      setExpanded(false);
      cameraOpen();
    },
    [cameraOpen],
  );
  useImperativeHandle(ref, () => ({ open }), [open]);

  const photoId = shot?.photoId ?? null;
  const data = useLiveQuery(async () => {
    if (db === null || photoId === null) return null;
    const [photo, records] = await Promise.all([localFileRow(db, photoId), db.entities.where('entity').equals('suggestion').toArray()]);
    const pending: SuggestionRow[] = [];
    for (const record of records) {
      const parsed = suggestionRowSchema.safeParse(record.row);
      if (parsed.success && parsed.data.status === 'pending' && parsed.data.source.photo_id === photoId) pending.push(parsed.data);
    }
    return { photo: photo !== null && photo.kind === 'photo' ? (photo as PhotoFileRow) : null, pending };
  }, [db, photoId]);

  const photo = data?.photo ?? null;
  const suggestion = shot === null || data == null ? null : panelSuggestionOf(data.pending, shot.photoId);

  /** "Cancelar", Esc, the scrim and "Fotografar de novo": the unconfirmed photo removed and its suggestion discarded. */
  const discard = () => {
    const current = shotRef.current;
    shotRef.current = null;
    setShot(null);
    if (current === null || db === null || user === null || photo === null) return;
    const drafts = panelCancelOps({ id: user.id, companyId: user.companyId }, relatorioId, current.photoId, suggestion?.row ?? null, toIso(now()));
    void commitBatch(db, drafts, { newId, now }).catch((error: unknown) => console.error('panel photo not removed', error));
  };

  const isOpen = shot !== null && photo !== null && photo.removed_at === null && photo.reading_kind === 'panel';
  if (!isOpen || shot === null || photo === null) return camera.element;

  const proposal = panelProposal({ seedVersion, locations, equipment, paletteLocationId: shot.target.locationId, suggestion, pickedType: picked });
  const first = suggestion?.value.block_type ?? null;
  const { chips, other } = panelTypeChips(seedVersion, first, expanded);
  const current = picked ?? first;
  const offline = !session.online && suggestion === null;
  const waiting = session.online && suggestion === null && (photo.reading_status === 'queued' || photo.reading_status === 'running');

  const confirm = () => {
    if (proposal === null) return;
    const target = shot.target;
    shotRef.current = null;
    setShot(null);
    onConfirm({
      type: proposal.type,
      locationId: proposal.location.id,
      anchorBlockId: proposal.location.id === target.locationId ? target.anchorBlockId : null,
      photo: {
        id: shot.photoId,
        suggestion: suggestion === null || proposal.suggestionStatus === null ? null : { row: suggestion.row, status: proposal.suggestionStatus },
      },
    });
  };

  const again = () => {
    const target = shot.target;
    discard();
    open(target);
  };

  return (
    <>
      {camera.element}
      <DialogShell
        className="form-dialog detect-dialog"
        overlayClassName="detect-scrim"
        isOpen
        onOpenChange={(next) => {
          if (!next) discard();
        }}
        aria-labelledby={titleId}
      >
        <h2 className="dialog-title" id={titleId}>
          {t.title}
        </h2>
        <div className="detect-result">
          {waiting ? (
            <p className="detect-waiting" role="status">
              {t.waiting}
            </p>
          ) : null}
          {offline ? <span className="btn-reason">{t.offline}</span> : null}
          {proposal === null ? null : (
            <SuggestionField
              label={t.newBlock}
              state={proposal.trust === 'verify' ? 'verify' : 'suggested'}
              onConfirm={confirm}
              crop={suggestion === null ? undefined : <CropThumb photoId={shot.photoId} bbox={suggestion.row.source.bbox} label={t.newBlock} source="panel" />}
            >
              <span className="sv-main">{proposal.text}</span>
              <span className="sv-sub">{proposal.locationPath}</span>
            </SuggestionField>
          )}
          {proposal === null || suggestion === null ? null : (
            <ul className="prov-list" aria-label={t.provLabel}>
              {panelProvenance(proposal, suggestion).map((item) => (
                <li key={item.label}>
                  <b>{item.label}</b>
                  {item.text}
                </li>
              ))}
            </ul>
          )}
          <span className="field-label" id={chipsLabelId}>
            {first === null ? t.pickType : t.wrongType}
          </span>
          <div className="chip-row chips-recent" role="group" aria-labelledby={chipsLabelId}>
            {chips.map((chip) => (
              <Chip key={chip.type} isSelected={chip.type === current} onSelectedChange={() => setPicked(chip.type)}>
                {chip.label}
              </Chip>
            ))}
            {other ? (
              <AriaButton className="chip chip-other" onPress={() => setExpanded(true)}>
                {t.other}
              </AriaButton>
            ) : null}
          </div>
          <span className="helper">{t.helper}</span>
        </div>
        <div className="dialog-actions">
          <TextButton onPress={again}>{t.again}</TextButton>
          <Button variant="secondary" onPress={discard}>
            {t.cancel}
          </Button>
        </div>
      </DialogShell>
    </>
  );
}
