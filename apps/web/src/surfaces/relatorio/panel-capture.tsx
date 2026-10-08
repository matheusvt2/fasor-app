import {
  panelAwaitingRowText,
  panelCancelOps,
  panelProposal,
  panelPhotosAwaiting,
  panelProvenance,
  panelReadingLine,
  panelReadingTarget,
  readingStartedAt,
  readingWait,
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
import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
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
import { restoreFocus } from '../../input/focus-restore.ts';
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
 * "Lendo a foto…"; offline, the mock's reason line; online after a reading that failed or read
 * nothing, why (`panelReadingLine`); the type chips are usable at once. The
 * kernel composes everything shown ("Criar SEC-C09-2 · Chave seccionadora · Coluna 9?", the
 * chips, the provenance lines); "Confirmar" hands the proposal to the tree's create, which
 * commits equipment + block + the photo re-targeted to the new plate in one batch. "Cancelar"
 * and "Fotografar de novo" remove the unconfirmed photo and discard its suggestion. It lives
 * in the tree, not in the palette, which closes when the tile is tapped.
 */

export interface PanelCaptureHandle {
  /** Opens the camera for a block placed as the palette would place it; call it inside the tap. */
  open: (target: PaletteTarget) => void;
  /**
   * Story 13.5 (WAIT-3): reopens the result dialog of a panel photo taken earlier whose dialog
   * was left by navigation, without the camera; nothing opens once the photo is gone or
   * confirmed (the dialog's own rule).
   */
  resume: (photoId: string, target: PaletteTarget) => void;
}

/** One row of the palette's panel photos still waiting (Story 13.5, WAIT-3). */
export interface PanelAwaitingRow {
  photoId: string;
  /** "Lendo a foto…", the offline or failed reason, or the proposal ("Criar SEC-C09-2 · Chave seccionadora · Coluna 9?"). */
  text: string;
}

/**
 * Story 13.5 (WAIT-3): the panel photos taken from the palette of `locationId` whose result
 * dialog was left (`panelPhotosAwaiting`), each with what the dialog would say now
 * (`panelAwaitingRowText` over `panelProposal`).
 */
export function panelAwaitingRows(input: {
  photos: readonly PhotoFileRow[];
  pending: readonly SuggestionRow[];
  locationId: string;
  seedVersion: string;
  locations: readonly LocationRow[];
  equipment: readonly EquipmentRow[];
  online: boolean;
}): PanelAwaitingRow[] {
  return panelPhotosAwaiting(input.photos, input.locationId).map((photo) => {
    const suggestion = panelSuggestionOf(input.pending, photo.id);
    const proposal = panelProposal({ seedVersion: input.seedVersion, locations: input.locations, equipment: input.equipment, paletteLocationId: input.locationId, suggestion, pickedType: null });
    // Review F-13: which text the row shows is the kernel's choice.
    return { photoId: photo.id, text: panelAwaitingRowText({ online: input.online, photo, suggestion, proposal }) };
  });
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
  /**
   * Where the focus goes when the camera closes with no shot or the dialog is cancelled (the
   * palette tile that opened it is gone): a stable control of the tree, e.g. the location's chevron.
   */
  focusAfter?: (target: PaletteTarget) => HTMLElement | null;
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

/** The dialog's waiting line: the kernel's "Lendo a foto…" under 10 s, then the elapsed text ("Lendo… 12 s"). */
function panelWaitText(waiting: string, startedAt: string, nowIso: string): string {
  const wait = readingWait(startedAt, nowIso);
  return wait.cancellable ? wait.text : waiting;
}

/** The device clock as an ISO string, read again every second while `active`. */
function useTickingNow(active: boolean): string {
  const [iso, setIso] = useState(() => toIso(now()));
  useEffect(() => {
    if (!active) return;
    setIso(toIso(now()));
    const timer = setInterval(() => setIso(toIso(now())), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return iso;
}

export function PanelCapture({ relatorioId, seedVersion, locations, equipment, onConfirm, focusAfter, ref }: PanelCaptureProps) {
  const t = copy.sumario.panel;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const [shot, setShot] = useState<Shot | null>(null);
  const shotRef = useRef<Shot | null>(null);
  // The camera returns the focus to its "opener" when it closes; the palette tile is gone by
  // then, so the opener is the stable control `focusAfter` names (none while the dialog is up).
  const lastTarget = useRef<PaletteTarget | null>(null);
  const focusAfterRef = useRef(focusAfter);
  focusAfterRef.current = focusAfter;
  const opener = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const target = lastTarget.current;
        if (target === null || document.querySelector('.detect-dialog') !== null) return null;
        return focusAfterRef.current?.(target) ?? null;
      },
    }),
    [],
  );
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
      lastTarget.current = target;
      shotRef.current = next;
      setShot(next);
      setPicked(null);
      setExpanded(false);
      cameraOpen();
    },
    [cameraOpen],
  );
  const resume = useCallback((photoId: string, target: PaletteTarget) => {
    const next = { target, photoId };
    lastTarget.current = target;
    shotRef.current = next;
    setShot(next);
    setPicked(null);
    setExpanded(false);
  }, []);
  useImperativeHandle(ref, () => ({ open, resume }), [open, resume]);

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
  const nowIso = useTickingNow(photo !== null && (photo.reading_status === 'queued' || photo.reading_status === 'running'));
  const suggestion = shot === null || data == null ? null : panelSuggestionOf(data.pending, shot.photoId);

  /** "Cancelar", Esc, the scrim and "Fotografar de novo": the unconfirmed photo removed and its suggestion discarded. */
  const discard = (refocus = true) => {
    const current = shotRef.current;
    shotRef.current = null;
    setShot(null);
    if (refocus && current !== null && focusAfter !== undefined) restoreFocus(() => focusAfter(current.target), { mode: 'settled' });
    if (current === null || db === null || user === null || photo === null) return;
    const drafts = panelCancelOps({ id: user.id, companyId: user.companyId }, relatorioId, current.photoId, suggestion?.row ?? null, toIso(now()));
    void commitBatch(db, drafts, { newId, now }).catch((error: unknown) => console.error('panel photo not removed', error));
  };

  const isOpen = shot !== null && photo !== null && photo.removed_at === null && photo.reading_kind === 'panel';
  // The camera's fallback input stays the same element whether the dialog shows or not: "Fotografar
  // de novo" clicks it in the same tap that closes the dialog, and a remounted input would lose the file.
  // Both branches are portaled to the body: the tree sits inside the Sumário's row 9, and a numbered
  // row holds no form control of its own (7.5-E2E-006).
  if (!isOpen || shot === null || photo === null)
    return createPortal(
      <>
        {camera.element}
        {null}
      </>,
      document.body,
      'panel-capture',
    );

  const proposal = panelProposal({ seedVersion, locations, equipment, paletteLocationId: shot.target.locationId, suggestion, pickedType: picked });
  const first = suggestion?.value.block_type ?? null;
  const { chips, other } = panelTypeChips(seedVersion, first, expanded);
  const current = picked ?? first;
  // E9-Q10: the kernel says why no proposal is there yet (reading, offline, failed, nothing read).
  const readingLine = panelReadingLine({ online: session.online, photo, suggestion });
  // Story 13.5: from 10 s the waiting line says how long ("Lendo… 12 s"); no cancel here (the
  // dialog's "Cancelar" keeps its Story 9.2 meaning, removing the unconfirmed photo).
  const waitText = readingLine?.kind === 'waiting' ? panelWaitText(readingLine.text, readingStartedAt({ captured_at: photo.captured_at }), nowIso) : null;

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
    discard(false);
    open(target);
  };

  return createPortal(
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
          {/* One live region for every kind: the same element stays while "Lendo a foto…" turns
              into the failed or empty reason, so the change is announced (E9-Q10). Review F-06:
              while waiting it says "Lendo a foto…" once; the ticking age is drawn outside it. */}
          {readingLine === null ? null : (
            <div className="detect-line" role="status">
              {readingLine.kind === 'waiting' ? <span className="visually-hidden">{readingLine.text}</span> : <span className="btn-reason">{readingLine.text}</span>}
            </div>
          )}
          {readingLine?.kind === 'waiting' ? (
            <p className="detect-waiting">{waitText ?? readingLine.text}</p>
          ) : null}
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
          <Button variant="secondary" onPress={() => discard()}>
            {t.cancel}
          </Button>
        </div>
      </DialogShell>
    </>,
    document.body,
    'panel-capture',
  );
}
