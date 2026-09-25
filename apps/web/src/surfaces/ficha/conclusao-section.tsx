import {
  composeConclusion,
  conclusionBasisMatches,
  conclusionRestrictionOf,
  conclusionResultOf,
  conclusionStoredText,
  conclusionSuggestionText,
  conclusionTextState,
  enabledSubBlocksOf,
  observationRequired,
  restrictionWarning,
  suggestConclusionPair,
  suggestedSheetObservation,
  type BlockDefinition,
  type BlockRow,
  type ConclusionRestriction,
  type ConclusionResult,
} from '@app/domain';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { GeneratedTextField } from '../../components/generated-text-field.tsx';
import { SuggestionField } from '../../components/suggestion-field.tsx';
import { useLatestChoice } from '../../components/use-latest-choice.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { DRAFT_SURFACE, useTypedText } from './ficha-fields.tsx';
import type { FichaApi } from './ficha-api.ts';
import { conclusionOp, sheetObservationsOp } from './ficha-ops.ts';
import { useSheetReadOnly } from './sheet-read-only.tsx';

/*
 * The "Conclusão" step (Story 5.8, FR-29/30, UX-DR43-47; `60-ficha.html` "Observações" and
 * "Conclusão"): the sheet Observation field, required once Com restrições is set; the
 * kernel's suggested pair as a Suggestion field ("Aprovado · Sem restrições?", one tap sets
 * both, gone once any segment is set, never Reprovado); the Conclusion control, two
 * stacked radiogroups with the Tri-state control's keyboard (arrows, Home/End, Delete
 * clears); the "Há itens não conformes" warning; and, once the result is picked, the
 * Generated text field with the device-composed paragraph and its Criteria line. The app
 * never writes a verdict the engineer did not tap. On a sheet marked not tested (Story 5.9)
 * the Conclusão section is `.is-readonly` with the reason line: the two radiogroups are
 * `aria-readonly` (the value stays visible; a tap, an arrow or Delete changes nothing), no
 * suggestion row, and the Generated text field offers no action. The sheet Observation
 * field stays editable (Story 5.9 AC 2). Story 12.4 (D-7): while the sheet observation is
 * empty and NC items carry observations, the field is a Suggestion field holding the
 * kernel's "Item ⟨n⟩: ⟨observação⟩" lines, written by its "Confirmar" or together with the
 * conclusion text's confirm; Com restrições then needs no typing.
 */

type Segment<T extends string> = { value: T; attr: string; label: string };

