import { toIso } from '@app/domain';
import { useEffect, useState } from 'react';
import { now } from '../clock.ts';
import { previewBlob } from '../db/file-store.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSyncActions } from '../state/sync-actions.ts';

/**
 * The object URL of an attached image, for an `UploadTile` thumbnail or the brand preview.
 * The bytes come from this device when it picked them (the original, which is all it has
 * before the upload lands) and from `GET /api/files/{id}/thumb` otherwise — asked for here,
 * by a surface, and never by a sync cycle (AC 2.2-3). Moved out of the Empresa tab by
 * batch e27c (Story 27.12) so the cover tile of Etapa 1 draws its thumbnail the same way.
 */
export function useAssetUrl(db: AppDatabase | null, fileId: string | null): string | null {
  const { fetchFile } = useSyncActions();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (db === null || fileId === null) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    void previewBlob(db, fileId, { fetchFile, nowIso: toIso(now()) }).then((blob) => {
      if (cancelled || blob === null) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created !== null) URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [db, fileId, fetchFile]);
  return url;
}
