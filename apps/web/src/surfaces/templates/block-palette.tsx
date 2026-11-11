import {
  composerHiddenTypes,
  isCompanyBlockType,
  latestCompanyTypeVersion,
  libraryTypeSummaryText,
  paletteMetaText,
  paletteTypeGroups,
  SECTION_BLOCK_TYPES,
  sectionNumber,
  type ComposerBlockNode,
  type BlockTypeKey,
  type SectionBlockType,
} from '@app/domain';
import { Fragment, useCallback, useId, type Ref } from 'react';
import { QuantityStepper } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import { useTypeNaming } from './type-naming.tsx';

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
  /**
   * Fix batch fxpw G2 (`42-template-composer.html` L186-194): the section types the template
   * holds (`heldSectionTypes`). Their rows read "No template" and a tap calls `onSectionHeld`.
   */
  heldSections: ReadonlySet<SectionBlockType>;
  /** A tap on a held section's row: nothing is added (the composer says so). */
  onSectionHeld: (type: SectionBlockType) => void;
  onSetQuantity: (type: BlockTypeKey, n: number) => Promise<void>;
  /** The section a "Adicionar abaixo" is waiting to place the next tapped section under. */
  insertBelow: string | null;
  /** The first section item, so "Adicionar abaixo" can move the focus into the palette. */
  firstSectionRef?: Ref<HTMLButtonElement>;
  /** Present when the palette is a drawer or a sheet: its head closes it. */
  onClose?: () => void;
  headingId?: string;
  /** The equipment types the template places somewhere: only those have defaults to edit. */
  placedTypes: ReadonlySet<BlockTypeKey>;
  /** Opens the sub-block defaults of a type (Story 3.5). */
  onEditDefaults: (type: BlockTypeKey) => void;
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
 * Story 15.5 (F10): as a drawer or a sheet it keeps "Blocos" as its head (and so as the
 * dialog's name) with the `.pal-target` line right under it, and only its list scrolls,
 * carrying `data-more-below` while content remains below so CSS draws the cue.
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
  heldSections,
  onSectionHeld,
  onSetQuantity,
  insertBelow,
  firstSectionRef,
  onClose,
  headingId,
  placedTypes,
  onEditDefaults,
}: BlockPaletteProps) {
  const reasonId = useId();
  const naming = useTypeNaming();
  const definitions = naming.definitions;
  /** A library row's line: what it holds, then (a company type) the version the template records and the newer one. */
  // Story 24.19: a company type's row is marked "Tipo da empresa", wherever it stands (a copy among the eight too);
  // fix batch e24x (C3): the kernel composes the line, so a type with nothing to say still carries the mark.
  const paletteMeta = (type: BlockTypeKey): string | null => {
    const version = latestCompanyTypeVersion(definitions, type);
    return paletteMetaText(isCompanyBlockType(type), [libraryTypeSummaryText(seedVersion, type, definitions, version), naming.versionTextOf(type)]);
  };
  // Fix batch e24x (decision 17): a library type a published copy hides, while the template places it, keeps its defaults' entry.
  const hiddenPlaced = composerHiddenTypes(definitions, seedVersion, placedTypes);
  const drawer = onClose !== undefined;
  const moreBelow = useMoreBelowCue(drawer);
  // The mock swaps `.pal-now` and `.pal-none` with CSS `:has()`; here one of them is rendered. A polite region: the target is said when it changes.
  const target = (
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
  );
  return (
    <>
      {drawer ? <div className="sheet-grip" aria-hidden="true" /> : null}
      <div className="palette-head">
        {/* DESIGN.md › Block palette: inline, headed by the node it fills ("Coluna 5"), "Blocos" with
            none; as a drawer or a sheet (Story 15.5, F10) always "Blocos", the target under it. */}
        <span id={headingId}>{drawer || current === null ? copy.composer.paletteTitle : current.name}</span>
        {drawer ? (
          <button type="button" className="icon-btn" aria-label={copy.composer.closePalette} onClick={onClose}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-close" />
            </svg>
          </button>
        ) : null}
      </div>
      {drawer ? target : null}
      <div className="palette-items" ref={moreBelow}>
        <p className="palette-group">{copy.composer.paletteSections}</p>
        {insertBelow === null ? null : <p className="palette-note">{copy.composer.paletteInsertBelow(insertBelow)}</p>}
        {SECTION_BLOCK_TYPES.map((type, i) => {
          const held = heldSections.has(type);
          const metaId = `${reasonId}-${type}`;
          return (
            <button
              key={type}
              ref={i === 0 ? firstSectionRef : undefined}
              type="button"
              className="palette-item"
              // G2: the name stays the section's; "No template" is its description.
              aria-label={sectionName(type)}
              aria-describedby={held ? metaId : undefined}
              onClick={() => (held ? onSectionHeld(type) : onAddSection(type))}
            >
              <svg className="ico" aria-hidden="true">
                <use href={type === 'section_8' ? '/sprite.svg#i-flag' : '/sprite.svg#i-doc'} />
              </svg>
              <span className="pi-text">
                <span>{sectionName(type)}</span>
                {held ? (
                  <span className="pi-meta" id={metaId}>
                    {copy.composer.sectionHeldMeta}
                  </span>
                ) : null}
              </span>
              <span className="plus" aria-hidden="true">
                +
              </span>
            </button>
          );
        })}

        <p className="palette-group">{copy.composer.paletteEquipment}</p>
        {drawer ? null : target}
        {paletteTypeGroups(seedVersion, naming.definitions).map((group) => (
          <Fragment key={group.key}>
            {group.label === null ? null : <p className="palette-group palette-library">{group.label}</p>}
            {/* Story 14.8: the published, non-retired company types follow the library types (AD-21 item 6). */}
            {group.types.map((type) => (
              // A new node is a new stepper: no count carries over from the previous one.
              <Fragment key={`${current?.ref ?? ''}:${type}`}>
                <PaletteEquipmentRow
                  type={type}
                  meta={group.key === 'library' || isCompanyBlockType(type) ? paletteMeta(type) : null}
                  value={current === null ? 0 : (current.quantities[type] ?? 0)}
                  isDisabled={current === null}
                  disabledReasonId={reasonId}
                  onCommit={(n) => onSetQuantity(type, n)}
                  // A company type's defaults are its own editor's (Templates › Tipos de equipamento).
                  {...(placedTypes.has(type) && !isCompanyBlockType(type) ? { onEditDefaults: () => onEditDefaults(type) } : {})}
                />
                {/* Fix batch e24x (decision 17): right after its copies, the hidden original the template places: its
                    defaults' entry, its count, and a stepper disabled by the line that says why. */}
                {hiddenPlaced
                  .filter((hidden) => hidden.after === type)
                  .map((hidden) => (
                    <PaletteEquipmentRow
                      key={hidden.type}
                      type={hidden.type}
                      meta={hidden.text}
                      metaId={`${reasonId}-hidden-${hidden.type}`}
                      hidden
                      value={current === null ? 0 : (current.quantities[hidden.type] ?? 0)}
                      isDisabled
                      disabledReasonId={`${reasonId}-hidden-${hidden.type}`}
                      onCommit={async () => undefined}
                      onEditDefaults={() => onEditDefaults(hidden.type)}
                    />
                  ))}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
    </>
  );
}

/**
 * Story 15.5 (F10): the drawer's or sheet's list carries `data-more-below="true"` while content
 * remains below its visible part, so CSS draws the bottom cue; kept on scroll, on a resize of
 * the list or the window, and on a change of its content. Written on the element, not in
 * React state: the cue never re-renders the palette. Off for the inline palette.
 */
function useMoreBelowCue(enabled: boolean): (element: HTMLDivElement | null) => (() => void) | undefined {
  return useCallback(
    (element: HTMLDivElement | null) => {
      if (!enabled || element === null) return undefined;
      const update = () => {
        const more = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
        element.dataset.moreBelow = more ? 'true' : 'false';
      };
      update();
      element.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
      resize?.observe(element);
      const mutation = typeof MutationObserver === 'function' ? new MutationObserver(update) : null;
      mutation?.observe(element, { childList: true, subtree: true, characterData: true });
      return () => {
        element.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        resize?.disconnect();
        mutation?.disconnect();
      };
    },
    [enabled],
  );
}

export interface PaletteEquipmentRowProps {
  type: BlockTypeKey;
  /** Story 14.5: what a library type holds (`.pi-meta`, the kernel's `libraryTypeSummaryText`); null on the eight. */
  meta?: string | null;
  value: number;
  isDisabled: boolean;
  disabledReasonId: string;
  onCommit: (n: number) => Promise<void>;
  /** Present when the template holds the type: the row's button opens its sub-block defaults. */
  onEditDefaults?: () => void;
  /** Fix batch e24x (decision 17): the meta's id, so the disabled stepper of a hidden original names it as its reason. */
  metaId?: string;
  /** Fix batch e24x (decision 17): a library type a published copy hides, kept for its defaults (`data-hidden-type`). */
  hidden?: boolean;
}

/**
 * One equipment type of the palette with its stepper and, once the template holds the type,
 * the "Editar padrões" icon button that opens its sub-block defaults (Story 3.5).
 */
export function PaletteEquipmentRow({ type, meta = null, value, isDisabled, disabledReasonId, onCommit, onEditDefaults, metaId, hidden = false }: PaletteEquipmentRowProps) {
  const naming = useTypeNaming();
  const name = naming.nameOf(type);
  return (
    <div className="palette-item is-stepper" data-hidden-type={hidden ? '' : undefined}>
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-block" />
      </svg>
      <span className="pi-text">
        <span>{name}</span>
        {meta === null ? null : (
          <span className="pi-meta" id={metaId}>
            {meta}
          </span>
        )}
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
        label={(n) => naming.quantityLabelOf(type, n)}
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
