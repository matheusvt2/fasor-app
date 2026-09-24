import {
  composeConclusion,
  conclusionRestrictionOf,
  conclusionResultOf,
  conclusionStoredText,
  conclusionSuggestionText,
  conclusionTextState,
  enabledSubBlocksOf,
  observationRequired,
  restrictionWarning,
  suggestConclusionPair,
  type BlockDefinition,
  type BlockRow,
  type ConclusionRestriction,
  type ConclusionResult,
} from '@app/domain';
import { useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { GeneratedTextField } from '../../components/generated-text-field.tsx';
import { SuggestionField } from '../../components/suggestion-field.tsx';
import { copy } from '../../copy/pt-br.ts';
import { DRAFT_SURFACE, useTypedText } from './ficha-fields.tsx';
import type { FichaApi } from './ficha-api.ts';
import { conclusionOp, sheetObservationsOp } from './ficha-ops.ts';

/*
 * The "Conclusão" step (Story 5.8, FR-29/30, UX-DR43-47; `60-ficha.html` "Observações" and
 * "Conclusão"): the sheet Observation field, required once Com restrições is set; the
 * kernel's suggested pair as a Suggestion field ("Aprovado · Sem restrições?", one tap sets
 * both, gone once any segment is set, never Reprovado); the Conclusion control, two
 * stacked radiogroups with the Tri-state control's keyboard (arrows, Home/End, Delete
 * clears); the "Há itens não conformes" warning; and, once the result is picked, the
 * Generated text field with the device-composed paragraph and its Criteria line. The app
 * never writes a verdict the engineer did not tap. "Não ensaiado" is Story 5.9's.
 */

type Segment<T extends string> = { value: T; attr: string; label: string };

function ConclusionPair<T extends string>({
  label,
  segments,
  value,
  onChange,
  missing,
}: {
  label: string;
  segments: readonly Segment<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  missing: boolean;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>());
  const selected = segments.findIndex((segment) => segment.value === value);
  const tabbable = selected === -1 ? 0 : selected;

  const moveTo = (index: number) => {
    const target = segments[(index + segments.length) % segments.length]!;
    refs.current.get(target.value)?.focus();
    if (target.value !== value) onChange(target.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveTo(index - 1);
        return;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveTo(index + 1);
        return;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        return;
      case 'End':
        event.preventDefault();
        moveTo(segments.length - 1);
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        if (value !== null) onChange(null);
        return;
      default:
        return;
    }
  };

  return (
    <div className="conclusion-pair" role="radiogroup" aria-label={label} aria-invalid={value === null || undefined} data-missing-field={missing ? '' : undefined}>
      {segments.map((segment, index) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          className="seg"
          data-value={segment.attr}
          aria-checked={segment.value === value}
          tabIndex={index === tabbable ? 0 : -1}
          ref={(element) => {
            refs.current.set(segment.value, element);
          }}
          onClick={() => {
            // A re-tap of the chosen segment never un-marks it (a glove double-tap).
            if (segment.value !== value) onChange(segment.value);
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <svg className="ico check" aria-hidden="true">
            <use href="/sprite.svg#i-check" />
          </svg>
          {segment.label}
        </button>
      ))}
    </div>
  );
}

export function ConclusaoSection({
  api,
  block,
  definition,
  tag,
  className,
  onFocus,
}: {
  api: FichaApi;
  block: BlockRow;
  definition: BlockDefinition;
  tag: string;
  className: string;
  onFocus: () => void;
}) {
  const t = copy.ficha.conclusao;
  const obsHeading = useId();
  const obsFieldId = useId();
  const obsReasonId = useId();
  const concHeading = useId();
  const enabled = enabledSubBlocksOf(block);

  const result = conclusionResultOf(block);
  const restriction = conclusionRestrictionOf(block);
  const suggestion = suggestConclusionPair(block);
  const warning = restrictionWarning(block);
  const composed = useMemo(() => composeConclusion(block, definition, tag), [block, definition, tag]);
  const textState = conclusionTextState(block, composed);
  const storedText = conclusionStoredText(block);

  const storedObservation = typeof block.sheet.observations?.value === 'string' ? block.sheet.observations.value : '';
  const observation = useTypedText(
    storedObservation,
    (text) => (api.author === null ? undefined : api.commit([sheetObservationsOp(api.author, api.relatorioId, api.blockId, text.trim() === '' ? null : text)])),
    { entityId: api.blockId, field: 'observations' },
  );
  const required = observationRequired(block) && observation.text.trim() === '';

  const edit = (build: Parameters<FichaApi['edit']>[0]) => void api.edit(build).catch(() => undefined);

  const setResult = (value: ConclusionResult | null) => edit((_b, by) => [conclusionOp(by, api.relatorioId, api.blockId, 'result', value)]);
  const setRestriction = (value: ConclusionRestriction | null) => edit((_b, by) => [conclusionOp(by, api.relatorioId, api.blockId, 'restriction', value)]);

  const applySuggestion = () => {
    if (suggestion === null) return;
    edit((blocks, by) => {
      const fresh = blocks.find((row) => row.id === api.blockId);
      if (fresh === undefined || conclusionResultOf(fresh) !== null || conclusionRestrictionOf(fresh) !== null) return null;
      return [conclusionOp(by, api.relatorioId, api.blockId, 'result', suggestion.result), conclusionOp(by, api.relatorioId, api.blockId, 'restriction', suggestion.restriction)];
    });
  };

  /** Confirms a text: the text, `text_status` and the basis it was composed from, one batch. */
  const confirmText = (text: string, status: 'confirmed' | 'edited') =>
    edit((_b, by) => [
      conclusionOp(by, api.relatorioId, api.blockId, 'text', text),
      conclusionOp(by, api.relatorioId, api.blockId, 'text_status', status),
      conclusionOp(by, api.relatorioId, api.blockId, 'text_basis', composed.basis),
    ]);

  const resultSegments: Segment<ConclusionResult>[] = [
    { value: 'aprovado', attr: 'aprovado', label: t.aprovado },
    { value: 'reprovado', attr: 'reprovado', label: t.reprovado },
  ];
  const restrictionSegments: Segment<ConclusionRestriction>[] = [
    { value: 'sem_restricoes', attr: 'sem-restricoes', label: t.semRestricoes },
    { value: 'com_restricoes', attr: 'com-restricoes', label: t.comRestricoes },
  ];

  return (
    <div id="ficha-step-conclusao" className={className} data-step="conclusao" tabIndex={-1} onFocus={onFocus}>
      {enabled.has('observations') ? (
        <section className="section" aria-labelledby={obsHeading}>
          <div className="section-head">
            <h2 id={obsHeading}>{t.observationTitle}</h2>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={obsFieldId}>
              {t.observationLabel}
            </label>
            <textarea
              id={obsFieldId}
              className="observation-field"
              value={observation.text}
              data-required={required ? '' : undefined}
              data-missing-field={required && result !== null && restriction !== null ? '' : undefined}
              aria-invalid={required || undefined}
              aria-describedby={required ? obsReasonId : undefined}
              onChange={(event) => observation.change(event.target.value)}
              onBlur={observation.blur}
            />
            {required ? (
              <span className="helper" data-tone="red" id={obsReasonId}>
                {t.observationRequired}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      {enabled.has('conclusion') ? (
        <section className="section" aria-labelledby={concHeading} id="ficha-conc">
          <div className="section-head">
            <h2 id={concHeading}>{t.title}</h2>
          </div>
          {suggestion === null ? null : (
            <div className="ficha-conc-sug-host">
              <SuggestionField label={t.suggestionLabel} onConfirm={applySuggestion}>
                {conclusionSuggestionText(suggestion)}
              </SuggestionField>
            </div>
          )}
          <div className="conclusion-control">
            <ConclusionPair label={t.resultGroup} segments={resultSegments} value={result} onChange={setResult} missing={result === null} />
            <ConclusionPair label={t.restrictionGroup} segments={restrictionSegments} value={restriction} onChange={setRestriction} missing={result !== null && restriction === null} />
            {warning === null ? null : (
              <span className="conclusion-hint" role="status">
                {warning}
              </span>
            )}
          </div>
          {result === null ? null : (
            <div className="ficha-conc-text">
              <GeneratedTextField
                label={t.textLabel}
                text={textState === 'unconfirmed' ? composed.text : (storedText ?? '')}
                criteriaItems={composed.criteriaItems}
                state={textState}
                onConfirm={() => confirmText(composed.text, 'confirmed')}
                onReplace={() => confirmText(composed.text, 'confirmed')}
                onEdit={(text) => confirmText(text, 'edited')}
                draft={{ surface: DRAFT_SURFACE, entityId: api.blockId, field: 'conclusion-text' }}
                helper={t.textHelper}
                confirmedHelper={t.textConfirmed}
              />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
