import { calendarDateOfInstant, NOT_APPLICABLE_TEXT, siteAltitudeText, type RelatorioSnapshot } from '@app/domain';
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Button, DateField, NotApplicableButton, TextButton } from '../../../components/index.ts';
import { useNumberInput, type ParsedNumber } from '../../../components/number-input.tsx';
import { copy } from '../../../copy/pt-br.ts';
import { now } from '../../../clock.ts';
import { restoreFocus } from '../../../input/focus-restore.ts';
import { keptAltitudeAnswer, siteAltitudeReading } from './altitude-reading.ts';
import { useDateField, useTextField, type BandRef, type CommitField, type CommitFields } from './setup-fields.ts';

/** Story 14.10 lane B: the "Hoje" chip of an empty Próxima intervenção, today in America/Sao_Paulo (Etapa 1's rule, 13.4). */
const today = () => calendarDateOfInstant(now());

// --- Etapa 5 — Local -------------------------------------------------------------------------

export function Etapa5Local({
  snapshot,
  onCommit,
  onCommitFields,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  onCommit: CommitField;
  onCommitFields: CommitFields;
  bandRef: BandRef;
}) {
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const justification = useTextField(setup.next_intervention_justification ?? '', (v) => onCommit('next_intervention_justification', v === '' ? null : v));
  const justificationId = useId();
  const nextInterventionDate = useDateField(setup.next_intervention_date, (v) => onCommit('next_intervention_date', v));

  // The altitude is always a plain typeable numeric field: geolocation, when it succeeds
  // with a real reading, only pre-fills it once (never overwriting a value the user already
  // typed); a denial, an unavailable API, or a reading with no altitude (`coords.altitude ===
  // null`, common on non-GPS devices) all leave the field exactly as typeable and empty.
  const altitudeUserEdited = useRef(setup.site_altitude_m !== null);
  // The geolocation reading, once one exists: only then is the field a Suggestion (the
  // amber `data-state="suggested"` and the "Sugerido" pill, Epic 4 QA Q8), and only while
  // it still shows that reading.
  const [reading, setReading] = useState<string | null>(null);
  const altitudeInput = useRef<HTMLInputElement | null>(null);
  const relatorioId = snapshot.relatorio.id;
  // Story 17.6: the device answered with no altitude (denied, unavailable, or a fix without
  // one), so the empty field says so. A device that was never asked (no geolocation API, open
  // question 2) answered nothing and shows no hint. A kept answer counts without asking again,
  // so "Alterar" from N/A shows the hint after a reload too.
  const [deviceGaveNone, setDeviceGaveNone] = useState(() => keptAltitudeAnswer(relatorioId)?.altitude === null);

  // F-11 / W-14: the device is asked once per relatório (`siteAltitudeReading` keeps the first
  // answer); a later mount shows the kept reading without asking, and an answer arriving after
  // the page is gone sets nothing. Story 17.6: an altitude marked N/A asks nothing either.
  useEffect(() => {
    if (setup.site_altitude_m !== null || setup.site_altitude_confirmed || setup.site_altitude_na) return;
    const answer = siteAltitudeReading(relatorioId, (globalThis.navigator as Navigator | undefined)?.geolocation);
    if (answer === null) return;
    let cancelled = false;
    void answer.then(({ altitude }) => {
      if (cancelled) return;
      if (altitude === null) {
        setDeviceGaveNone(true);
        return;
      }
      if (altitudeUserEdited.current) return;
      setReading(String(altitude));
    });
    return () => {
      cancelled = true;
    };
    // On mount only: the relatório of this page does not change under it.
  }, []);

  const confirmedText = setup.site_altitude_m === null ? '' : siteAltitudeText(setup.site_altitude_m);

  /**
   * F-02: the last altitude this page wrote (or the store holds), so "Confirmar" after a blur
   * that already wrote the typed value writes only the confirmation, never the value twice.
   */
  const lastWritten = useRef<number | null>(setup.site_altitude_m);
  const seenStored = useRef<number | null>(setup.site_altitude_m);
  if (seenStored.current !== setup.site_altitude_m) {
    seenStored.current = setup.site_altitude_m;
    lastWritten.current = setup.site_altitude_m;
  }

  /** F-02: blur, Enter, an idle pause or leaving the page writes the typed altitude. */
  async function onTypedAltitude(value: number | null): Promise<void> {
    lastWritten.current = value;
    await onCommit('site_altitude_m', value);
  }

  async function onConfirmAltitude(value: number): Promise<void> {
    // Confirmed, the value is the user's: "Alterar" later reopens it plain, never "Sugerido" again.
    setReading(null);
    if (lastWritten.current === value) {
      await onCommit('site_altitude_confirmed', true);
      return;
    }
    lastWritten.current = value;
    // One batch, two puts (the matrix's "in one batch").
    await onCommitFields([
      ['site_altitude_m', value],
      ['site_altitude_confirmed', true],
    ]);
  }

  /** "Alterar": the confirmed altitude opens again as a typed field, its value kept, the focus in it (Q8). */
  async function onChangeAltitude(): Promise<void> {
    altitudeUserEdited.current = true;
    await onCommit('site_altitude_confirmed', false);
    restoreFocus(() => altitudeInput.current, { mode: 'settled' });
  }

  /** Story 17.6: "N/A" writes the mark and clears the number in one batch (the existing setup puts). */
  async function onNotApplicable(): Promise<void> {
    lastWritten.current = null;
    setReading(null);
    await onCommitFields([
      ['site_altitude_na', true],
      ['site_altitude_m', null],
    ]);
  }

  /** Story 17.6: "Alterar" from N/A reopens the empty field with the focus in it. */
  async function onChangeNotApplicable(): Promise<void> {
    altitudeUserEdited.current = true;
    await onCommit('site_altitude_na', false);
    restoreFocus(() => altitudeInput.current, { mode: 'settled' });
  }

  return (
    <section className="section-band" aria-labelledby="setup-e5" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          5
        </span>
        <h2 className="band-title" id="setup-e5" tabIndex={-1}>
          {t.etapa5Title}
        </h2>
        <span className="band-note">{t.etapa5Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          {setup.site_altitude_na ? (
            <div className="field suggestion-field altitude-field span-2">
              <span className="field-label">{t.altitudeLabel}</span>
              <span className="row">
                <span className="helper helper-ok">{t.altitudeNotApplicable(NOT_APPLICABLE_TEXT)}</span>
                <TextButton aria-label={t.altitudeChangeLabel} onPress={() => void onChangeNotApplicable()}>
                  {t.altitudeChange}
                </TextButton>
              </span>
            </div>
          ) : setup.site_altitude_confirmed ? (
            <div className="field suggestion-field altitude-field span-2">
              <span className="field-label">{t.altitudeLabel}</span>
              <span className="row">
                <span className="helper helper-ok">{t.altitudeConfirmed(confirmedText)}</span>
                <TextButton aria-label={t.altitudeChangeLabel} onPress={() => void onChangeAltitude()}>
                  {t.altitudeChange}
                </TextButton>
              </span>
            </div>
          ) : (
            <AltitudeInput
              relatorioId={relatorioId}
              stored={setup.site_altitude_m}
              reading={reading}
              inputRef={altitudeInput}
              deviceGaveNone={deviceGaveNone}
              onEdit={() => (altitudeUserEdited.current = true)}
              onCommit={onTypedAltitude}
              onConfirm={onConfirmAltitude}
              onNotApplicable={onNotApplicable}
            />
          )}
          <DateField
            label={t.nextInterventionDateLabel}
            value={nextInterventionDate.date}
            onChange={nextInterventionDate.change}
            onBlur={nextInterventionDate.blur}
            today={today}
          />
          <div className="field">
            <label className="field-label" htmlFor={justificationId}>
              {t.nextInterventionJustificationLabel}
            </label>
            <input
              id={justificationId}
              className="input"
              value={justification.text}
              onChange={(event) => justification.change(event.target.value)}
              onBlur={justification.blur}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** The altitude's idle pause before a typed value is written (the setup text fields' own). */
const ALTITUDE_IDLE_MS = 500;

/**
 * The typed text as it is (the commit rounds it to whole metres, so a settle never rewrites the
 * field under the cursor); '' is an emptied field; anything else is no number and writes nothing.
 * `badInput`: the browser holds a transient entry its number input reports as '' ("-", "1e").
 */
function parseAltitude(text: string, badInput: boolean): ParsedNumber | null | 'invalid' {
  if (badInput) return 'invalid';
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return Number.isFinite(Number(trimmed)) ? { raw: trimmed, unit: null } : 'invalid';
}

/** Whole metres of a parsed altitude. */
function metres(value: ParsedNumber): number {
  return Math.round(Number(value.raw));
}

/**
 * F-02: the unconfirmed altitude, through the sheet's number input: blur, Enter, an idle
 * pause and leaving the page all write the typed value (EXPERIENCE.md, "leaving a field
 * never loses it"); "Confirmar" writes it with the confirmation.
 */
function AltitudeInput({
  relatorioId,
  stored,
  reading,
  inputRef,
  deviceGaveNone,
  onEdit,
  onCommit,
  onConfirm,
  onNotApplicable,
}: {
  relatorioId: string;
  stored: number | null;
  reading: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Story 17.6: the device answered with no altitude, so the empty field says so. */
  deviceGaveNone: boolean;
  onEdit: () => void;
  onCommit: (value: number | null) => Promise<void>;
  onConfirm: (value: number) => Promise<void>;
  onNotApplicable: () => Promise<void>;
}) {
  const t = copy.setup;
  const altitudeId = useId();
  const hintId = useId();
  const storedText = stored === null ? (reading ?? '') : String(stored);
  const element = useRef<HTMLInputElement | null>(null);
  const badInput = () => element.current?.validity?.badInput === true;
  const altitude = useNumberInput({
    storedText,
    storedRaw: stored === null ? null : String(stored),
    parse: (text) => parseAltitude(text, badInput()),
    commit: (value) => onCommit(value === null ? null : metres(value)),
    draft: { surface: 'setup', entityId: relatorioId, field: 'site_altitude_m' },
    flushOnUnmount: true,
  });
  const { ref: hookRef, onChange, ...inputProps } = altitude.inputProps;

  // The idle pause: the latest `commitNow` (it reads the hook's refs, so a later one is the same).
  const commitNow = useRef(altitude.commitNow);
  commitNow.current = altitude.commitNow;
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(
    () => () => {
      if (idle.current !== null) clearTimeout(idle.current);
    },
    [],
  );

  const parsed = altitude.parsed;
  const shownAltitude = parsed === null || parsed === 'invalid' ? null : metres(parsed);
  const suggested = reading !== null && altitude.text === reading;
  const showsHint = deviceGaveNone && stored === null && altitude.text.trim() === '';

  return (
    <div className="field suggestion-field altitude-field span-2" data-state={suggested ? 'suggested' : undefined}>
      <label className="field-label" htmlFor={altitudeId}>
        {t.altitudeLabel}
      </label>
      <div className="field-na-row">
      <div className="measurement-field">
        <input
          {...inputProps}
          id={altitudeId}
          aria-describedby={showsHint ? hintId : undefined}
          ref={(el) => {
            inputRef.current = el;
            element.current = el;
            (hookRef as RefObject<HTMLInputElement | null>).current = el;
          }}
          type="number"
          className="mf-value"
          aria-invalid={altitude.invalid || undefined}
          onChange={(event) => {
            onEdit();
            onChange?.(event);
            if (idle.current !== null) clearTimeout(idle.current);
            idle.current = null;
            // A transient entry the browser cannot read yet ("-", "1e") waits for the next key.
            if (badInput()) return;
            idle.current = setTimeout(() => {
              idle.current = null;
              commitNow.current();
            }, ALTITUDE_IDLE_MS);
          }}
        />
        <span className="mf-unit" aria-label={t.altitudeUnit}>
          m
        </span>
        {shownAltitude === null ? null : (
          <Button
            variant="secondary"
            onPress={() => {
              if (idle.current !== null) clearTimeout(idle.current);
              idle.current = null;
              // Marks the text written, so neither the blur nor leaving writes it again.
              altitude.markClean();
              void onConfirm(shownAltitude);
            }}
          >
            {t.altitudeConfirm}
          </Button>
        )}
      </div>
      <NotApplicableButton
        label={t.altitudeLabel}
        onPress={() => {
          if (idle.current !== null) clearTimeout(idle.current);
          idle.current = null;
          // The typed text is replaced by the mark: neither the blur nor leaving writes it again.
          altitude.markClean();
          void onNotApplicable();
        }}
      />
      </div>
      {showsHint ? (
        <span className="helper" id={hintId}>
          {t.altitudeNoneHint}
        </span>
      ) : null}
      {suggested ? <span className="suggested-pill">{t.altitudeSuggestedPill}</span> : null}
    </div>
  );
}
