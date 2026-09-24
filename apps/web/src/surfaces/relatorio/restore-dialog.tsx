import type { RestorableBlock } from '@app/domain';
import { Button, FormDialog, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

export interface RestoreDialogProps {
  blocks: readonly RestorableBlock[];
  onRestore: (block: RestorableBlock) => void;
  onClose: () => void;
}

/**
 * Header Overflow › "Restaurar ficha removida" (Story 4.3): the removed blocks of the
 * relatório, newest removal first, each with its own "Restaurar"; the sentence the mock
 * toasts when there is nothing to restore stands in the dialog instead, so the way in
 * is always the same.
 */
export function RestoreDialog({ blocks, onRestore, onClose }: RestoreDialogProps) {
  const t = copy.sumario;
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.restoreTitle}
    >
      {blocks.length === 0 ? (
        <p className="section-note">{t.restoreNone}</p>
      ) : (
        <ul className="registry-list restore-list" aria-label={t.restoreTitle}>
          {blocks.map((block) => (
            <li key={block.id} className="registry-row" data-block-id={block.id}>
              <div className="rr-text">
                <span className="rr-primary">{block.name}</span>
              </div>
              <div className="rr-actions">
                <TextButton aria-label={t.restoreLabel(block.name)} onPress={() => onRestore(block)}>
                  {t.restoreAction}
                </TextButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {t.close}
        </Button>
      </div>
    </FormDialog>
  );
}
