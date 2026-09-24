import {
  instrumentDetailText,
  instrumentExpiredText,
  instrumentFieldText,
  instrumentHeaderOf,
  instrumentOptionOf,
  instrumentPickerOrder,
  lastInstrumentIdFor,
  storedInstrumentHeader,
  type BlockRow,
  type InstrumentRow,
  type TestKey,
} from '@app/domain';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import type { FichaApi } from './ficha-api.ts';
import { testInstrumentOp } from './ficha-ops.ts';

/*
 * The Instrument picker of a test sub-block (Story 5.7, UX-DR42; `60-ficha.html`
 * `.field.combobox.instrument-picker`): closed, the code and the short name; the serial,
 * RBC and validity behind the chevron (`<details>`); an expired calibration's amber line
 * always visible and never a block. The list is the local registry, the instrument last
 * used for this test type in the relatório first; a pick is one
 * `sheet/{b}/test/{t}/instrument` op holding the header copied by value (AR-18). With no
 * instrument registered it says so and offers "Cadastrar instrumento" (Registries, which
 * works offline).
 */
export function InstrumentPicker({
  api,
  block,
  blocks,
  testKey,
  instruments,
  serviceEnd,
}: {
  api: FichaApi;
  block: BlockRow;
  /** The relatório's blocks: the last instrument used per test type is remembered across them. */
  blocks: readonly BlockRow[];
  testKey: TestKey;
  instruments: readonly InstrumentRow[];
  serviceEnd: string | null;
}) {
  const t = copy.ficha.ensaios;
  const navigate = useNavigate();
  const labelId = useId();
  const valueId = useId();
  const listId = useId();
  const expiredId = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const options = useRef(new Map<string, HTMLButtonElement | null>());

  const header = storedInstrumentHeader(block.sheet.test[testKey]?.instrument?.value);
  const at = now();
  const registryRow = header === null ? undefined : instruments.find((row) => row.id === header.instrument_id);
  const expired = header === null ? null : instrumentExpiredText(header, serviceEnd, at);
  const ordered = instrumentPickerOrder(instruments, lastInstrumentIdFor(blocks, testKey));
  const list = ordered.map((row) => instrumentOptionOf(row, serviceEnd, at));
  const selectedIndex = header === null ? -1 : list.findIndex((option) => option.id === header.instrument_id);
  const tabbable = selectedIndex === -1 ? 0 : selectedIndex;

  const focusOption = (index: number) => {
    const option = list[(index + list.length) % list.length];
    if (option !== undefined) options.current.get(option.id)?.focus();
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && list.length > 0) requestAnimationFrame(() => focusOption(tabbable));
  };

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const pick = (id: string) => {
    close();
    const row = ordered.find((r) => r.id === id);
    if (row === undefined || header?.instrument_id === id) return;
    void api.edit((_blocks, by) => [testInstrumentOp(by, api.relatorioId, api.blockId, testKey, instrumentHeaderOf(row, testKey))]).catch(() => undefined);
  };

  const onOptionKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        focusOption(index + 1);
        return;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        focusOption(index - 1);
        return;
      case 'Home':
        event.preventDefault();
        focusOption(0);
        return;
      case 'End':
        event.preventDefault();
        focusOption(list.length - 1);
        return;
      case 'Escape':
        event.preventDefault();
        close();
        return;
      default:
        return;
    }
  };

  const fieldText = header === null ? t.instrumentEmpty : instrumentFieldText(header, registryRow?.name ?? null);

  return (
    <div className="instrument-picker-host">
      <div className="field combobox instrument-picker">
        <span className="field-label" id={labelId}>
          {t.instrumentLabel}
        </span>
        <button
          type="button"
          ref={trigger}
          className="input"
          aria-labelledby={`${labelId} ${valueId}`}
          aria-describedby={expired === null ? undefined : expiredId}
          aria-expanded={open}
          aria-controls={listId}
          onClick={toggle}
        >
          <span className="visually-hidden" id={valueId}>
            {fieldText}
          </span>
          {header === null ? (
            <span className="grow ip-name is-empty" aria-hidden="true">
              {t.instrumentEmpty}
            </span>
          ) : (
            <>
              <span className="ip-code" aria-hidden="true">
                {header.code}
              </span>
              <span className="grow ip-name" aria-hidden="true">
                {registryRow?.name ?? header.model ?? ''}
              </span>
            </>
          )}
        </button>
        <span className="combobox-chevron" aria-hidden="true">
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-chev-down" />
          </svg>
        </span>
      </div>
      {expired === null ? null : (
        <p className="ip-expired" id={expiredId}>
          {expired}
        </p>
      )}
      {header === null ? null : (
        <details className="ficha-details">
          <summary>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-chev-down" />
            </svg>
            {t.instrumentDetails}
          </summary>
          <p>{instrumentDetailText(header, expired !== null)}</p>
        </details>
      )}
      {!open ? null : list.length === 0 ? (
        <div className="combobox-list ip-empty" id={listId}>
          <p className="section-note">{t.noInstruments}</p>
          <Button variant="secondary" onPress={() => void navigate('/cadastros')}>
            {t.registerInstrument}
          </Button>
        </div>
      ) : (
        <div className="combobox-list" id={listId} role="radiogroup" aria-label={t.instrumentList}>
          {list.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              className="combobox-option"
              aria-checked={header?.instrument_id === option.id}
              tabIndex={index === tabbable ? 0 : -1}
              ref={(element) => {
                options.current.set(option.id, element);
              }}
              onClick={() => pick(option.id)}
              onKeyDown={(event) => onOptionKey(event, index)}
            >
              <span className="ip-code">{option.code}</span>
              <span className="grow">
                {option.name}
                {option.detail === '' ? null : (
                  <>
                    <br />
                    <span className="ip-detail">{option.detail}</span>
                  </>
                )}
                {option.expired === null ? null : (
                  <>
                    <br />
                    <span className="ip-expired">{option.expired}</span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
