import { captionSavedText, contextCaption, getSeed, numberPhotos, type BlockRow, type RelatorioSnapshot, type SeedWord, type SheetStep } from '@app/domain';
import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useBlockPhotoTiles, useLocalWordRows, type PhotoTile } from '../../db/photo-store.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { useSync } from '../../state/sync.tsx';
import type { ToastState } from '../../state/toast.tsx';
import { usePointDraftRecovery } from '../points/point-draft-recovery.ts';
import { useDropZone, usePhotoImport } from '../photos/capture-sheet.tsx';
import { setPhotoCaption } from '../photos/photo-ops.ts';
import type { ChecklistPhotos } from './checklist-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { useSheetCamera } from './photo-openers.tsx';
import { isSheetStep } from './use-ficha-steps.ts';
import { stepOnScreen, testKeyOnScreen } from './use-on-screen.ts';
import type { CaptureTarget } from './use-photo-capture.ts';

const NO_SEED_WORDS: { atividades: readonly SeedWord[]; locais: readonly SeedWord[] } = { atividades: [], locais: [] };

export interface FichaPhotos {
  /** The capture target, read when a camera opens: the section on screen then, the item if any. */
  photoTarget: (itemKey: string | null) => CaptureTarget;
  sheetCamera: ReturnType<typeof useSheetCamera>;
  checklistPhotos: ChecklistPhotos;
  importTarget: CaptureTarget | null;
  setImportTarget: Dispatch<SetStateAction<CaptureTarget | null>>;
  captioning: PhotoTile | null;
  setCaptioning: Dispatch<SetStateAction<PhotoTile | null>>;
  saveCaption: (tile: PhotoTile, text: string | null) => void;
  fichaMain: RefObject<HTMLDivElement | null>;
  dragging: boolean;
}

export function useFichaPhotos({
  relatorioId,
  snapshot,
  block,
  current,
  db,
  api,
  showToast,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  current: SheetStep;
  db: AppDatabase | null;
  api: FichaApi;
  showToast: ToastState['showToast'];
}): FichaPhotos {
  const blockId = block.id;
  // --- Story 6.1: the camera, captioned from where the engineer stands --------------------
  const sync = useSync();
  const localWords = useLocalWordRows(db);
  const seedWords = useMemo(() => {
    try {
      const seed = getSeed(block.seed_version, 'cabine_primaria');
      return { atividades: seed.atividades, locais: seed.locais };
    } catch {
      return NO_SEED_WORDS;
    }
  }, [block.seed_version]);
  /** The capture target, read when a camera opens: the section on screen then, the item if any. */
  const photoTarget = (itemKey: string | null): CaptureTarget => {
    const onScreen = stepOnScreen();
    const step: SheetStep = itemKey !== null ? 'verificacoes' : isSheetStep(onScreen) ? onScreen : current;
    const testKey = step === 'ensaios' ? testKeyOnScreen() : null;
    return {
      blockId,
      itemKey,
      caption: contextCaption({ block_id: blockId, item_key: itemKey }, snapshot, { step, testKey, words: seedWords, registry: localWords }),
    };
  };
  const sheetCamera = useSheetCamera(relatorioId, () => photoTarget(null));
  // E6-Q2, FR-61: a point typed in an NC row's dialog before a reload is offered back here.
  usePointDraftRecovery(relatorioId);
  const photoTiles = useBlockPhotoTiles(db, relatorioId, blockId);
  const { retryUpload } = sync;
  // --- Stories 6.4/6.5: "Adicionar fotos" (and a drop on a computer) and "Legendar" -------
  const [importTarget, setImportTarget] = useState<CaptureTarget | null>(null);
  const [captioning, setCaptioning] = useState<PhotoTile | null>(null);
  const importFiles = usePhotoImport(relatorioId);
  const fichaMain = useRef<HTMLDivElement>(null);
  const dragging = useDropZone(fichaMain, (files) => void importFiles(files, photoTarget(null)));
  const checklistPhotos: ChecklistPhotos = {
    tiles: photoTiles,
    target: (itemKey) => photoTarget(itemKey),
    retry: (fileId) => void retryUpload?.(fileId),
    addPhotos: (itemKey) => setImportTarget(photoTarget(itemKey)),
    caption: (tile) => setCaptioning(tile),
  };
  const saveCaption = (tile: PhotoTile, text: string | null) => {
    if (db === null || api.author === null) return;
    void setPhotoCaption(db, api.author, relatorioId, tile.id, text).then(() => showToast(captionSavedText(numberPhotos(snapshot.files).get(tile.id) ?? null)));
  };
  return { photoTarget, sheetCamera, checklistPhotos, importTarget, setImportTarget, captioning, setCaptioning, saveCaption, fichaMain, dragging };
}
