import { pointSavedText, printsSection, sectionRefText, type RelatorioSnapshot } from '@app/domain';
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
  hideButton = false,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  seed: () => PointSeed;
  /**
   * Where the focus goes after a save that takes this button away (the untested sheet's
   * band); null until the button is gone, so the dialog's own return to it lands first.
   */
  focusAfterSave?: () => HTMLElement | null;
  /**
   * Fix batch e24x (D1): the point this action would create already stands (the editor's own
   * autosave stored it): the button goes, and an open editor stays until "Concluir". The caller
   * keeps this action mounted, so its dialog is never unmounted under the typing.
   */
  hideButton?: boolean;
}) {
  const t = copy.points;
  const { showToast } = useToast();
  const [open, setOpen] = useState<PointSeed | null>(null);
  return (
    <>
      {hideButton ? null : (
        <Button variant="secondary" onPress={() => setOpen(seed())}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-flag" />
          </svg>
          {t.createFromRow}
        </Button>
      )}
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
            if (saved !== null) showToast(pointSavedText(saved.position, saved.total, printsSection(snapshot, 8), sectionRefText(snapshot, 8)));
            // Fix batch e24x (D1): the target waits for the editor to leave the page, so the dialog's own focus
            // return (to a button now hidden) never comes after it.
            if (saved !== null && focusAfterSave !== undefined) {
              restoreFocus(() => (document.querySelector('.point-editor-dialog') === null ? focusAfterSave() : null), { frames: LIST_FOCUS_WATCH_FRAMES, once: true });
            }
          }}
        />
      )}
    </>
  );
}
