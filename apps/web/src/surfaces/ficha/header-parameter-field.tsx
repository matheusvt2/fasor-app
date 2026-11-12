import {
  formatDecimalGroupedPtBr,
  headerParameterRestoredText,
  headerParameterView,
  headerWithParameter,
  headerWithRegistryParameter,
  numberEchoText,
  parseHeaderParameter,
  type BlockRow,
  type InstrumentRow,
  type TestKey,
} from '@app/domain';
import { useId } from 'react';
import { TextButton } from '../../components/index.ts';
import { useNumberInput } from '../../components/number-input.tsx';
import { copy } from '../../copy/pt-br.ts';
import { useToast } from '../../state/toast.tsx';
import type { FichaApi } from './ficha-api.ts';
import { DRAFT_SURFACE } from './ficha-fields.tsx';
import { testInstrumentOp } from './ficha-ops.ts';

/*
 * Story 25.11 (M06; `60-ficha.html` #/ficha/SEC-02 `.e25-header-param`, Story 25.1 Part B): the
 * test parameter of a seeded test's instrument header (TENSÃO ENSAIO, CORRENTE) as a number field
 * under the picker, on every seed. The label, the unit, the changed sign and the toast are the
 * kernel's (`headerParameterView`); a commit (blur or Enter) stores the header again through the
 * pick's own put (`sheet/{b}/test/{t}/instrument`) with the typed value in the pick's text form
 * (`headerWithParameter`). While the value differs from the registry's default the sign
 * "Alterada nesta ficha · cadastro: 10 kV" shows with "Usar a do instrumento", which stores the
 * registry's default back. The registry is never written. Nothing renders while no instrument is
 * stored (a suggestion is not a header) or on a read-only sheet.
 */
export function HeaderParameterField({
  api,
  block,
  testKey,
  instruments,
}: {
  api: FichaApi;
  block: BlockRow;
  testKey: TestKey;
  instruments: readonly InstrumentRow[];
}) {
  const t = copy.ficha.ensaios;
  const labelId = useId();
  const echoId = useId();
  const { showToast } = useToast();
  const view = headerParameterView(block, testKey, instruments);
  const unit = view?.unit ?? null;

  const number = useNumberInput({
    storedText: view?.text ?? '',
    storedRaw: view?.value?.raw ?? null,
    parse: (text) => {
      const parsed = parseHeaderParameter(text);
      return parsed === 'invalid' || parsed === null ? parsed : { raw: parsed.raw, unit };
    },
    commit: (value) =>
      void api
        .edit((blocks, by) => {
          const current = blocks.find((candidate) => candidate.id === api.blockId);
          const next = current === undefined ? null : headerWithParameter(current, testKey, value?.raw ?? null, unit);
          return next === null ? null : [testInstrumentOp(by, api.relatorioId, api.blockId, testKey, next)];
        })
        .catch(() => undefined),
    echo: (value) => numberEchoText(value.raw, value.unit),
    format: (value) => formatDecimalGroupedPtBr(value.raw),
    draft: { surface: DRAFT_SURFACE, entityId: api.blockId, field: `header-parameter-${testKey}` },
  });

  if (view === null) return null;

  const restore = () => {
    number.discard();
    void api
      .edit((blocks, by) => {
        const current = blocks.find((candidate) => candidate.id === api.blockId);
        const next = current === undefined ? null : headerWithRegistryParameter(current, testKey, instruments);
        return next === null ? null : [testInstrumentOp(by, api.relatorioId, api.blockId, testKey, next)];
      })
      .then((batch) => {
        if (batch !== null) showToast(headerParameterRestoredText(view));
      })
      .catch(() => undefined);
  };

  return (
    <div className={view.changed ? 'field e25-header-param' : 'field e25-header-param is-default'} data-header-parameter={testKey}>
      <span className="field-label" id={labelId}>
        {view.label}
      </span>
      <div className="measurement-field">
        <input
          className="mf-value"
          {...number.inputProps}
          aria-labelledby={labelId}
          aria-invalid={number.invalid || undefined}
          aria-describedby={number.echo === null ? undefined : echoId}
          placeholder="—"
        />
        {view.unit === null ? null : <span className="mf-unit">{view.unit}</span>}
      </div>
      {number.echo === null ? null : (
        <span className="mf-echo" id={echoId}>
          {number.echo}
        </span>
      )}
      {view.changed ? (
        <p className="e25-changed" data-header-parameter-changed="">
          <span className="e25-changed-word">{view.changedText}</span>
          <TextButton onPress={restore}>{t.headerParameterUseInstrument}</TextButton>
        </p>
      ) : null}
    </div>
  );
}
