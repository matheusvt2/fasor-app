import {
  calibrationCheck,
  compareInstrumentRows,
  instrumentDetailSeparator,
  instrumentExpiredNoteText,
  instrumentRegistryRowText,
  instrumentSheetCounts,
  instrumentTickLocked,
  sectionMention,
  sectionsCaption,
  tickedUnusedInstruments,
  usedInSheetsText,
  type InstrumentRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Checkbox, TextButton } from '../../../components/index.ts';
import { copy } from '../../../copy/pt-br.ts';
import { now } from '../../../clock.ts';
import type { BandRef, CommitField } from './setup-fields.ts';

// --- Etapa 4 — Instrumentos e certificados -------------------------------------------------

export function Etapa4Instrumentos({
  relatorioId,
  snapshot,
  instruments,
  onCommit,
  bandRef,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  instruments: readonly InstrumentRow[];
  onCommit: CommitField;
  bandRef: BandRef;
}) {
  const t = copy.setup;
  const navigate = useNavigate();
  const registerReasonId = useId();
  const setup = snapshot.relatorio.setup;
  const [refusedNote, setRefusedNote] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      instruments
        .map((instrument) => ({ instrument, status: calibrationCheck(instrument, setup.service_end, now()) }))
        .sort(compareInstrumentRows),
    [instruments, setup.service_end],
  );

  // Story 25.13 (M25): the instruments the live sheets use, marked from the sheets (derived: the
  // tick is not written), and the ticked ones no sheet uses.
  const sheetCounts = useMemo(() => instrumentSheetCounts(snapshot), [snapshot]);
  const unused = useMemo(() => new Set(tickedUnusedInstruments(snapshot).map((row) => row.id)), [snapshot]);

  function onToggle(id: string, isSelected: boolean): void {
    // A used instrument cannot be unticked; the press says why. ~~Before Story 25.13 only this
    // refusal: it still holds for a sheet the count leaves out (a not-tested one).~~ Review of
    // PR #332: only a sheet the count holds locks the tick, so "Desmarque" can be followed.
    if (instrumentTickLocked(snapshot, id)) {
      setRefusedNote(id);
      return;
    }
    setRefusedNote(null);
    const next = isSelected ? [...setup.instrument_ids, id] : setup.instrument_ids.filter((existing) => existing !== id);
    void onCommit('instrument_ids', next);
  }

  return (
    <section className="section-band" aria-labelledby="setup-e4" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          4
        </span>
        <h2 className="band-title" id="setup-e4" tabIndex={-1}>
          {t.etapa4Title}
        </h2>
        <span className="band-note">{sectionsCaption(snapshot, [11])}</span>
      </div>
      <div className="band-body">
        <p className="section-note">{rows.length === 0 ? t.noInstruments : t.instrumentsNote(sectionMention(snapshot, 11))}</p>
        <ul className="instrument-list instrument-picker">
          {rows.map(({ instrument, status }) => {
            const text = instrumentRegistryRowText(instrument, status);
            const used = sheetCounts.get(instrument.id) ?? 0;
            const isSelected = used > 0 || setup.instrument_ids.includes(instrument.id);
            const refusedId = refusedNote === instrument.id ? `instrument-note-${instrument.id}` : undefined;
            const expiredNote = instrumentExpiredNoteText(text);
            const expiredId = expiredNote === null ? undefined : `instrument-expired-${instrument.id}`;
            const usedId = used > 0 ? `instrument-used-${instrument.id}` : undefined;
            const unusedId = unused.has(instrument.id) ? `instrument-unused-${instrument.id}` : undefined;
            const describedBy = [expiredId, usedId, unusedId, refusedId].filter((id): id is string => id !== undefined).join(' ') || undefined;
            return (
              <li key={instrument.id}>
                <Checkbox
                  isSelected={isSelected}
                  onChange={(checked) => onToggle(instrument.id, checked)}
                  aria-describedby={describedBy}
                  aria-disabled={used > 0 ? true : undefined}
                >
                  <span className="ip-code">{text.code}</span>
                  <span className="ip-text">
                    <span className="ip-name">{text.primaryName}</span>
                    <span className="ip-detail">
                      {text.secondaryLead}
                      {instrumentDetailSeparator(text)}
                      {text.validity === null ? null : text.validity.expired ? <span className="ip-expired">{text.validity.text}</span> : text.validity.text}
                    </span>
                  </span>
                </Checkbox>
                {expiredId === undefined ? null : (
                  <p className="ip-expired" id={expiredId} role="status">
                    {expiredNote}
                  </p>
                )}
                {usedId === undefined ? null : (
                  <p className="e25-used" id={usedId}>
                    {usedInSheetsText(used)}
                  </p>
                )}
                {unusedId === undefined ? null : (
                  <p className="ip-expired e25-unused" id={unusedId} role="status">
                    {t.instrumentUnused(sectionMention(snapshot, 11))}
                  </p>
                )}
                {refusedId === undefined ? null : (
                  <p className="ip-expired" id={refusedId} role="status">
                    {t.instrumentReferenced(sectionMention(snapshot, 11))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {/* Story 12.2 (J-11): `50-relatorio-setup.html` Etapa 4's row. It opens the new
            instrument's panel in Cadastros › Instrumentos, whose "Fechar" comes back here. */}
        <div className="row">
          <TextButton
            aria-describedby={registerReasonId}
            onPress={() =>
              void navigate('/cadastros', {
                state: { tab: 'instrumentos', newInstrument: true, returnTo: `/relatorio/${relatorioId}/setup?etapa=4` },
              })
            }
          >
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-plus" />
            </svg>
            {t.registerInstrument}
          </TextButton>
          <span className="btn-reason" id={registerReasonId}>
            {t.registerInstrumentReason}
          </span>
        </div>
      </div>
    </section>
  );
}
