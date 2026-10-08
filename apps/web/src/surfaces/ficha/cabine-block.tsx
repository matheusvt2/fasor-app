import {
  appendObservation,
  cabineLineText,
  cabineProgress,
  getSeed,
  humidityNoteSurfaced,
  previousCabineEnv,
  quickNotes,
  type EntityState,
  type FieldDef,
  type LocationRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Chip, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { cabineEnvOp, cabineSeOp, sheetObservationsOp } from './ficha-ops.ts';
import { firstFocusable, ReadOnlyField, SheetField } from './ficha-fields.tsx';
import type { FichaApi } from './ficha-api.ts';
import { envAfter, envLineField, EnvReadDisplayButton, EnvSuggestionFill, useEnvDisplay } from './read-display.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';
type Cabine = Extract<LocationRow, { kind: 'cabine' }>;

/*
 * Stories 5.2 and 12.3: the cabine's "Características da SE" and "Ambiente de ensaio"
 * (FR-24, AR-5; `60-ficha.html` CB-ENT, `key-equipment-sheet-v09.html` `.cabine-line`),
 * written as `location/{id}/se/*` and `location/{id}/env/*` ops on the cabine, never on the
 * sheet. D-5 (`source-deltas.md` row 51): on every sheet of the cabine the block is one
 * line of its values with "Editar"; it is expanded, editable, on the cabine's first sheet
 * (where its empty fields count and carry the missing-field markers "Concluir ficha" jumps
 * to), on any sheet while a field is empty (editable, not counted there), and once
 * "Editar" is tapped or a field inside took the focus (for this visit of the sheet). The
 * cabine is not the sheet's data: on a sheet marked not tested it stays editable and keeps
 * "Editar", so a cabine whose sheets are all not tested can still be filled. The altitude is the
 * relatório setup's own, read-only everywhere. "Copiar da cabine anterior" writes the
 * previous cabine's temperature and humidity as plain ops with an undo.
 *
 * Story 9.1: "Ler visor" on the thermo-hygrometer (`60-ficha.html` `.ficha-amb-actions`, with
 * its reason "Termo-higrômetro") takes one shot of the cabine's environment; its temperature
 * and humidity arrive as Suggestion fields (`read-display.tsx`), the queued line under the
 * fields while the photo waits for signal.
 */
export function CabineBlock({
  api,
  state,
  snapshot,
  cabine,
  first,
  envTarget,
}: {
  api: FichaApi;
  /** Story 9.1: the device's rows, for the thermo-hygrometer suggestions. */
  state: EntityState;
  snapshot: RelatorioSnapshot;
  cabine: Cabine;
  first: boolean;
  /** Story 9.1: the capture target of the thermo-hygrometer shot. */
  envTarget: () => CaptureTarget;
}) {
  const t = copy.ficha.cabine;
  const seHeading = useId();
  const envHeading = useId();
  const [editing, setEditing] = useState(false);
  const host = useRef<HTMLElement>(null);
  // "Editar" hands the focus to the first field once the fields are drawn.
  const focusFirst = useRef(false);
  useEffect(() => {
    if (!focusFirst.current || host.current === null) return;
    focusFirst.current = false;
    firstFocusable(host.current)?.focus();
  });
  const definition = getSeed(snapshot.relatorio.seed_version, 'cabine_primaria').cabine;
  const envDisplay = useEnvDisplay({ api, state, snapshot, cabine });
  const progress = cabineProgress(snapshot, cabine.id);
  // Open while a field is empty; a focus inside keeps it open for the rest of the visit, so
  // the value that completes the cabine never folds the block under the finger (D-2).
  const expanded = first || !progress.complete || editing;
  const keepOpen = () => {
    if (!editing) setEditing(true);
  };
  const missingKeys = new Set(first ? progress.missing.map((field) => `${field.group}/${field.key}`) : []);
  const previous = previousCabineEnv(snapshot.locations, cabine.id);
  const sectionClass = (extra: string) => ['section', 'se-block', extra].filter(Boolean).join(' ');
  const altitude = snapshot.relatorio.setup.site_altitude_m;
  const altitudeField = definition.env.find((field) => field.key === 'altitude_m');

  if (!expanded) {
    return (
      <div className="cabine-line" role="group" aria-label={t.lineLabel}>
        <span className="cl-name">{cabine.name}</span>
        <span className="cl-values">{cabineLineText(cabine)}</span>
        <TextButton
          onPress={() => {
            focusFirst.current = true;
            setEditing(true);
          }}
        >
          {t.editar}
        </TextButton>
      </div>
    );
  }

  // Review F-08: the thermo-hygrometer photo's line shows under one environment field.
  const envFields = definition.env.filter((field) => field.key !== 'altitude_m');
  const envLine = envLineField(envDisplay, envFields, (field) => (cabine.env as Record<string, unknown>)[field.key] ?? null);
  const fieldOf = (group: 'se' | 'env', field: FieldDef, after?: (value: unknown) => ReactNode) => {
    const value = (cabine[group] as Record<string, unknown>)[field.key] ?? null;
    return (
      <SheetField
        key={field.key}
        field={field}
        value={value}
        after={after?.(value)}
        missing={missingKeys.has(`${group}/${field.key}`)}
        draft={{ entityId: cabine.id, field: `${group}-${field.key.replace(/_/g, '-')}` }}
        invalidText={t.invalidNumber}
        selectEmpty={t.selectEmpty}
        commit={(next) =>
          api.author === null
            ? undefined
            : api.commit([(group === 'se' ? cabineSeOp : cabineEnvOp)(api.author, api.relatorioId, cabine.id, field.key, next)])
        }
      />
    );
  };

  function copyPrevious(): void {
    if (previous === null) return;
    void api
      .edit((_blocks, by) => [
        cabineEnvOp(by, api.relatorioId, cabine.id, 'temperature_c', previous.temperature_c),
        cabineEnvOp(by, api.relatorioId, cabine.id, 'humidity_pct', previous.humidity_pct),
      ])
      .then((batch) => api.undoable(t.copiedFrom(previous.name), batch))
      .catch(() => undefined);
  }

  return (
    <>
      <section className={sectionClass('')} aria-labelledby={seHeading} ref={host} onFocus={keepOpen}>
        <div className="section-head">
          <h2 id={seHeading}>{t.seTitle}</h2>
          <DaCabine name={cabine.name} />
        </div>
        <p className="section-note">{t.seNote}</p>
        <div className="nameplate-grid">{definition.se.map((field) => fieldOf('se', field))}</div>
      </section>
      <section className={sectionClass('ficha-amb')} aria-labelledby={envHeading} onFocus={keepOpen}>
        <div className="section-head">
          <h2 id={envHeading}>{t.envTitle}</h2>
          <DaCabine name={cabine.name} />
        </div>
        <div className="ficha-amb-actions">
          {previous === null ? null : (
            <Chip onPress={copyPrevious}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-repeat" />
              </svg>
              {t.copyPrevious}
            </Chip>
          )}
          <EnvReadDisplayButton relatorioId={api.relatorioId} cabineId={cabine.id} target={envTarget} />
        </div>
        <div className="nameplate-grid">
          {envFields.map((field) => {
            const entry = envDisplay.entries.get(field.key);
            return entry !== undefined && entry.view === 'fill' ? (
              <EnvSuggestionFill key={`${field.key}:${entry.suggestion.id}`} model={envDisplay} field={field} suggestion={entry.suggestion} />
            ) : (
              fieldOf('env', field, (value) => envAfter(envDisplay, field, value, envLine))
            );
          })}
          {altitudeField === undefined ? null : (
            <ReadOnlyField field={altitudeField} value={altitude === null ? null : { raw: String(altitude), unit: 'm', state: 'measured' }} helper={t.altitudeHelper} />
          )}
        </div>
        {envDisplay.viewer}
      </section>
    </>
  );
}

function DaCabine({ name }: { name: string }) {
  return (
    <span className="ficha-da-cabine">
      <svg className="ico ico-sm" aria-hidden="true">
        <use href="/sprite.svg#i-layers" />
      </svg>
      {copy.ficha.cabine.daCabine(name)}
    </span>
  );
}

/**
 * Story 5.2 AC 4: with the cabine's humidity above the threshold, the sheet-level
 * "Observações rápidas" chip row surfaces the standard rain/humidity note first; a tap adds
 * it to the sheet's observation (`sheet/{blockId}/observations`).
 */
export function QuickNotes({ api, snapshot, cabine, observations }: { api: FichaApi; snapshot: RelatorioSnapshot; cabine: Cabine | null; observations: string | null }) {
  const t = copy.ficha.cabine;
  const headingId = useId();
  if (cabine === null || !humidityNoteSurfaced(cabine.env)) return null;
  const note = quickNotes(snapshot.relatorio.seed_version)[0];
  if (note === undefined) return null;
  const added = (observations ?? '').includes(note);
  return (
    <section className="section ficha-quick-notes" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{t.quickNotesTitle}</h2>
      </div>
      <div className="chip-row chips-recent" role="group" aria-labelledby={headingId}>
        <Chip
          isSelected={added}
          onSelectedChange={() => {
            if (added) return;
            void api
              .edit((blocks, by) => {
                const fresh = blocks.find((row) => row.id === api.blockId);
                const current = typeof fresh?.sheet.observations?.value === 'string' ? fresh.sheet.observations.value : null;
                return [sheetObservationsOp(by, api.relatorioId, api.blockId, appendObservation(current, note))];
              })
              .then((batch) => api.undoable(t.noteAdded, batch))
              .catch(() => undefined);
          }}
        >
          {t.rainNote}
        </Chip>
      </div>
    </section>
  );
}