function ConclusionPair<T extends string>({
  label,
  segments,
  value,
  onChange,
  missing,
  readOnly,
}: {
  label: string;
  segments: readonly Segment<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  missing: boolean;
  readOnly: boolean;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>());
  const selected = segments.findIndex((segment) => segment.value === value);
  const tabbable = selected === -1 ? 0 : selected;
  // E5-Q8: the guards read the last emitted value, never the prop one round trip behind.
  const { latest, emit } = useLatestChoice(value, onChange);

  const moveTo = (index: number) => {
    const target = segments[(index + segments.length) % segments.length]!;
    refs.current.get(target.value)?.focus();
    if (!readOnly && target.value !== latest.current) emit(target.value);
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
        if (!readOnly && latest.current !== null) emit(null);
        return;
      default:
        return;
    }
  };

  return (
    <div
      className="conclusion-pair"
      role="radiogroup"
      aria-label={label}
      aria-readonly={readOnly || undefined}
      aria-invalid={(!readOnly && value === null) || undefined}
      data-missing-field={missing && !readOnly ? '' : undefined}
    >
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
            if (!readOnly && segment.value !== latest.current) emit(segment.value);
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
  const obsSuggestedId = useId();
  const concHeading = useId();
  const readOnly = useSheetReadOnly();
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
  // Story 12.4 (D-7): with the sheet observation empty, the NC items' observations stand in
  // it as a suggestion until its "Confirmar" (or the conclusion text's) writes them; typing
  // replaces it. `typing` holds from the focus until a blur leaves the field empty.
  const suggestedObservation = useMemo(() => suggestedSheetObservation(block, definition), [block, definition]);
  const [typing, setTyping] = useState(false);
  const observationSuggested = suggestedObservation !== null && storedObservation.trim() === '' && observation.text.trim() === '' && !typing;
  const required = observationRequired(block) && observation.text.trim() === '' && !observationSuggested;
  const observationMissing = observationRequired(block) && result !== null && restriction !== null;

  const edit = (build: Parameters<FichaApi['edit']>[0]) => void api.edit(build).catch(() => undefined);

  /** The suggested observation, written from the fresh block (never over text written meanwhile); null when none applies. */
  const suggestedObservationOp = (blocks: readonly BlockRow[], by: Parameters<typeof sheetObservationsOp>[0]) => {
    const fresh = blocks.find((row) => row.id === api.blockId && row.removed_at === null);
    const text = fresh === undefined ? null : suggestedSheetObservation(fresh, definition);
    return text === null ? null : sheetObservationsOp(by, api.relatorioId, api.blockId, text);
  };

  const confirmObservation = () =>
    edit((blocks, by) => {
      const op = suggestedObservationOp(blocks, by);
      return op === null ? null : [op];
    });

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

  /**
   * Confirms a text: the text, `text_status` and the basis it was composed from, one batch;
   * with the sheet observation still empty, its suggestion joins the batch (D-7: confirmed
   * together with the conclusion text). E5-A4: a confirm of the composed text recomposes
   * from the freshest block first and writes nothing when its basis moved since the render
   * (a value changed between the draw and the tap): the field then shows the recomposed text
   * to confirm again. An edited text is the engineer's own and is written as typed, under
   * the basis they saw (a later change marks it stale, as before).
   */
  const confirmText = (text: string, status: 'confirmed' | 'edited') => {
    const basis = composed.basis;
    edit((blocks, by) => {
      if (status === 'confirmed') {
        const fresh = blocks.find((row) => row.id === api.blockId && row.removed_at === null);
        if (fresh === undefined || !conclusionBasisMatches(fresh, definition, tag, basis)) return null;
      }
      const observationOp = suggestedObservationOp(blocks, by);
      return [
        conclusionOp(by, api.relatorioId, api.blockId, 'text', text),
        conclusionOp(by, api.relatorioId, api.blockId, 'text_status', status),
        conclusionOp(by, api.relatorioId, api.blockId, 'text_basis', basis),
        ...(observationOp === null ? [] : [observationOp]),
      ];
    });
  };

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
          {/* The textarea keeps its place among the children, so the focus survives the switch between suggested and typed. */}
          <div className={observationSuggested ? 'field suggestion-field' : 'field'} data-state={observationSuggested ? 'suggested' : undefined}>
            <label className="field-label" htmlFor={obsFieldId}>
              {t.observationLabel}
            </label>
            <textarea
              id={obsFieldId}
              className="observation-field"
              value={observationSuggested ? suggestedObservation : observation.text}
              data-required={required ? '' : undefined}
              data-missing-field={required && observationMissing ? '' : undefined}
              aria-invalid={required || undefined}
              aria-describedby={required ? obsReasonId : observationSuggested ? obsSuggestedId : undefined}
              onFocus={() => {
                // Typing replaces the suggestion whole: the focused field is the empty,
                // typed one (a discrete event, so it is drawn before any keystroke lands);
                // a blur with nothing typed brings the suggestion back and writes nothing.
                if (observationSuggested) setTyping(true);
              }}
              onChange={(event) => {
                setTyping(true);
                observation.change(event.target.value);
              }}
              onBlur={() => {
                observation.blur();
                if (observation.text.trim() === '') setTyping(false);
              }}
            />
            {observationSuggested ? <span className="suggested-pill">{ui.suggestionField.suggested}</span> : null}
            {observationSuggested && !readOnly ? (
              <div className="generated-actions">
                <button
                  type="button"
                  className="btn btn-secondary confirm-action"
                  aria-describedby={obsFieldId}
                  data-missing-field={observationMissing ? '' : undefined}
                  onClick={confirmObservation}
                >
                  {ui.suggestionField.confirm}
                </button>
              </div>
            ) : null}
            {observationSuggested ? (
              <span className="helper" id={obsSuggestedId}>
                {t.observationSuggestedHelper}
              </span>
            ) : null}
            {required ? (
              <span className="helper" data-tone="red" id={obsReasonId}>
                {t.observationRequired}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      {enabled.has('conclusion') ? (
        <section className={readOnly ? 'section is-readonly' : 'section'} aria-labelledby={concHeading} id="ficha-conc">
          <div className="section-head">
            <h2 id={concHeading}>{t.title}</h2>
            {readOnly ? <span className="btn-reason">{copy.ficha.checklist.readOnlyReason}</span> : null}
          </div>
          {suggestion === null || readOnly ? null : (
            <div className="ficha-conc-sug-host">
              <SuggestionField label={t.suggestionLabel} onConfirm={applySuggestion}>
                {conclusionSuggestionText(suggestion)}
              </SuggestionField>
            </div>
          )}
          <div className="conclusion-control">
            <ConclusionPair label={t.resultGroup} segments={resultSegments} value={result} onChange={setResult} missing={result === null} readOnly={readOnly} />
            <ConclusionPair label={t.restrictionGroup} segments={restrictionSegments} value={restriction} onChange={setRestriction} missing={result !== null && restriction === null} readOnly={readOnly} />
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
                readOnly={readOnly}
              />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
