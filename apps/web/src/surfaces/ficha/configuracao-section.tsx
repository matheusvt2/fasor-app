import { blockConfigWithOption, configFieldsOf, configOptionsOf, putBlockOp, type BlockDefinition, type BlockRow, type ConfigFieldView } from '@app/domain';
import { useId, useMemo } from 'react';
import { SegmentedControl } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { FichaApi } from './ficha-api.ts';
import { ReadOnlyField } from './ficha-fields.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';

/*
 * Story 14.5 (`63-ficha-cta.html`, the "Configuração" section): the configuration of a
 * library type's sheet, set on the sheet, above its nameplate. One Segmented control per
 * configuration field of the block's definition (the Chave de transferência automática's
 * tensão, polos, neutro, transição and bypass), the option in force being the kernel's
 * (`configFieldsOf`: the stored one, else the seed's default). A tap is one
 * `block/{id}/config` put holding the block's config with that one option changed
 * (`blockConfigWithOption`): structure, so it never moves a Rascunho relatório to Em campo.
 * The rows the tests show, their criteria and what prints follow from the kernel's reading
 * of the same config; nothing here hides a row. A type with no configuration field (every
 * FO.SERV-03 type) draws nothing. On a sheet marked not tested the options read as text.
 */

/** The labels of a field's options do not fit side by side on a phone: the segments stack there (`.segmented.is-wrap`). */
const WRAP_FROM_LETTERS = 20;

export function wrapsOnPhone(labels: readonly string[]): boolean {
  return labels.reduce((letters, label) => letters + label.length, 0) > WRAP_FROM_LETTERS;
}

export function ConfiguracaoSection({ api, block, definition }: { api: FichaApi; block: BlockRow; definition: BlockDefinition }) {
  const t = copy.ficha.configuracao;
  const headingId = useId();
  const readOnly = useSheetReadOnly();
  const fields = useMemo(() => configFieldsOf(block, definition), [block, definition]);
  if (fields.length === 0) return null;

  const choose = (fieldKey: string, optionKey: string) => {
    void api
      .edit((blocks, by) => {
        // The config as the freshest row holds it: a tap after another field's tap keeps both.
        const fresh = blocks.find((row) => row.id === api.blockId);
        if (fresh === undefined || configOptionsOf(fresh, definition)[fieldKey] === optionKey) return null;
        return [putBlockOp(by, api.relatorioId, api.blockId, 'config', blockConfigWithOption(fresh.config, fieldKey, optionKey))];
      })
      .catch(() => undefined);
  };

  return (
    <section className={readOnly ? 'section is-readonly' : 'section'} aria-labelledby={headingId} data-section="configuracao">
      <div className="section-head">
        <h2 id={headingId}>{t.title}</h2>
        {readOnly ? <span className="btn-reason">{copy.ficha.checklist.readOnlyReason}</span> : null}
      </div>
      <p className="section-note">{t.note}</p>
      <div className="nameplate-grid">
        {fields.map((field) =>
          readOnly ? (
            <ReadOnlyField key={field.key} field={{ kind: 'text', label: field.label }} value={field.valueLabel} />
          ) : (
            <ConfigField key={field.key} field={field} onChoose={(optionKey) => choose(field.key, optionKey)} />
          ),
        )}
      </div>
    </section>
  );
}

function ConfigField({ field, onChoose }: { field: ConfigFieldView; onChoose: (optionKey: string) => void }) {
  const labelId = useId();
  return (
    <div className="field" data-config-key={field.key}>
      <span className="field-label" id={labelId}>
        {field.label}
      </span>
      <SegmentedControl
        aria-labelledby={labelId}
        value={field.value}
        onChange={onChoose}
        options={field.options.map((option) => ({ value: option.key, label: option.label }))}
        wrap={wrapsOnPhone(field.options.map((option) => option.label))}
      />
    </div>
  );
}
