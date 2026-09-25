import {
  addPhotosButtonText,
  batchCaptionLabel,
  batchCaptionNote,
  batchScopeText,
  contextCaption,
  contextCaptionParts,
  photoEquipmentOptions,
  photosAddedText,
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
import { photoLocationEnabled } from '../../db/photo-store.ts';
import { importPhotoFiles, PHOTO_ACCEPT, type ImportResult, type ImportTarget } from '../../files/photo-import.ts';
import { encodePhoto } from '../../files/photo-encode.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { requestStorageCheck } from '../../state/storage-reading.ts';
import { useToast } from '../../state/toast.tsx';
import { CaptionComposer, LegendarButton } from './caption-composer.tsx';
import { useCaptionSources } from './use-caption-sources.ts';
import './photos.css';

/*
 * Story 6.4 (FR-45; `70-fotos.html` "Photo capture sheet" and "De qual equipamento?",
 * EXPERIENCE.md › Photo capture sheet): the import path. "Adicionar fotos" opens this bottom
 * sheet; "Escolher arquivos" opens the system picker (several at once). From a sheet the
 * files save at once with the sheet's context caption and `block_id`. Into the gallery the
 * batch asks once "De qual equipamento?": the tree as a picker list plus "Geral", the chosen
 * row prefills a caption field for the whole batch (kept, typed over, or composed in
 * "Legendar"), and "Adicionar N fotos" saves them. A drop of files on a sheet or the gallery
 * takes the same two paths (`useDropZone`).
 */

/** Saves picked or dropped files through the one-shot commit, and says how it went. */
export function usePhotoImport(relatorioId: string): (files: readonly File[], target: ImportTarget) => Promise<ImportResult | null> {
  const session = useSession();
  const { showToast } = useToast();
  const db = session.database;
  const user = session.user;
  return useCallback(
    async (files, target) => {
      if (db === null || user === null || files.length === 0) return null;
      const withLocation = await photoLocationEnabled(db, user.id).catch(() => true);
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
      if (result.saved.length > 0 && result.skipped > 0) showToast(`${photosAddedText(result.saved.length)}. ${skippedFilesText(result.skipped)}`);
      else if (result.saved.length > 0) showToast(photosAddedText(result.saved.length));
      else if (result.skipped > 0) showToast(skippedFilesText(result.skipped));
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
  return (
    <DialogShell className="photo-capture-sheet" overlayClassName="scrim-bottom" isOpen={isOpen} onOpenChange={(open) => (open ? undefined : onClose())} aria-labelledby={titleId}>
      {isOpen ? <SheetBody relatorioId={relatorioId} mode={mode} titleId={titleId} onClose={onClose} initialFiles={initialFiles} /> : null}
    </DialogShell>
  );
}

function SheetBody({
  relatorioId,
  mode,
  titleId,
  onClose,
  initialFiles,
}: {
  relatorioId: string;
  mode: CaptureSheetMode;
  titleId: string;
  onClose: () => void;
  initialFiles: readonly File[] | null;
}) {
  const t = copy.captureSheet;
  const input = useRef<HTMLInputElement>(null);
  const importFiles = usePhotoImport(relatorioId);
  const [files, setFiles] = useState<readonly File[] | null>(initialFiles);

  const picked = (list: File[]) => {
    if (list.length === 0) return;
    if (mode.kind === 'sheet') {
      const target = mode.target();
      onClose();
      void importFiles(list, target);
      return;
    }
    setFiles(list);
  };

  if (mode.kind === 'gallery' && files !== null) {
    return <EquipmentStep relatorioId={relatorioId} snapshot={mode.snapshot} files={files} titleId={titleId} onClose={onClose} onImport={importFiles} />;
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

/** "De qual equipamento?": one tap for the batch, the caption field, "Adicionar N fotos". */
function EquipmentStep({
  relatorioId,
  snapshot,
  files,
  titleId,
  onClose,
  onImport,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  files: readonly File[];
  titleId: string;
  onClose: () => void;
  onImport: (files: readonly File[], target: ImportTarget) => Promise<ImportResult | null>;
}) {
  const t = copy.captureSheet;
  const sources = useCaptionSources(relatorioId, snapshot);
  const options = useMemo(() => photoEquipmentOptions(snapshot), [snapshot]);
  // `undefined`: nothing chosen yet; `null`: "Geral".
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [caption, setCaption] = useState('');
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fieldId = useId();
  const noteId = useId();
  const n = files.length;
  const meta = { step: null, testKey: null, words: { atividades: sources.atividades, locais: sources.locais }, registry: sources.registry };

  const choose = (blockId: string | null) => {
    setChosen(blockId);
    setCaption(blockId === null ? '' : (contextCaption({ block_id: blockId, item_key: null }, snapshot, meta) ?? ''));
  };

  const add = () => {
    if (saving || chosen === undefined) return;
    setSaving(true);
    const target: ImportTarget = { blockId: chosen, itemKey: null, caption: caption.trim() === '' ? null : caption.trim() };
    void onImport(files, target).finally(onClose);
  };

  return (
    <>
      <p className="field-label" id={titleId}>
        {t.whichEquipment} <span className="capture-reason">{batchScopeText(n)}</span>
      </p>
      <div className="capture-options" role="radiogroup" aria-label={t.equipmentList}>
        {options.map((option) => (
          <EquipmentRow key={option.blockId} label={option.text} selected={chosen === option.blockId} onPress={() => choose(option.blockId)} />
        ))}
        <EquipmentRow label={t.general} selected={chosen === null} onPress={() => choose(null)} />
      </div>
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
      <AriaButton className="btn btn-text btn-block capture-cancel" onPress={onClose}>
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
