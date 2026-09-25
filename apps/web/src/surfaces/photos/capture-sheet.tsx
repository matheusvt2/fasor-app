import {
  addPhotosButtonText,
  batchCaptionLabel,
  batchCaptionNote,
  batchScopeText,
  contextCaption,
  contextCaptionParts,
  photoEquipmentGroups,
  photosImportedText,
  photosKeptGeneralText,
  skippedFilesText,
  type RelatorioSnapshot,
} from '@app/domain';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitPhotoCapture } from '../../db/file-commit.ts';
import { useLiveQuery } from '../../db/live.ts';
import { photoLocationEnabled } from '../../db/photo-store.ts';
import { readLastSheet } from '../../db/prefs.ts';
import { importPhotoFiles, PHOTO_ACCEPT, splitImportable, type ImportResult, type ImportTarget } from '../../files/photo-import.ts';
import { encodePhoto } from '../../files/photo-encode.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { requestStorageCheck } from '../../state/storage-reading.ts';
import { requestSyncCycle } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { writeErrorText } from '../../state/use-undoable-edits.ts';
import { CaptionComposer, LegendarButton } from './caption-composer.tsx';
import { assignPhotoBatch } from './photo-ops.ts';
import { useCaptionSources } from './use-caption-sources.ts';
import './photos.css';

/*
 * Story 6.4 (FR-45; `70-fotos.html` "Photo capture sheet" and "De qual equipamento?",
 * EXPERIENCE.md › Photo capture sheet): the import path. "Adicionar fotos" opens this bottom
 * sheet; "Escolher arquivos" opens the system picker (several at once). From a sheet the
 * files save at once with the sheet's context caption and `block_id`. Into the gallery the
 * batch is saved at once as "Geral" (E6-Q8) and asks once "De qual equipamento?": the
 * likely sheets, the tree grouped by location, "Geral"; the chosen row prefills a caption
 * field for the whole batch (kept, typed over, or composed in "Legendar"), and "Adicionar N
 * fotos" puts the sheet and the caption on the saved photos; "Cancelar" leaves them as
 * "Geral". A drop of files on a sheet or the gallery takes the same two paths (`useDropZone`).
 */

export interface PhotoImportOptions {
  /** Files already left out before these (not pictures), counted in the toast. */
  skippedBefore?: number;
  /** E6-Q8: no toast; the caller says how it went once the batch is answered. */
  quiet?: boolean;
}

/** Saves picked or dropped files through the one-shot commit, and says how it went. */
export function usePhotoImport(relatorioId: string): (files: readonly File[], target: ImportTarget, options?: PhotoImportOptions) => Promise<ImportResult | null> {
  const session = useSession();
  const { showToast } = useToast();
  const db = session.database;
  const user = session.user;
  return useCallback(
    async (files, target, options = {}) => {
      const skippedBefore = options.skippedBefore ?? 0;
      if (db === null || user === null) return null;
      if (files.length === 0) {
        if (skippedBefore > 0 && options.quiet !== true) showToast(skippedFilesText(skippedBefore));
        return null;
      }
      // A setting that cannot be read keeps no position (FR-8 errs on the side of privacy).
      const withLocation = await photoLocationEnabled(db, user.id).catch(() => false);
      const result = await importPhotoFiles(files, target, {
        companyId: user.companyId,
        relatorioId,
        actorId: user.id,
        newId,
        now,
        encode: encodePhoto,
        commit: (input) => commitPhotoCapture(db, input, { newId, now }),
        withLocation,
      });
      requestStorageCheck();
      // E6-Q14: saved photos go out now when online, not on the next 60 s tick.
      if (result.saved.length > 0) requestSyncCycle();
      // E6-Q12: the one toast is the kernel's sentence.
      const text = options.quiet === true ? null : photosImportedText(result.saved.length, result.skipped + skippedBefore);
      if (text !== null) showToast(text);
      return result;
    },
    [db, user, relatorioId, showToast],
  );
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer !== null && [...event.dataTransfer.types].includes('Files');
}

