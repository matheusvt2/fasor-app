import { pointSavedText, type RelatorioSnapshot } from '@app/domain';
import { useState } from 'react';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from '../../input/focus-restore.ts';
import { useToast } from '../../state/toast.tsx';
import { PointEditorDialog, type PointSeed } from './point-editor.tsx';

/*
 * Story 6.6: "Criar ponto de atenção" on a sheet -- the NC row's inline action (the
 * reserved slot beside "Adicionar foto") and the untested sheet's band. It opens the point
 * editor in a Form dialog, pre-linked with the sheet's equipment (and, from an NC row, a
 * token per photo of the item); saving closes it and the Form dialog gives the focus back
 * to this button, inside the row that opened it.
 */
export function CreatePointAction({
  relatorioId,
  snapshot,
  seed,
  focusAfterSave,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  seed: () => PointSeed;
  /**
   * Where the focus goes after a save that takes this button away (the untested sheet's
   * band); null until the button is gone, so the dialog's own return to it lands first.
   */
  focusAfterSave?: () => HTMLElement | null;
}) {
  const t = copy.points;
  const { showToast } = useToast();
  const [open, setOpen] = useState<PointSeed | null>(null);
  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(seed())}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-flag" />
        </svg>
        {t.createFromRow}
      </Button>
      {open === null ? null : (
        <PointEditorDialog
          isOpen
          onOpenChange={(next) => {
            if (!next) setOpen(null);
          }}
          relatorioId={relatorioId}
          snapshot={snapshot}
          seed={open}
          onDone={(saved) => {
            setOpen(null);
            // E6-Q2: Esc and the scrim store what was typed as "Concluir" does, and say so.
            if (saved !== null) showToast(pointSavedText(saved.position, saved.total));
            if (saved !== null && focusAfterSave !== undefined) restoreFocus(focusAfterSave, { frames: LIST_FOCUS_WATCH_FRAMES, once: true });
          }}
        />
      )}
    </>
  );
}
