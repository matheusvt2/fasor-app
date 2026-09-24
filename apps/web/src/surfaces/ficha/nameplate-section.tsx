import {
  camposCopiadosText,
  isCellFilled,
  lastNameplateCopy,
  nameplateCopyFields,
  nameplateIsEmpty,
  suggestNameplateCopy,
  type BlockDefinition,
  type BlockRow,
  type EquipmentRow,
  type RelatorioSnapshot,
  type WordRow,
} from '@app/domain';
import { useEffect, useId, useRef } from 'react';
import { Chip, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { newId } from '../../ids.ts';
import type { FichaApi } from './ficha-api.ts';
import { firstFocusable, SheetField } from './ficha-fields.tsx';
import { createWordOp, nameplateOp } from './ficha-ops.ts';

/*
 * Story 5.3 (FR-23, FR-34, AR-10, AR-24; `60-ficha.html` "Dados de placa"): an empty group
 * offers the copy chips that apply and "Digitar", a text link that reveals the fields;
 * the "Fotografar placa" tile is Epic 8's and is absent until then (never a placeholder).
 * Once revealed, or once anything is filled, every field of the definition renders by
 * kind and commits `sheet/{blockId}/nameplate/{fieldKey}`. The chips copy plain values in
 * one batch with "Desfazer": "Igual à ⟨TAG⟩?" first (the most specific match), then
 * "Copiar da última visita (⟨TAG⟩)" (OPEN QUESTION 3 of the spec, ordered this way).
 */
export function NameplateSection({
  api,
  snapshot,
  block,
  definition,
  equipment,
  registries,
  revealed,
  onReveal,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  block: BlockRow;
  definition: BlockDefinition;
  equipment: readonly EquipmentRow[];
  registries: { manufacturer: readonly WordRow[]; voltage_class: readonly WordRow[] };
  revealed: boolean;
  onReveal: () => void;
}) {
  const t = copy.ficha.nameplate;
  const headingId = useId();
  const grid = useRef<HTMLDivElement>(null);
  // "Digitar" hands the focus to the first field once the fields are drawn.
  const focusFirst = useRef(false);
  useEffect(() => {
    if (!focusFirst.current || grid.current === null) return;
    focusFirst.current = false;
    firstFocusable(grid.current)?.focus();
  });
  if (definition.nameplate.length === 0) return null;

  const empty = nameplateIsEmpty(block);
  const own = block.equipment_id === null ? undefined : equipment.find((row) => row.id === block.equipment_id);
  const same = empty ? suggestNameplateCopy({ blocks: snapshot.blocks, equipment }, block.id) : null;
  const lastVisit = empty && own?.last_nameplate != null ? lastNameplateCopy(own, definition) : [];
  const showFields = !empty || revealed;

  function copyFrom(fields: readonly { fieldKey: string; value: unknown }[], toast: (n: number) => string): void {
    if (fields.length === 0) return;
    void api
      .edit((_blocks, by) => fields.map((entry) => nameplateOp(by, api.relatorioId, block.id, entry.fieldKey, entry.value)))
      .then((batch) => api.undoable(toast(fields.length), batch))
      .catch(() => undefined);
  }

  function copySame(): void {
    if (same === null) return;
    void api
      .edit((blocks, by) => {
        const source = blocks.find((row) => row.id === same.sourceBlockId && row.removed_at === null);
        if (source === undefined) return null;
        return nameplateCopyFields(source, definition).map((entry) => nameplateOp(by, api.relatorioId, block.id, entry.fieldKey, entry.value));
      })
      .then((batch) => api.undoable(t.copiedFrom(same.tag), batch))
      .catch(() => undefined);
  }

  function createWord(fieldKey: string, kind: 'manufacturer' | 'voltage_class', name: string): void {
    void api
      .edit((_blocks, by) => [createWordOp(by, kind, newId(), name), nameplateOp(by, api.relatorioId, block.id, fieldKey, name)])
      .catch(() => undefined);
  }

  return (
    <section className="section" id="ficha-nameplate" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{t.title}</h2>
      </div>
      {showFields ? (
        <div className="nameplate-grid" ref={grid}>
          {definition.nameplate.map((field) => (
            <SheetField
              key={field.key}
              field={field}
              value={block.sheet.nameplate[field.key]?.value ?? null}
              missing={!isCellFilled(block.sheet.nameplate[field.key])}
              draft={{ entityId: block.id, field: `placa-${field.key.replace(/_/g, '-')}` }}
              invalidText={t.invalidNumber}
              selectEmpty={t.selectEmpty}
              registries={registries}
              blocks={snapshot.blocks}
              onCreateWord={(kind, name) => createWord(field.key, kind, name)}
              commit={(next) => (api.author === null ? undefined : api.commit([nameplateOp(api.author, api.relatorioId, block.id, field.key, next)]))}
            />
          ))}
        </div>
      ) : (
        <div className="camera-group">
          {same === null && lastVisit.length === 0 ? null : (
            <div className="chip-row" role="group" aria-label={t.chipsLabel}>
              {same === null ? null : (
                <Chip onPress={copySame}>
                  <svg className="ico" aria-hidden="true">
                    <use href="/sprite.svg#i-repeat" />
                  </svg>
                  {t.igualA(same.tag)}
                </Chip>
              )}
              {lastVisit.length === 0 || own === undefined ? null : (
                <Chip onPress={() => copyFrom(lastVisit, camposCopiadosText)}>
                  <svg className="ico" aria-hidden="true">
                    <use href="/sprite.svg#i-repeat" />
                  </svg>
                  {t.lastVisit(own.tag)}
                </Chip>
              )}
            </div>
          )}
          <span className="camera-type" data-missing-field="">
            <TextButton
              onPress={() => {
                focusFirst.current = true;
                onReveal();
              }}
            >
              {t.digitar}
            </TextButton>
          </span>
        </div>
      )}
    </section>
  );
}