/**
 * A drop zone on a computer: while files are dragged over `ref` it reads `dragging` (the
 * surface draws the dashed outline and "Solte para adicionar"); a drop hands the files over.
 */
export function useDropZone(ref: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const latest = useRef(onFiles);
  useEffect(() => {
    latest.current = onFiles;
  }, [onFiles]);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) latest.current(files);
    };
    element.addEventListener('dragenter', enter);
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return () => {
      element.removeEventListener('dragenter', enter);
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }, [ref]);
  return dragging;
}

/** "Solte para adicionar" over a drop zone while files are dragged over it. */
export function DropHint({ dragging }: { dragging: boolean }) {
  if (!dragging) return null;
  return (
    <div className="drop-hint" aria-hidden="true">
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-image" />
      </svg>
      {copy.photos.dropHint}
    </div>
  );
}

export type CaptureSheetMode =
  /** From a sheet: the files save at once with this target. */
  | { kind: 'sheet'; target: () => ImportTarget }
  /** Into the gallery: "De qual equipamento?" first. */
  | { kind: 'gallery'; snapshot: RelatorioSnapshot };

export interface PhotoCaptureSheetProps {
  relatorioId: string;
  isOpen: boolean;
  onClose: () => void;
  mode: CaptureSheetMode;
  /** Files dropped on the gallery: the sheet opens on "De qual equipamento?" with them. */
  initialFiles?: readonly File[] | null;
}

export function PhotoCaptureSheet({ relatorioId, isOpen, onClose, mode, initialFiles = null }: PhotoCaptureSheetProps) {
  const titleId = useId();
  // E6-Q8: Esc and the scrim close through the body, which says what became of a saved batch.
  const close = useRef<(() => void) | null>(null);
  return (
    <DialogShell
      className="photo-capture-sheet"
      overlayClassName="scrim-bottom"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        if (close.current !== null) close.current();
        else onClose();
      }}
      aria-labelledby={titleId}
    >
      {isOpen ? <SheetBody relatorioId={relatorioId} mode={mode} titleId={titleId} onClose={onClose} initialFiles={initialFiles} closeRef={close} /> : null}
    </DialogShell>
  );
}

/** A gallery batch: its pictures are saved on pick as "Geral" (E6-Q8); `ids` is null while they save. */
interface Batch {
  count: number;
  skipped: number;
  ids: string[] | null;
}

const GERAL: ImportTarget = { blockId: null, itemKey: null, caption: null };

