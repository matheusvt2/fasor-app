import type { BlockRow, EquipmentRow, RelatorioSnapshot } from '@app/domain';
import { copy } from '../../copy/pt-br.ts';
import { NotTestedDialog } from '../relatorio/not-tested-dialog.tsx';
import { TagDialog } from '../relatorio/tag-dialogs.tsx';
import { PhotoCaptureSheet } from '../photos/capture-sheet.tsx';
import { PhotoCaptionDialog } from '../photos/photo-caption-dialog.tsx';
import type { FichaActions } from './use-ficha-actions.ts';
import type { FichaPhotos } from './use-ficha-photos.ts';

/** The sheet's dialogs and sheets: rename the TAG, add photos, caption one, mark not tested. */
export function FichaDialogs({
  relatorioId,
  snapshot,
  block,
  equipment,
  own,
  tag,
  photos,
  actions,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  equipment: EquipmentRow[];
  own: EquipmentRow | undefined;
  tag: string;
  photos: FichaPhotos;
  actions: FichaActions;
}) {
  const { importTarget, setImportTarget, photoTarget, captioning, setCaptioning, saveCaption } = photos;
  const { renaming, setRenaming, rename, notTestedDialogOpen, setNotTestedDialogOpen, markNotTested } = actions;
  return (
    <>
      {renaming && own !== undefined ? (
        <TagDialog
          title={copy.sumario.tagDialogs.renameTagTitle(tag)}
          action={copy.sumario.tagDialogs.save}
          initial={tag}
          equipment={equipment}
          blocks={snapshot.blocks}
          locations={snapshot.locations}
          selfId={own.id}
          onClose={() => setRenaming(false)}
          onSubmit={rename}
        />
      ) : null}

      <PhotoCaptureSheet
        relatorioId={relatorioId}
        isOpen={importTarget !== null}
        onClose={() => setImportTarget(null)}
        mode={{ kind: 'sheet', target: () => importTarget ?? photoTarget(null) }}
      />
      {captioning === null ? null : (
        <PhotoCaptionDialog
          relatorioId={relatorioId}
          snapshot={snapshot}
          photo={captioning}
          onClose={() => setCaptioning(null)}
          onSave={(text) => saveCaption(captioning, text)}
        />
      )}

      {notTestedDialogOpen ? (
        <NotTestedDialog
          seedVersion={block.seed_version}
          onClose={() => setNotTestedDialogOpen(false)}
          onSubmit={(reason, text) => {
            setNotTestedDialogOpen(false);
            markNotTested(reason, text);
          }}
        />
      ) : null}
    </>
  );
}
