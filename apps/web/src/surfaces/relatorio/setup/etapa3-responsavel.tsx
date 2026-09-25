import { artOrTrtLabel, artTrtEchoText, councilLabel, registrationNumberLabel, type RelatorioSnapshot, type UserRow } from '@app/domain';
import { useId, useRef, useState } from 'react';
import { Combobox } from '../../../components/index.ts';
import { copy } from '../../../copy/pt-br.ts';
import { useTextField, type BandRef, type CommitField } from './setup-fields.ts';

// --- Etapa 3 — Responsável ------------------------------------------------------------------

export function Etapa3Responsavel({
  snapshot,
  users,
  onCommit,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  users: readonly UserRow[];
  onCommit: CommitField;
  bandRef: BandRef;
}) {
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const selected = users.find((row) => row.id === setup.responsible_user_id) ?? null;
  const selectedName = selected?.name ?? null;
  // Empty, never the session user's name, while `responsible_user_id` is still null: a
  // screen must not look filled while it is not (review finding 3). The account's default
  // responsável is written in the creation batch instead (`instantiateTemplate`'s
  // `responsible_user_id`, Epic 4 QA Q2), so a new relatório arrives here already filled.
  const [text, setText] = useState(() => selectedName ?? '');
  // Resync `text` to `selected?.name` whenever `selected` changes (another device picks or
  // clears the responsible, or `users` finishes loading after this page's first paint), while
  // still letting the user free-type to search: mirrors `useTextField`'s committed-ref pattern.
  const committedName = useRef<string | null>(null);
  if (selectedName !== committedName.current) {
    committedName.current = selectedName;
    if (selectedName !== null && selectedName !== text) setText(selectedName);
  }

  const options = users.map((row) => ({ id: row.id, label: row.name }));
  const label = selected?.council === null || selected?.council === undefined ? null : artOrTrtLabel(selected.council);
  const artTrtNumber = useTextField(setup.art_trt_number ?? '', (v) => onCommit('art_trt_number', v === '' ? null : v));
  const artTrtId = useId();

  return (
    <section className="section-band" aria-labelledby="setup-e3" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          3
        </span>
        <h2 className="band-title" id="setup-e3" tabIndex={-1}>
          {t.etapa3Title}
        </h2>
        <span className="band-note">{t.etapa3Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          <Combobox
            label={t.responsibleLabel}
            options={options}
            selectedKey={setup.responsible_user_id}
            inputValue={text}
            onInputChange={setText}
            onSelectionChange={(key) => {
              const picked = users.find((row) => row.id === key);
              setText(picked?.name ?? text);
              void onCommit('responsible_user_id', key);
            }}
          />
          {selected === null ? null : (
            <>
              <div className="field">
                <span className="field-label">{t.councilLabel}</span>
                <div className="input">{selected.council === null ? '' : councilLabel(selected.council)}</div>
              </div>
              <div className="field">
                <span className="field-label">{selected.council === null ? t.registrationNumberFallbackLabel : registrationNumberLabel(selected.council)}</span>
                <div className="input tabular">{selected.registration_number ?? ''}</div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={artTrtId}>
                  {label ?? t.artTrtFallbackLabel}
                </label>
                <input
                  id={artTrtId}
                  className="input tabular"
                  value={artTrtNumber.text}
                  onChange={(event) => artTrtNumber.change(event.target.value)}
                  onBlur={artTrtNumber.blur}
                />
                {(() => {
                  const echo = artTrtEchoText(label, artTrtNumber.text);
                  return echo === null ? null : <span className="echo">{echo}</span>;
                })()}
              </div>
              {selected.title === null ? null : (
                <div className="field span-2">
                  <span className="helper">{t.councilHelper(selected.title)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
