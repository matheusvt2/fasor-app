import { siteAltitudeText, type RelatorioSnapshot } from '@app/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, DateField, TextButton } from '../../../components/index.ts';
import { copy } from '../../../copy/pt-br.ts';
import { restoreFocus } from '../../../input/focus-restore.ts';
import { useDateField, useTextField, type BandRef, type CommitField, type CommitFields } from './setup-fields.ts';

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
  const altitudeId = useId();
  const nextInterventionDate = useDateField(setup.next_intervention_date, (v) => onCommit('next_intervention_date', v));

  // The altitude is always a plain typeable numeric field: geolocation, when it succeeds
  // with a real reading, only pre-fills it once (never overwriting a value the user already
  // typed); a denial, an unavailable API, or a reading with no altitude (`coords.altitude ===
  // null`, common on non-GPS devices) all leave the field exactly as typeable and empty.
  const [altitudeText, setAltitudeText] = useState<string>(() => (setup.site_altitude_m === null ? '' : String(setup.site_altitude_m)));
  const altitudeUserEdited = useRef(setup.site_altitude_m !== null);
  // The geolocation reading, once one exists: only then is the field a Suggestion (the
  // amber `data-state="suggested"` and the "Sugerido" pill, Epic 4 QA Q8), and only while
  // it still shows that reading.
  const [reading, setReading] = useState<string | null>(null);
  const altitudeInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (setup.site_altitude_m !== null || setup.site_altitude_confirmed) return;
    const geolocation = (globalThis.navigator as Navigator | undefined)?.geolocation;
    if (geolocation === undefined) return;
    geolocation.getCurrentPosition(
      (position) => {
        if (altitudeUserEdited.current || position.coords.altitude === null) return;
        const text = String(Math.round(position.coords.altitude));
        setReading(text);
        setAltitudeText(text);
      },
      () => undefined,
    );
    // Asked once per relatório, on mount only.
  }, []);

  const parsedAltitude = altitudeText.trim() === '' ? null : Number(altitudeText);
  const shownAltitude = parsedAltitude !== null && Number.isFinite(parsedAltitude) ? parsedAltitude : null;
  const confirmedText = setup.site_altitude_m === null ? '' : siteAltitudeText(setup.site_altitude_m);
  const suggested = !setup.site_altitude_confirmed && reading !== null && altitudeText === reading;

  async function onConfirmAltitude(): Promise<void> {
    if (shownAltitude === null) return;
    // Confirmed, the value is the user's: "Alterar" later reopens it plain, never "Sugerido" again.
    setReading(null);
    // One batch, two puts (the matrix's "in one batch").
    await onCommitFields([
      ['site_altitude_m', Math.round(shownAltitude)],
      ['site_altitude_confirmed', true],
    ]);
  }

  /** "Alterar": the confirmed altitude opens again as a typed field, its value kept, the focus in it (Q8). */
  async function onChangeAltitude(): Promise<void> {
    altitudeUserEdited.current = true;
    setAltitudeText(setup.site_altitude_m === null ? '' : String(setup.site_altitude_m));
    await onCommit('site_altitude_confirmed', false);
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
          <div className="field suggestion-field altitude-field span-2" data-state={suggested ? 'suggested' : undefined}>
            {setup.site_altitude_confirmed ? (
              <span className="field-label">{t.altitudeLabel}</span>
            ) : (
              <label className="field-label" htmlFor={altitudeId}>
                {t.altitudeLabel}
              </label>
            )}
            {setup.site_altitude_confirmed ? (
              <span className="row">
                <span className="helper helper-ok">{t.altitudeConfirmed(confirmedText)}</span>
                <TextButton aria-label={t.altitudeChangeLabel} onPress={() => void onChangeAltitude()}>
                  {t.altitudeChange}
                </TextButton>
              </span>
            ) : (
              <>
                <div className="measurement-field">
                  <input
                    id={altitudeId}
                    ref={altitudeInput}
                    type="number"
                    className="mf-value"
                    value={altitudeText}
                    onChange={(event) => {
                      altitudeUserEdited.current = true;
                      setAltitudeText(event.target.value);
                    }}
                  />
                  <span className="mf-unit" aria-label={t.altitudeUnit}>
                    m
                  </span>
                  {shownAltitude === null ? null : (
                    <Button variant="secondary" onPress={() => void onConfirmAltitude()}>
                      {t.altitudeConfirm}
                    </Button>
                  )}
                </div>
                {suggested ? <span className="suggested-pill">{t.altitudeSuggestedPill}</span> : null}
              </>
            )}
          </div>
          <DateField label={t.nextInterventionDateLabel} value={nextInterventionDate.date} onChange={nextInterventionDate.change} onBlur={nextInterventionDate.blur} />
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
