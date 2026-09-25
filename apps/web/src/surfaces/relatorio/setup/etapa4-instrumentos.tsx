import {
  calibrationCheck,
  compareInstrumentRows,
  instrumentDetailSeparator,
  instrumentExpiredNoteText,
  instrumentRegistryRowText,
  isInstrumentReferenced,
  type BlockRow,
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
  blocks,
  onCommit,
  bandRef,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  instruments: readonly InstrumentRow[];
  blocks: readonly BlockRow[];
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

  function onToggle(id: string, isSelected: boolean): void {
    if (!isSelected && isInstrumentReferenced(id, blocks)) {
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
        <span className="band-note">{t.etapa4Note}</span>
      </div>
      <div className="band-body">
        <p className="section-note">{rows.length === 0 ? t.noInstruments : t.instrumentsNote}</p>
        <ul className="instrument-list instrument-picker">
          {rows.map(({ instrument, status }) => {
            const text = instrumentRegistryRowText(instrument, status);
            const isSelected = setup.instrument_ids.includes(instrument.id);
            const refusedId = refusedNote === instrument.id ? `instrument-note-${instrument.id}` : undefined;
            const expiredNote = instrumentExpiredNoteText(text);
            const expiredId = expiredNote === null ? undefined : `instrument-expired-${instrument.id}`;
            const describedBy = [expiredId, refusedId].filter((id): id is string => id !== undefined).join(' ') || undefined;
            return (
              <li key={instrument.id}>
                <Checkbox isSelected={isSelected} onChange={(checked) => onToggle(instrument.id, checked)} aria-describedby={describedBy}>
                  <span className="ip-code">{text.code}</span>
                  <span className="ip-text">
                    <span className="ip-name">{text.primaryRest}</span>
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
                {refusedId === undefined ? null : (
                  <p className="ip-expired" id={refusedId} role="status">
                    {t.instrumentReferenced}
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
