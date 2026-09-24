import { SECTION_BLOCK_TYPES, sectionRowTitle, sectionNumber, type SectionBlockType } from '@app/domain';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { Button, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

export interface AddSectionDialogProps {
  /** The title of the row the new section goes under. */
  below: string;
  onPick: (type: SectionBlockType) => void;
  onClose: () => void;
}

/**
 * "Adicionar abaixo" (Story 4.3): the nine section types a template can carry, as a
 * ListBox; picking one creates a section block right under the row it was chosen on.
 */
export function AddSectionDialog({ below, onPick, onClose }: AddSectionDialogProps) {
  const t = copy.sumario;
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.addSectionTitle}
    >
      <p className="section-note">{below}</p>
      <ListBox
        className="registry-list section-picker"
        aria-label={t.addSectionListLabel}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const picked = keys === 'all' ? null : ([...keys][0] as SectionBlockType | undefined);
          if (picked !== undefined && picked !== null) onPick(picked);
        }}
      >
        {SECTION_BLOCK_TYPES.map((type) => (
          <ListBoxItem key={type} id={type} className="registry-row section-option" textValue={sectionRowTitle(type)}>
            <span className="block-tag">{sectionNumber(type)}</span>
            <span className="rr-text">
              <span className="rr-primary">{sectionRowTitle(type)}</span>
            </span>
          </ListBoxItem>
        ))}
      </ListBox>
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {t.close}
        </Button>
      </div>
    </FormDialog>
  );
}
