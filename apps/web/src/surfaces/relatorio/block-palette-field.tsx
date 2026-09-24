import {
  locationChoices,
  locationPathText,
  paletteItems,
  suggestTag,
  tagVerdict,
  type BlockRow,
  type EquipmentBlockType,
  type EquipmentRow,
  type LocationRow,
  type PaletteItem,
} from '@app/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import { tagReason, tagRefusalText, TagField } from './tag-dialogs.tsx';

/*
 * Story 4.5: the field Block palette (`40-relatorio-overview.html` `#lo-palette`,
 * DESIGN.md › Block palette), opened from a tree row or "Adicionar bloco em ⟨cabine⟩": a
 * bottom sheet below 768 px and a right drawer from 768 px (the Template composer's
 * `PaletteDrawer` shell and its `app.css` placement), headed by where the block goes, then
 * the eight equipment types with the TAG each would be born with. No sections and no
 * sub-block toggles (the office's, EXPERIENCE.md).
 *
 * Below 1280 px a tap creates the block at once (EXPERIENCE.md: one-tap accept; the TAG is
 * edited afterwards through "Renomear TAG"). From 1280 px (the desktop, office variant)
 * each type opens its `.type-confirm`, which asks the TAG and the Local, both prefilled.
 * Both rows are drawn and CSS shows one (`relatorio.css`), never a JS `matchMedia`.
 */

/** Where the palette puts the block: a location, and the block it goes right after ("Adicionar abaixo"). */
export interface PaletteTarget {
  locationId: string;
  anchorBlockId: string | null;
}

/** One creation the palette asks for: `tag` null means the suggestion, computed again when written. */
export interface PaletteCreate {
  type: EquipmentBlockType;
  locationId: string;
  anchorBlockId: string | null;
  tag: string | null;
}

export interface FieldPaletteProps {
  target: PaletteTarget;
  seedVersion: string;
  /** The relatório's live locations (the Local options) and blocks (where a taken TAG sits). */
  locations: readonly LocationRow[];
  blocks: readonly BlockRow[];
  /** The project's equipment, removed rows included (suggestions and verdicts read `removed_at`). */
  equipment: readonly EquipmentRow[];
  onCreate: (input: PaletteCreate) => void;
  onClose: () => void;
}

export function FieldPalette({ target, seedVersion, locations, blocks, equipment, onCreate, onClose }: FieldPaletteProps) {
  const t = copy.sumario.palette;
  const headingId = useId();
  // EXPERIENCE.md › Accessibility: a palette opens on its first option, not on "Fechar" (review
  // F-9). The shell focuses the first reachable control a frame after mounting; this takes the
  // focus to the first type row the width shows (the field row below 1280 px, the office row
  // from 1280 px, whichever one CSS draws).
  const itemsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const rows = itemsRef.current?.querySelectorAll<HTMLElement>('.pf-field, .pf-office > .palette-item') ?? [];
        const shown = [...rows].find((row) => row.getClientRects().length > 0) ?? rows[0];
        shown?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const location = locations.find((row) => row.id === target.locationId) ?? null;
  const [openType, setOpenType] = useState<EquipmentBlockType | null>(null);
  if (location === null) return null;
  const items = paletteItems(seedVersion, location, equipment);
  return (
    <DialogShell
      className="block-palette field-palette"
      overlayClassName="palette-drawer"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-labelledby={headingId}
    >
      <div className="sheet-grip" aria-hidden="true" />
      <div className="palette-head">
        <span id={headingId}>{t.title}</span>
        <button type="button" className="icon-btn" aria-label={copy.sumario.close} onClick={onClose}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-close" />
          </svg>
        </button>
      </div>
      <div className="palette-items" ref={itemsRef}>
        <p className="palette-group palette-where">{t.where(locationPathText(locations, location.id))}</p>
        <p className="palette-group">{t.chooseType}</p>
        {items.map((item) => (
          <div key={item.type} className="palette-type">
            <button
              type="button"
              className="palette-item pf-field"
              onClick={() => onCreate({ type: item.type, locationId: location.id, anchorBlockId: target.anchorBlockId, tag: null })}
            >
              <ItemBody item={item} />
            </button>
            <OfficeType
              item={item}
              isOpen={openType === item.type}
              onToggle={() => setOpenType((open) => (open === item.type ? null : item.type))}
              target={target}
              locations={locations}
              blocks={blocks}
              equipment={equipment}
              onCreate={onCreate}
            />
          </div>
        ))}
        <p className="office-note">{t.officeNote}</p>
      </div>
    </DialogShell>
  );
}

function ItemBody({ item }: { item: PaletteItem }) {
  return (
    <>
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-block" />
      </svg>
      <span className="pi-text">
        <span>{item.label}</span>
        <span className="pi-meta">{item.tag}</span>
      </span>
      <span className="plus" aria-hidden="true">
        +
      </span>
    </>
  );
}

interface OfficeTypeProps {
  item: PaletteItem;
  isOpen: boolean;
  onToggle: () => void;
  target: PaletteTarget;
  locations: readonly LocationRow[];
  blocks: readonly BlockRow[];
  equipment: readonly EquipmentRow[];
  onCreate: (input: PaletteCreate) => void;
}

/**
 * The office variant of one type (`.lo-type`): the row opens its `.type-confirm`, "TAG"
 * prefilled with the suggestion and "Local" with the location the palette was opened on.
 * Changing the Local suggests again, unless the TAG was typed by hand.
 */
function OfficeType({ item, isOpen, onToggle, target, locations, blocks, equipment, onCreate }: OfficeTypeProps) {
  const t = copy.sumario.palette;
  const confirmId = useId();
  const localId = useId();
  const [locationId, setLocationId] = useState(target.locationId);
  const [tag, setTag] = useState(item.tag);
  const [edited, setEdited] = useState(false);
  const choices = locationChoices(locations);
  const verdict = tagVerdict(tag, equipment);
  const reason = tagReason(verdict, t.confirm);

  const changeLocation = (id: string) => {
    setLocationId(id);
    const next = locations.find((row) => row.id === id);
    if (!edited && next !== undefined) setTag(suggestTag(item.type, { kind: next.kind, name: next.name }, equipment));
  };
  const confirm = () => {
    if (verdict !== null) return;
    onCreate({ type: item.type, locationId, anchorBlockId: locationId === target.locationId ? target.anchorBlockId : null, tag: tag.trim() });
  };

  return (
    <div className={isOpen ? 'lo-type pf-office is-open' : 'lo-type pf-office'}>
      <button type="button" className="palette-item" aria-expanded={isOpen} aria-controls={isOpen ? confirmId : undefined} onClick={onToggle}>
        <ItemBody item={item} />
      </button>
      {isOpen ? (
        <div className="type-confirm" id={confirmId}>
          <TagField
            label={copy.sumario.tagDialogs.tagLabel}
            value={tag}
            onChange={(value) => {
              setEdited(true);
              setTag(value);
            }}
            refusal={tagRefusalText(verdict, { blocks, locations })}
            onEnter={confirm}
          />
          <div className="field">
            <label className="field-label" htmlFor={localId}>
              {t.localLabel}
            </label>
            <select id={localId} className="input" value={locationId} onChange={(event) => changeLocation(event.target.value)}>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <div className="confirm-row">
            <Button variant="primary" isDisabled={reason !== undefined} disabledReason={reason} onPress={confirm}>
              {t.confirm}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
