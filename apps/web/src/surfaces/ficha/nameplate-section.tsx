import {
  camposCopiadosText,
  isCellFilled,
  lastNameplateCopy,
  nameplateCopyFields,
  nameplateIsEmpty,
  nameplateTagPrefill,
  showsConfirmedGlyph,
  suggestNameplateCopy,
  type BlockDefinition,
  type BlockRow,
  type EntityState,
  type EquipmentRow,
  type RelatorioSnapshot,
  type WordRow,
} from '@app/domain';
import { useId } from 'react';
import { Chip } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { newId } from '../../ids.ts';
import type { FichaApi } from './ficha-api.ts';
import { ReadOnlyField, SheetField } from './ficha-fields.tsx';
import { createWordOp, nameplateOp } from './ficha-ops.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { NameplateField, ReplaceLine, SuggestionFill, SuggestionGroupHead, useNameplateSuggestions } from './nameplate-suggestions.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';

/*
 * Stories 5.3 and 12.4 (FR-23, FR-34, AR-10, AR-24; `key-equipment-sheet-v09.html` "Dados
 * de placa"): every field of the definition is visible from the start, rendered by kind
 * and committing `sheet/{blockId}/nameplate/{fieldKey}` (D-6: "Digitar" is gone; the
 * "Fotografar placa" tile is Epic 8's and will sit above the fields). While the plate is
 * empty the copy chips that apply sit above the fields: "Igual à ⟨TAG⟩?" first (the most
 * specific match; never the per-unit fields, D-3), then "Copiar da última visita (⟨TAG⟩)";
 * both copy plain values in one batch with "Desfazer". The TAG field shows the block's TAG
 * while it has no cell of its own ("Do bloco · editável", J-09): nothing is written until
 * the engineer types, and renaming the block moves it.
 *
 * Story 8.1: the device's pending suggestions of this plate (`nameplate-suggestions.tsx`):
 * a fill takes the field's place as a Suggestion field, a differing value keeps the field
 * and adds the replace line, a confirmed cell shows its crop glyph; while any fill is
 * pending the section is `.nameplate-extraction` with the group head above the fields.
 */
export function NameplateSection({
  api,
  snapshot,
  state,
  block,
  definition,
  equipment,
  registries,
  onCaptionPhoto,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  /** The relatório's rows: its suggestion rows are read from here (a snapshot holds only confirmed ones). */
  state: EntityState;
  block: BlockRow;
  definition: BlockDefinition;
  equipment: readonly EquipmentRow[];
  registries: { manufacturer: readonly WordRow[]; voltage_class: readonly WordRow[] };
  /** "Editar legenda" in the viewer a crop opened. */
  onCaptionPhoto?: (tile: PhotoTile) => void;
}) {
  const t = copy.ficha.nameplate;
  const headingId = useId();
  const readOnly = useSheetReadOnly();
  const suggestions = useNameplateSuggestions({ api, state, snapshot, block, ...(onCaptionPhoto === undefined ? {} : { onCaptionPhoto }) });
  if (definition.nameplate.length === 0) return null;
  const grouped = !readOnly && suggestions.counts.fills > 0;

  const empty = nameplateIsEmpty(block);
  const own = block.equipment_id === null ? undefined : equipment.find((row) => row.id === block.equipment_id);
  const same = empty && !readOnly ? suggestNameplateCopy({ blocks: snapshot.blocks, equipment }, block.id) : null;
  const lastVisit = empty && !readOnly && own?.last_nameplate != null ? lastNameplateCopy(own, definition) : [];
  const tagPrefill = nameplateTagPrefill({ blocks: snapshot.blocks, equipment }, block.id);

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
    <section className={grouped ? 'section nameplate-extraction' : 'section'} id="ficha-nameplate" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{t.title}</h2>
      </div>
      {grouped ? <SuggestionGroupHead model={suggestions} /> : null}
      {same === null && (lastVisit.length === 0 || own === undefined) ? null : (
        <div className="chip-row ficha-nameplate-chips" role="group" aria-label={t.chipsLabel}>
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
      <div className="nameplate-grid">
        {definition.nameplate.map((field) => {
          const stored = block.sheet.nameplate[field.key];
          const prefilled = field.key === 'tag' && stored === undefined && tagPrefill !== null;
          const value = prefilled ? tagPrefill : (stored?.value ?? null);
          const helper = prefilled ? t.tagHelper : undefined;
          if (readOnly) return <ReadOnlyField key={field.key} field={field} value={value} {...(helper === undefined ? {} : { helper })} />;
          const pending = suggestions.entries.get(field.key);
          if (pending?.view === 'fill') return <SuggestionFill key={`${field.key}:${pending.suggestion.id}`} model={suggestions} field={field} suggestion={pending.suggestion} />;
          const after = pending?.view === 'replace' ? <ReplaceLine model={suggestions} field={field} suggestion={pending.suggestion} /> : null;
          const source = showsConfirmedGlyph(stored, snapshot.relatorio.status) ? suggestions.sourceOf(stored!.source_suggestion_id!) : null;
          const sheetField = (
            <SheetField
              key={field.key}
              field={field}
              value={value}
              {...(helper === undefined ? {} : { helper })}
              missing={!prefilled && !isCellFilled(stored)}
              draft={{ entityId: block.id, field: `placa-${field.key.replace(/_/g, '-')}` }}
              invalidText={t.invalidNumber}
              selectEmpty={t.selectEmpty}
              registries={registries}
              blocks={snapshot.blocks}
              onCreateWord={(kind, name) => createWord(field.key, kind, name)}
              commit={(next) => (api.author === null ? undefined : api.commit([nameplateOp(api.author, api.relatorioId, block.id, field.key, next)]))}
              after={after}
            />
          );
          // One wrapper for every field, confirmed or not, so the field keeps its place in the
          // tree when a typed correction clears the provenance mid-typing (no remount).
          return (
            <NameplateField key={field.key} model={suggestions} field={field} source={source}>
              {sheetField}
            </NameplateField>
          );
        })}
      </div>
      {suggestions.viewer}
    </section>
  );
}