function SheetBody({
  relatorioId,
  mode,
  titleId,
  onClose,
  initialFiles,
  closeRef,
}: {
  relatorioId: string;
  mode: CaptureSheetMode;
  titleId: string;
  onClose: () => void;
  initialFiles: readonly File[] | null;
  closeRef: RefObject<(() => void) | null>;
}) {
  const t = copy.captureSheet;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const input = useRef<HTMLInputElement>(null);
  const importFiles = usePhotoImport(relatorioId);
  const { showToast } = useToast();
  const [batch, setBatch] = useState<Batch | null>(null);
  /** What happens once the batch is saved: "Adicionar N fotos" pressed early, or the sheet closed. */
  const settled = useRef<((ids: string[], skipped: number) => void) | null>(null);
  const answered = useRef(false);

  // E6-Q8 (6.4 AC1, "each file is saved locally at once"): the pictures are committed the
  // moment they are picked, as "Geral" with no caption; "De qual equipamento?" then only
  // puts the sheet and the caption on them.
  const startBatch = (list: readonly File[]) => {
    const { images, skipped } = splitImportable(list);
    if (images.length === 0) {
      showToast(skippedFilesText(skipped));
      onClose();
      return;
    }
    setBatch({ count: images.length, skipped, ids: null });
    void importFiles(images, GERAL, { quiet: true })
      .catch(() => null)
      .then((result) => {
        const ids = result?.saved ?? [];
        const left = skipped + (result?.skipped ?? images.length);
        if (settled.current !== null) {
          settled.current(ids, left);
          return;
        }
        if (ids.length === 0) {
          showToast(skippedFilesText(left));
          answered.current = true;
          onClose();
          return;
        }
        setBatch({ count: ids.length, skipped: left, ids });
      });
  };

  // Files dropped on the gallery open straight on "De qual equipamento?", saved at once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || initialFiles === null || mode.kind !== 'gallery') return;
    started.current = true;
    startBatch(initialFiles);
    // Once, on open: `startBatch` reads the latest props through its own closure.
  }, []);

  const finish = (ids: string[], skipped: number, target: { blockId: string | null; caption: string | null } | null) => {
    answered.current = true;
    if (target === null) {
      const text = photosKeptGeneralText(ids.length, skipped);
      if (text !== null) showToast(text);
      return;
    }
    if (db === null || user === null) return;
    void assignPhotoBatch(db, { id: user.id, companyId: user.companyId }, relatorioId, ids, target.blockId, target.caption).then(
      () => {
        const text = photosImportedText(ids.length, skipped);
        if (text !== null) showToast(text);
      },
      (error: unknown) => showToast(writeErrorText(error)),
    );
  };

  /** "Adicionar N fotos": the puts now, or as soon as the batch is saved. */
  const add = (target: { blockId: string | null; caption: string | null }) => {
    if (batch === null) return;
    if (batch.ids !== null) finish(batch.ids, batch.skipped, target);
    else settled.current = (ids, skipped) => finish(ids, skipped, target);
    onClose();
  };

  /** "Cancelar", Esc, the scrim: a saved batch stays as "Geral", and the toast says so. */
  const cancel = () => {
    if (batch !== null && !answered.current) {
      if (batch.ids !== null) finish(batch.ids, batch.skipped, null);
      else settled.current = (ids, skipped) => finish(ids, skipped, null);
    }
    onClose();
  };
  closeRef.current = mode.kind === 'gallery' && batch !== null ? cancel : null;

  const picked = (list: File[]) => {
    if (list.length === 0) return;
    if (mode.kind === 'sheet') {
      const target = mode.target();
      onClose();
      void importFiles(list, target);
      return;
    }
    startBatch(list);
  };

  if (mode.kind === 'gallery' && batch !== null) {
    return <EquipmentStep relatorioId={relatorioId} snapshot={mode.snapshot} count={batch.count} titleId={titleId} onCancel={cancel} onAdd={add} />;
  }

  return (
    <>
      <h2 className="visually-hidden" id={titleId}>
        {t.title}
      </h2>
      <AriaButton className="capture-option" onPress={() => input.current?.click()}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-image" />
        </svg>
        {t.choose}
      </AriaButton>
      <p className="capture-reason">{t.reason}</p>
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        hidden
        tabIndex={-1}
        aria-hidden="true"
        data-testid="photo-import-input"
        onChange={(event) => {
          const list = [...(event.target.files ?? [])];
          event.target.value = '';
          picked(list);
        }}
      />
      <AriaButton className="btn btn-text btn-block capture-cancel" onPress={onClose}>
        {t.cancel}
      </AriaButton>
    </>
  );
}

/**
 * "De qual equipamento?" (`70-fotos.html` 404-425, E6-Q4): the current sheet and the sheets
 * near it first, "Outro equipamento" for the whole relatório grouped as the tree, then
 * "Geral (sem equipamento)"; with no current sheet the grouped list shows directly (in a
 * box that scrolls by itself, so "Geral" is never below all of it). One tap for the batch,
 * the caption field, "Adicionar N fotos".
 */
