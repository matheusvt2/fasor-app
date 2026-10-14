import {
  libraryTypeSummaryText,
  paletteTypeGroups,
  quantityLabel,
  SECTION_BLOCK_TYPES,
  sectionNumber,
  type ComposerBlockNode,
  type EquipmentBlockType,
  type SectionBlockType,
} from '@app/domain';
import { Fragment, useId, type Ref } from 'react';
import { QuantityStepper } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';

/** "1 Objetivo": the section's FO.SERV-03 number and its title, as the mock writes both. */
export function sectionName(type: SectionBlockType): string {
  return `${sectionNumber(type)} ${copy.composer.sectionTitles[type]}`;
}

export interface BlockPaletteProps {
  /** The template's seed version: the palette offers the equipment types that version ships (`paletteTypeGroups`). */
  seedVersion: string;
  /** The node whose quantities the equipment steppers set (a local or a coluna, never a painel), or null when none is current. */
  current: ComposerBlockNode | null;
  /** The kernel's name of that target (`paletteTargetText`: "Coluna 5 · Painel de média tensão", "Cubículo Enel, direto no local"); null with none. */
  targetText: string | null;
  onAddSection: (type: SectionBlockType) => void;
  onSetQuantity: (type: EquipmentBlockType, n: number) => Promise<void>;
  /** The section a "Adicionar abaixo" is waiting to place the next tapped section under. */
  insertBelow: string | null;
  /** The first section item, so "Adicionar abaixo" can move the focus into the palette. */
  firstSectionRef?: Ref<HTMLButtonElement>;
  /** Present when the palette is a drawer or a sheet: its head closes it. */
  onClose?: () => void;
  headingId?: string;
  /** The equipment types the template places somewhere: only those have defaults to edit. */
  placedTypes: ReadonlySet<EquipmentBlockType>;
  /** Opens the sub-block defaults of a type (Story 3.5). */
  onEditDefaults: (type: EquipmentBlockType) => void;
}

/**
 * The office Block palette of the Template composer (DESIGN.md › Block palette, office
 * variant; `42-template-composer.html` `aside.block-palette.composer-palette`): headed by
 * the current node ("Coluna 5", "Blocos" when none is current), a "Seções" group whose tap adds one section block, and an "Equipamentos"
 * group with the `.pal-target` line naming where the palette adds (Story 14.2: the open
 * coluna or the local made current by "Adicionar equipamento"), one row per equipment type
 * with a Quantity stepper for that node. With no current node the steppers are disabled and
 * the line says why ("Selecione um local ou uma coluna.").
 *
 * Story 14.5: the types are the ones the template's seed version ships, in the kernel's
 * groups: the eight under "Equipamentos", then, on a version that has library types, the
 * "Outros equipamentos" heading with the Chave de transferência automática, its row saying
 * what the type holds ("17 itens · até 6 ensaios").
 */
export function BlockPaletteContent({
  seedVersion,
  current,
  targetText,
  onAddSection,
  onSetQuantity,
  insertBelow,
  firstSectionRef,
  onClose,
  headingId,
  placedTypes,
  onEditDefaults,
}: BlockPaletteProps) {
  const reasonId = useId();
  return (
    <>
      {onClose === undefined ? null : <div className="sheet-grip" aria-hidden="true" />}
      <div className="palette-head">
        {/* DESIGN.md › Block palette: headed by the node it fills ("Coluna 5"); "Blocos" with none. */}
        <span id={headingId}>{current === null ? copy.composer.paletteTitle : current.name}</span>
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

        <p className="palette-group">{copy.composer.paletteEquipment}</p>
        {/* The mock swaps `.pal-now` and `.pal-none` with CSS `:has()`; here one of them is rendered. A polite region: the target is said when it changes. */}
        <p className="palette-group pal-target" aria-live="polite" id={reasonId}>
          {current === null || targetText === null ? (
            <span className="pal-none">{copy.composer.selectNode}</span>
          ) : (
            <span className="pal-now">
              {copy.composer.paletteTargetLead}
              <b>{targetText}</b>
            </span>
          )}
        </p>
        {paletteTypeGroups(seedVersion).map((group) => (
          <Fragment key={group.key}>
            {group.label === null ? null : <p className="palette-group palette-library">{group.label}</p>}
            {group.types.map((type) => (
              <PaletteEquipmentRow
                // A new node is a new stepper: no count carries over from the previous one.
                key={`${current?.ref ?? ''}:${type}`}
                type={type}
                meta={group.key === 'library' ? libraryTypeSummaryText(seedVersion, type) : null}
                value={current === null ? 0 : current.quantities[type]}
                isDisabled={current === null}
                disabledReasonId={reasonId}
                onCommit={(n) => onSetQuantity(type, n)}
                {...(placedTypes.has(type) ? { onEditDefaults: () => onEditDefaults(type) } : {})}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </>
  );
}

export interface PaletteEquipmentRowProps {
  type: EquipmentBlockType;
  /** Story 14.5: what a library type holds (`.pi-meta`, the kernel's `libraryTypeSummaryText`); null on the eight. */
  meta?: string | null;
  value: number;
  isDisabled: boolean;
  disabledReasonId: string;
  onCommit: (n: number) => Promise<void>;
  /** Present when the template holds the type: the row's button opens its sub-block defaults. */
  onEditDefaults?: () => void;
}

/**
 * One equipment type of the palette with its stepper and, once the template holds the type,
 * the "Editar padrões" icon button that opens its sub-block defaults (Story 3.5).
 */
export function PaletteEquipmentRow({ type, meta = null, value, isDisabled, disabledReasonId, onCommit, onEditDefaults }: PaletteEquipmentRowProps) {
  const name = copy.composer.equipmentNames[type];
  return (
    <div className="palette-item is-stepper">
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-block" />
      </svg>
      <span className="pi-text">
        <span>{name}</span>
        {meta === null ? null : <span className="pi-meta">{meta}</span>}
      </span>
      {onEditDefaults === undefined ? null : (
        <button type="button" className="icon-btn" aria-label={copy.composer.editDefaults(name)} onClick={onEditDefaults}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-layers" />
          </svg>
        </button>
      )}
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
