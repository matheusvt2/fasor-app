import { contextCaptionParts, numberPhotos, type RelatorioSnapshot } from '@app/domain';
import { useMemo } from 'react';
import { CaptionComposer } from './caption-composer.tsx';
import { useCaptionSources } from './use-caption-sources.ts';

/*
 * Story 6.5: the Caption composer for one stored photo, with its sources read only while it
 * is open (the sheet mounts it on "Legendar", so its live queries and word lists never run
 * behind the readings). The rows open on the photo's context parts; the stored caption
 * decides whether it opens in "Editar texto". E6-Q3: the photo itself heads the composer.
 */
export function PhotoCaptionDialog({
  relatorioId,
  snapshot,
  photo,
  onClose,
  onSave,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  photo: { id: string; block_id: string | null; item_key: string | null; caption: string | null; captured_at: string; thumb: Blob | null };
  onClose: () => void;
  onSave: (text: string | null) => void;
}) {
  const sources = useCaptionSources(relatorioId, snapshot);
  const meta = { step: null, testKey: null, words: { atividades: sources.atividades, locais: sources.locais }, registry: sources.registry };
  const number = useMemo(() => numberPhotos(snapshot.files).get(photo.id) ?? null, [snapshot.files, photo.id]);
  return (
    <CaptionComposer
      isOpen
      onClose={onClose}
      photo={{ thumb: photo.thumb, number, capturedAt: photo.captured_at }}
      prefill={contextCaptionParts(photo, snapshot, meta)}
      stored={photo.caption}
      sources={sources}
      onSave={(text) => onSave(text)}
    />
  );
}
