import { sectionsHeading, type ComposerSection } from '@app/domain';
import { useId } from 'react';
import { OverflowMenu, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { sectionName } from './block-palette.tsx';
import { DragHandle, PositionBox } from './reorder-controls.tsx';
import { useReorder, type Reorder } from './use-reorder.ts';

export interface SectionListProps {
  sections: readonly ComposerSection[];
  onMove: (section: ComposerSection, toIndex: number) => Promise<void>;
  onAddBelow: (section: ComposerSection) => void;
  onDuplicate: (section: ComposerSection) => void;
  onRemove: (section: ComposerSection) => void;
  /** Whether the section has text to edit: the template's own, or the seed's (not 8 or 11). */
  canEditText: (section: ComposerSection) => boolean;
  onEditText: (section: ComposerSection) => void;
}

/**
 * The composition's section blocks (`42-template-composer.html` "Blocos"): one
 * `.block-card` per section in order, with the drag handle, the Position box, the
 * FO.SERV-03 number in `.block-tag` and the title in `.block-name`.
 */
export function SectionList({ sections, ...props }: SectionListProps) {
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-head">
        {/* tabIndex -1: the focus lands here when a removal empties the list. */}
        <h2 id={headingId} tabIndex={-1}>
          {sectionsHeading(sections.length)}
        </h2>
        <span className="section-note">{copy.composer.sectionsNote}</span>
      </div>
      {sections.length === 0 ? null : (
        <ul className="block-list" aria-label={copy.composer.sectionsListLabel} data-composer-list="sections">
          {sections.map((section) => {
            // A section has no id of its own: "the nth section_2" is stable while sections of
            // other types move around it, so a moved card keeps its DOM node (and the focus).
            const key = sectionKey(sections, section);
            return <SectionCard key={key} itemKey={key} section={section} {...props} />;
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The Overflow of a section card, in the mock's order: Adicionar abaixo · Subir · Descer ·
 * Duplicar · Editar texto (Story 3.6, only for a section with text), then Remover in its
 * red group. A move off either end is not offered.
 */
export function sectionMenu(section: ComposerSection, reorder: Reorder, props: Omit<SectionListProps, 'sections'>) {
  const trigger = () => reorder.row()?.querySelector<HTMLElement>(':scope > .overflow-trigger') ?? null;
  const items: OverflowMenuAction[] = [{ id: 'add-below', label: copy.composer.addBelow, onAction: () => props.onAddBelow(section) }];
  if (section.position > 1) {
    items.push({ id: 'up', label: copy.composer.moveUp, onAction: () => void reorder.moveTo(section.position - 2, trigger) });
  }
  if (section.position < section.siblings) {
    items.push({ id: 'down', label: copy.composer.moveDown, onAction: () => void reorder.moveTo(section.position, trigger) });
  }
  items.push({ id: 'duplicate', label: copy.composer.duplicate, onAction: () => props.onDuplicate(section) });
  if (props.canEditText(section)) {
    items.push({ id: 'edit-text', label: copy.composer.editText, onAction: () => props.onEditText(section) });
  }
  const destructiveItems: OverflowMenuAction[] = [{ id: 'remove', label: copy.composer.remove, onAction: () => props.onRemove(section) }];
  return { items, destructiveItems };
}

function sectionKey(sections: readonly ComposerSection[], section: ComposerSection): string {
  const nth = sections.filter((s) => s.block_type === section.block_type && s.index < section.index).length;
  return `${section.block_type}:${nth}`;
}

export function SectionCard({
  section,
  itemKey,
  ...props
}: Omit<SectionListProps, 'sections'> & { section: ComposerSection; itemKey: string }) {
  const reorder = useReorder({
    itemKey,
    position: section.position,
    siblings: section.siblings,
    onMove: (to) => props.onMove(section, to),
  });
  const name = sectionName(section.block_type);
  const menu = sectionMenu(section, reorder, props);
  return (
    <li className={reorder.dragging ? 'block-card is-dragging' : 'block-card'} {...reorder.rowProps}>
      <DragHandle name={name} reorder={reorder} />
      <PositionBox name={name} position={section.position} siblings={section.siblings} reorder={reorder} />
      <div className="block-body">
        <div className="block-line">
          <span className="block-tag">{section.number}</span>
          <span className="block-name">{copy.composer.sectionTitles[section.block_type]}</span>
        </div>
      </div>
      <OverflowMenu name={name} items={menu.items} destructiveItems={menu.destructiveItems} />
    </li>
  );
}