function EquipmentStep({
  relatorioId,
  snapshot,
  count,
  titleId,
  onCancel,
  onAdd,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  count: number;
  titleId: string;
  onCancel: () => void;
  onAdd: (target: { blockId: string | null; caption: string | null }) => void;
}) {
  const t = copy.captureSheet;
  const db = useSession().database;
  const sources = useCaptionSources(relatorioId, snapshot);
  // The `last_sheet:{relatorio_id}` pref; undefined while it is read.
  const current = useLiveQuery(() => (db === null ? Promise.resolve(null) : readLastSheet(db, relatorioId)), [db, relatorioId], undefined);
  const { nearby, groups } = useMemo(() => photoEquipmentGroups(snapshot, current ?? null), [snapshot, current]);
  const [expanded, setExpanded] = useState(false);
  // `undefined`: nothing chosen yet; `null`: "Geral".
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [caption, setCaption] = useState('');
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();
  const noteId = useId();
  const n = count;
  const meta = { step: null, testKey: null, words: { atividades: sources.atividades, locais: sources.locais }, registry: sources.registry };
  const showGroups = expanded || nearby.length === 0;

  const choose = (blockId: string | null) => {
    setChosen(blockId);
    setCaption(blockId === null ? '' : (contextCaption({ block_id: blockId, item_key: null }, snapshot, meta) ?? ''));
  };

  const add = () => {
    if (saving || chosen === undefined) return;
    setSaving(true);
    onAdd({ blockId: chosen, caption: caption.trim() === '' ? null : caption.trim() });
  };

  return (
    <>
      <p className="field-label" id={titleId}>
        {t.whichEquipment} <span className="capture-reason">{batchScopeText(n)}</span>
      </p>
      {current === undefined ? null : (
        <div className="capture-options" role="radiogroup" aria-label={t.equipmentList}>
          {showGroups
            ? null
            : nearby.map((option) => <EquipmentRow key={option.blockId} label={option.text} selected={chosen === option.blockId} onPress={() => choose(option.blockId)} />)}
          {showGroups ? null : (
            <button type="button" className="capture-option capture-more" aria-expanded="false" onClick={() => setExpanded(true)}>
              {t.otherEquipment}
            </button>
          )}
          {showGroups ? (
            <div className="capture-groups">
              {groups.map((group) => (
                <div key={group.locationId} className="capture-group" role="group" aria-label={group.label}>
                  <p className="capture-group-label" aria-hidden="true">
                    {group.label}
                  </p>
                  {group.options.map((option) => (
                    <EquipmentRow key={option.blockId} label={option.text} selected={chosen === option.blockId} onPress={() => choose(option.blockId)} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          <EquipmentRow label={t.general} selected={chosen === null} onPress={() => choose(null)} />
        </div>
      )}
      {chosen === undefined ? null : (
        <div className="capture-caption">
          <label className="field-label" htmlFor={fieldId}>
            {batchCaptionLabel(n)}
          </label>
          <div className="field">
            <textarea id={fieldId} className="observation-field" value={caption} aria-describedby={noteId} onChange={(event) => setCaption(event.target.value)} />
          </div>
          <p className="capture-reason" id={noteId}>
            {batchCaptionNote(n)}
          </p>
          <LegendarButton onPress={() => setComposing(true)} />
          <Button variant="primary" block onPress={add}>
            {addPhotosButtonText(n)}
          </Button>
          <CaptionComposer
            isOpen={composing}
            onClose={() => setComposing(false)}
            prefill={contextCaptionParts({ block_id: chosen, item_key: null }, snapshot, meta)}
            stored={caption.trim() === '' ? null : caption}
            sources={sources}
            onSave={(text) => setCaption(text ?? '')}
          />
        </div>
      )}
      <AriaButton className="btn btn-text btn-block capture-cancel" onPress={onCancel}>
        {t.cancel}
      </AriaButton>
    </>
  );
}

function EquipmentRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <button type="button" className={selected ? 'capture-option is-selected' : 'capture-option'} role="radio" aria-checked={selected} onClick={onPress}>
      {label}
    </button>
  );
}
