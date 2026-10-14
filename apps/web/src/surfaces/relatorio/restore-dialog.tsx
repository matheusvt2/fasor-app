import type { RestorableEntry } from '@app/domain';
import { Button, FormDialog, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

export interface RestoreDialogProps {
  /** The kernel's `restorableEntries`: the removed locations and the removed blocks, newest removal first. */
  entries: readonly RestorableEntry[];
  onRestore: (entry: RestorableEntry) => void;
  onClose: () => void;
}

/**
 * Header Overflow › "Restaurar ficha removida" (Story 4.3): what was removed from the
 * relatório, newest removal first, each row with its own "Restaurar": a section, an
 * equipment sheet with where it was (Story 4.5), and a removed coluna, painel or local with
 * its kind and what comes back with it (Story 14.2, second pass; the kernel words both
 * lines). The sentence the mock toasts when there is nothing to restore stands in the dialog
 * instead, so the way in is always the same.
 */
export function RestoreDialog({ entries, onRestore, onClose }: RestoreDialogProps) {
  const t = copy.sumario;
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.restoreTitle}
    >
      {entries.length === 0 ? (
        <p className="section-note">{t.restoreNone}</p>
      ) : (
        <ul className="registry-list restore-list" aria-label={t.restoreTitle}>
          {entries.map((entry) => (
            <li
              key={`${entry.kind}:${entry.id}`}
              className="registry-row"
              // One of the two, so a row is told from the other kind by what it restores.
              {...(entry.kind === 'location' ? { 'data-location-id': entry.id } : { 'data-block-id': entry.id })}
            >
              <div className="rr-text">
                <span className="rr-primary">{entry.name}</span>
                {/* F-5: where an equipment sheet was, or a location's kind and what comes back with it; the button's name carries the unique label. */}
                {entry.detail === null ? null : <span className="rr-secondary">{entry.detail}</span>}
              </div>
              <div className="rr-actions">
                <TextButton aria-label={t.restoreLabel(entry.label)} onPress={() => onRestore(entry)}>
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
