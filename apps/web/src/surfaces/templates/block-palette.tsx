import {
  EQUIPMENT_BLOCK_TYPES,
  quantityLabel,
  SECTION_BLOCK_TYPES,
  sectionNumber,
  type ComposerNode,
  type EquipmentBlockType,
  type SectionBlockType,
} from '@app/domain';
import { useId, type Ref } from 'react';
import { QuantityStepper } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';

/** "1 Objetivo": the section's FO.SERV-03 number and its title, as the mock writes both. */
export function sectionName(type: SectionBlockType): string {
  return `${sectionNumber(type)} ${copy.composer.sectionTitles[type]}`;
}

export interface BlockPaletteProps {
  /** The node whose quantities the equipment steppers set, or null when none is current. */
  current: ComposerNode | null;
  onAddSection: (type: SectionBlockType) => void;
  onSetQuantity: (type: EquipmentBlockType, n: number) => Promise<void>;
  /** The section a "Adicionar abaixo" is waiting to place the next tapped section under. */
  insertBelow: string | null;
  /** The first section item, so "Adicionar abaixo" can move the focus into the palette. */
  firstSectionRef?: Ref<HTMLButtonElement>;
  /** Present when the palette is a drawer or a sheet: its head closes it. */
  onClose?: () => void;
  headingId?: string;
}

/**
 * The office Block palette of the Template composer (DESIGN.md › Block palette, office
 * variant; `42-template-composer.html` `aside.block-palette.composer-palette`): headed
 * "Blocos", a "Seções" group whose tap adds one section block, and an "Equipamentos"
 * group headed by the current node, one row per equipment type with a Quantity stepper
 * for that node. With no current node the steppers are disabled and say why.
 */
export function BlockPaletteContent({
  current,
  onAddSection,
  onSetQuantity,
  insertBelow,
  firstSectionRef,
  onClose,
  headingId,
}: BlockPaletteProps) {
  const reasonId = useId();
  return (
    <>
      {onClose === undefined ? null : <div className="sheet-grip" aria-hidden="true" />}
      <div className="palette-head">
        <span id={headingId}>{copy.composer.paletteTitle}</span>
        {onClose === undefined ? null : (
          <button type="button" className="icon-btn" aria-label={copy.composer.closePalette} onClick={onClose}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-close" />
            </svg>
          </button>
        )}
      </div>
      <div className="palette-items">
        <p className="palette-group">{copy.composer.paletteSections}</p>
        {insertBelow === null ? null : <p className="palette-note">{copy.composer.paletteInsertBelow(insertBelow)}</p>}
        {SECTION_BLOCK_TYPES.map((type, i) => (
          <button
            key={type}
            ref={i === 0 ? firstSectionRef : undefined}
            type="button"
            className="palette-item"
            onClick={() => onAddSection(type)}
          >
            <svg className="ico" aria-hidden="true">
              <use href={type === 'section_8' ? '/sprite.svg#i-flag' : '/sprite.svg#i-doc'} />
            </svg>
            <span className="pi-text">
              <span>{sectionName(type)}</span>
            </span>
            <span className="plus" aria-hidden="true">
              +
            </span>
          </button>
        ))}

        <p className="palette-group">
          {current === null ? copy.composer.paletteEquipmentNone : copy.composer.paletteEquipment(current.name)}
        </p>
        {current === null ? (
          <p className="palette-note" id={reasonId}>
            {copy.composer.selectNode}
          </p>
        ) : null}
        {EQUIPMENT_BLOCK_TYPES.map((type) => (
          <PaletteEquipmentRow
            // A new node is a new stepper: no count carries over from the previous one.
            key={`${current?.ref ?? ''}:${type}`}
            type={type}
            value={current === null ? 0 : current.quantities[type]}
            isDisabled={current === null}
            disabledReasonId={reasonId}
            onCommit={(n) => onSetQuantity(type, n)}
          />
        ))}
      </div>
    </>
  );
}

export interface PaletteEquipmentRowProps {
  type: EquipmentBlockType;
  value: number;
  isDisabled: boolean;
  disabledReasonId: string;
  onCommit: (n: number) => Promise<void>;
}

/**
 * One equipment type of the palette with its stepper. Its own component so Story 3.5 can
 * open the per-type defaults from it.
 */
export function PaletteEquipmentRow({ type, value, isDisabled, disabledReasonId, onCommit }: PaletteEquipmentRowProps) {
  return (
    <div className="palette-item is-stepper">
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-block" />
      </svg>
      <span className="pi-text">
        <span>{copy.composer.equipmentNames[type]}</span>
      </span>
      <QuantityStepper
        value={value}
        label={(n) => quantityLabel(type, n)}
        onCommit={onCommit}
        isDisabled={isDisabled}
        disabledReasonId={disabledReasonId}
      />
    </div>
  );
}

export interface PaletteDrawerProps extends Omit<BlockPaletteProps, 'onClose' | 'headingId'> {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * Below 1024 px the palette is a modal: a right drawer on a tablet, a bottom sheet on a
 * phone (DESIGN.md › Block palette; `app.css` places it), opened by the composer head's
 * "Blocos" button and closed by its own head, Esc or the scrim.
 */
export function PaletteDrawer({ isOpen, onOpenChange, ...props }: PaletteDrawerProps) {
  const headingId = useId();
  return (
    <DialogShell
      className="block-palette composer-palette"
      overlayClassName="palette-drawer"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      aria-labelledby={headingId}
    >
      <BlockPaletteContent {...props} headingId={headingId} onClose={() => onOpenChange(false)} />
    </DialogShell>
  );
}
