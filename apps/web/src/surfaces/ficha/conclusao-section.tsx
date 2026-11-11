import {
  appendObservation,
  composeConclusion,
  conclusionAdjusted,
  conclusionBasisMatches,
  conclusionAdjustWrites,
  conclusionFloorReasonText,
  conclusionPreview,
  conclusionRestrictionOf,
  conclusionResultOf,
  conclusionStoredText,
  conclusionSuggestion,
  conclusionSuggestionText,
  conclusionTextState,
  effectiveConclusionPair,
  enabledSubBlocksOf,
  isLooserThanFloor,
  observationRequired,
  sheetConclusionPath,
  sheetObservationsPath,
  suggestedSheetObservation,
  textCapOf,
  visitContextOf,
  type BlockDefinition,
  type SectionMention,
  type BlockRow,
  type ConclusionRestriction,
  type ConclusionResult,
  type VisitContext,
} from '@app/domain';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CharCount } from '../../components/index.ts';
import { GeneratedTextField } from '../../components/generated-text-field.tsx';
import { SuggestionField } from '../../components/suggestion-field.tsx';
import { useLatestChoice } from '../../components/use-latest-choice.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { DRAFT_SURFACE, useTypedText } from './ficha-fields.tsx';
import type { FichaApi } from './ficha-api.ts';
import { conclusionOp, sheetObservationsOp } from './ficha-ops.ts';
import { useSheetReadOnly } from './sheet-read-only.tsx';
import { DictatedSuggestion, DictationButton } from '../../speech/dictation.tsx';
import { useSheetObservationDictation } from './sheet-observation-dictation.tsx';

/*
 * The "Conclusão" step (Story 5.8, FR-29/30, UX-DR43-47; `60-ficha.html` "Observações" and
 * "Conclusão"): the sheet Observation field, required once Com restrições is set; the
 * kernel's suggested pair as a Suggestion field ("Aprovado · Sem restrições?", one tap sets
 * both, gone once any segment is set, never Reprovado); the Conclusion control, two
 * stacked radiogroups with the Tri-state control's keyboard (arrows, Home/End, Delete
 * clears); the "Há itens não conformes" warning; and, once the result is picked, the
 * Generated text field with the device-composed paragraph and its Criteria line. ~~The app
 * never writes a verdict the engineer did not tap.~~ Story 22.4: the radiogroups show the
 * effective pair (the stricter of the kernel's floor and the stored pair), every segment looser
 * than the floor is disabled with the kernel's one reason line, the suggestion row offers the
 * floor (Reprovado included), and a stored pair a later floor made stricter shows "Conclusão
 * ajustada pela ficha" with a Confirmar that writes the effective pair. On a sheet marked not tested (Story 5.9)
 * the Conclusão section is `.is-readonly` with the reason line: the two radiogroups are
 * `aria-readonly` (the value stays visible; a tap, an arrow or Delete changes nothing), no
 * suggestion row, and the Generated text field offers no action. The sheet Observation
 * field stays editable (Story 5.9 AC 2). Story 12.4 (D-7): while the sheet observation is
 * empty and NC items carry observations, the field is a Suggestion field holding the
 * kernel's "Item ⟨n⟩: ⟨observação⟩" lines, written by its "Confirmar" or together with the
 * conclusion text's own "Confirmar"; Com restrições then needs no typing. The text confirm
 * "Concluir ficha" folds into its batch (review 2026-10-08 Decision 1) never writes it. Story 9.4: the section head
 * carries "Ditar observações"; a dictated text (or a table utterance the kernel could not
 * read) waits under the field as a Suggestion field and "Usar" appends it (`appendObservation`).
 */

type Segment<T extends string> = { value: T; attr: string; label: string };

function ConclusionPair<T extends string>({
  label,
  segments,
  value,
  stored,
  onChange,
  missing,
  readOnly,
  isDisabled,
  describedBy,
  preview = false,
}: {
  label: string;
  segments: readonly Segment<T>[];
  /** Story 22.4: the value shown, the effective one (the floor's where nothing stricter is stored). */
  value: T | null;
  /** Story 22.4: the stored value, the one a tap compares with: a tap on a segment the floor shows stores it. */
  stored: T | null;
  onChange: (value: T | null) => void;
  missing: boolean;
  readOnly: boolean;
  /** Story 22.4: a segment looser than the floor, drawn disabled and skipped by the arrows. */
  isDisabled: (value: T) => boolean;
  /** Story 22.4: the reason line's id while a segment is disabled; Story 24.5: and the preview line's. */
  describedBy?: string | undefined;
  /**
   * Story 24.5 (`60-ficha.html` `.e24-conc`): the half is the kernel's preview (`conclusionPreview`):
   * no segment is checked, the floor's segment (`value`) carries `.is-floor` and the mock's preview look.
   */
  preview?: boolean;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>());
  const selected = segments.findIndex((segment) => segment.value === value);
  const tabbable = selected === -1 ? Math.max(0, segments.findIndex((segment) => !isDisabled(segment.value))) : selected;
  // E5-Q8: the guards read the last emitted value, never the prop one round trip behind.
  const { latest, emit } = useLatestChoice(stored, onChange);

  const moveTo = (index: number, step = 1) => {
    // Story 22.4: the arrows skip a disabled segment.
    let at = (index + segments.length) % segments.length;
    for (let tries = 0; tries < segments.length && isDisabled(segments[at]!.value); tries += 1) at = (at + step + segments.length) % segments.length;
    const target = segments[at]!;
    if (isDisabled(target.value)) return;
    refs.current.get(target.value)?.focus();
    if (!readOnly && target.value !== latest.current) emit(target.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveTo(index - 1, -1);
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
        moveTo(segments.length - 1, -1);
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
      aria-describedby={describedBy}
      data-missing-field={missing && !readOnly ? '' : undefined}
    >
      {segments.map((segment, index) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          className={preview && segment.value === value ? 'seg is-floor' : 'seg'}
          data-value={segment.attr}
          aria-checked={!preview && segment.value === value}
          disabled={isDisabled(segment.value)}
          tabIndex={index === tabbable ? 0 : -1}
          ref={(element) => {
            refs.current.set(segment.value, element);
          }}
          onClick={() => {
            // A re-tap of the chosen segment never un-marks it (a glove double-tap).
            if (!readOnly && !isDisabled(segment.value) && segment.value !== latest.current) emit(segment.value);
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
  section9,
  visit,
}: {
  api: FichaApi;
  block: BlockRow;
  definition: BlockDefinition;
  tag: string;
  className: string;
  onFocus: () => void;
  /** F43 (UX pass 2026-10-22): the kernel's `sectionMention` of section 9, where the conclusion prints. */
  section9: SectionMention;
  /** Batch e23v (Stories 23.5 and 23.6): the sheet's visit context (`visitContextOf`, from `useFichaData`), which every judgement here reads. */
  visit: VisitContext;
}) {
  const t = copy.ficha.conclusao;
  const obsHeading = useId();
  const obsFieldId = useId();
  const obsReasonId = useId();
  const obsSuggestedId = useId();
  const concHeading = useId();
  const floorReasonId = useId();
  const previewLineId = useId();
  const readOnly = useSheetReadOnly();
  const enabled = enabledSubBlocksOf(block);

  // Story 22.4: the effective pair (the floor's included) is what the radiogroups show. A sheet
  // marked not tested (read-only, Story 5.9) keeps showing the pair stored before the mark, which
  // no longer counts anywhere (`effectiveConclusionPair` ignores it).
  const effective = effectiveConclusionPair(block, definition, visit);
  const result = readOnly ? conclusionResultOf(block) : effective.result;
  const restriction = readOnly ? conclusionRestrictionOf(block) : effective.restriction;
  const suggestion = conclusionSuggestion(block, definition, visit);
  const floorReason = conclusionFloorReasonText(block, definition, visit);
  const adjusted = conclusionAdjusted(block, definition, visit);
  // Story 24.5: which half shows the floor as a preview, the kernel's answer; none on a read-only sheet.
  const preview = readOnly ? { result: false, restriction: false } : conclusionPreview(block, definition, visit);
  const previewing = preview.result || preview.restriction;
  /** The ids describing a group: the reason line while segments are disabled, the preview line while the group is a preview. */
  const describedBy = (inPreview: boolean) =>
    [floorReason === null || readOnly ? null : floorReasonId, inPreview ? previewLineId : null].filter((id) => id !== null).join(' ') || undefined;
  const looser = (value: ConclusionResult | ConclusionRestriction) => !readOnly && isLooserThanFloor(block, value, definition, visit);
  const composed = useMemo(() => composeConclusion(block, definition, tag, visit), [block, definition, tag, visit]);
  const textState = conclusionTextState(block, composed);
  const storedText = conclusionStoredText(block);

  const storedObservation = typeof block.sheet.observations?.value === 'string' ? block.sheet.observations.value : '';
  // Story 20.9: the kernel's caps of OBSERVAÇÕES and of the conclusion text (long texts).
  const observationCap = textCapOf(sheetObservationsPath(api.blockId));
  const conclusionTextCap = textCapOf(sheetConclusionPath(api.blockId, 'text'));
  const observation = useTypedText(
    storedObservation,
    (text) => (api.author === null ? undefined : api.commit([sheetObservationsOp(api.author, api.relatorioId, api.blockId, text.trim() === '' ? null : text)])),
    { entityId: api.blockId, field: 'observations' },
    { cap: observationCap },
  );
  // Story 12.4 (D-7): with the sheet observation empty, the NC items' observations stand in
  // it as a suggestion until its "Confirmar" (or the conclusion text's) writes them; typing
  // replaces it. `typing` holds from the focus until a blur leaves the field empty.
  const suggestedObservation = useMemo(() => suggestedSheetObservation(block, definition), [block, definition]);
  const [typing, setTyping] = useState(false);
  const dictation = useSheetObservationDictation();
  /** "Usar": the dictated text appended after what the field holds, written now. */
  const applyDictated = () => {
    const text = dictation.pending;
    dictation.discard();
    if (text === null) return;
    // After what the field shows: the Story 12.4 NC lines while they stand in it, else the text.
    observation.set(appendObservation(observationSuggested ? suggestedObservation : observation.text, text));
  };
  const observationSuggested = suggestedObservation !== null && storedObservation.trim() === '' && observation.text.trim() === '' && !typing;
  const required = observationRequired(block, definition, visit) && observation.text.trim() === '' && !observationSuggested;
  const observationMissing = observationRequired(block, definition, visit) && result !== null && restriction !== null;

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

  /**
   * Story 22.4: "Confirmar" under the adjusted note writes the effective pair of the fresh block,
   * one batch. e22f S1: with it, a confirmed (never an edited) text the floor made stale is
   * replaced by the text composed now (`conclusionAdjustWrites`).
   */
  const confirmAdjusted = () =>
    edit((blocks, by, rows) => {
      const fresh = blocks.find((row) => row.id === api.blockId && row.removed_at === null);
      if (fresh === undefined) return null;
      // Batch e23v (Stories 23.5 and 23.6): judged under the visit context of the build's fresh rows, as the conclude is.
      const writes = conclusionAdjustWrites(fresh, definition, tag, visitContextOf({ locations: rows.locations, equipment: rows.equipment }, fresh));
      if (writes === null) return null;
      return [
        ...(writes.result === null ? [] : [conclusionOp(by, api.relatorioId, api.blockId, 'result', writes.result)]),
        ...(writes.restriction === null ? [] : [conclusionOp(by, api.relatorioId, api.blockId, 'restriction', writes.restriction)]),
        ...(writes.text === null
          ? []
          : [
              // Contract 16: the composed text, flagged for the merge.
              conclusionOp(by, api.relatorioId, api.blockId, 'text', writes.text.text, { composed: true }),
              conclusionOp(by, api.relatorioId, api.blockId, 'text_status', 'confirmed'),
              conclusionOp(by, api.relatorioId, api.blockId, 'text_basis', writes.text.basis),
            ]),
      ];
    });

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
    /** Carry-over F: the basis moved between the draw and the tap, so nothing was written. */
    let moved = false;
    void api
      .edit((blocks, by, rows) => {
        // The build may run again on fresher rows: only its last run decides.
        moved = false;
        if (status === 'confirmed') {
          const fresh = blocks.find((row) => row.id === api.blockId && row.removed_at === null);
          // Batch e23v (Stories 23.5 and 23.6): the basis recomposed under the visit context of the build's fresh rows.
          if (fresh !== undefined && !conclusionBasisMatches(fresh, definition, tag, basis, visitContextOf({ locations: rows.locations, equipment: rows.equipment }, fresh))) moved = true;
          if (fresh === undefined || moved) return null;
        }
        const observationOp = suggestedObservationOp(blocks, by);
        return [
          // Contract 16: "Confirmar" and "Substituir" write the composed text, flagged for the merge.
          conclusionOp(by, api.relatorioId, api.blockId, 'text', text, status === 'confirmed' ? { composed: true } : undefined),
          conclusionOp(by, api.relatorioId, api.blockId, 'text_status', status),
          conclusionOp(by, api.relatorioId, api.blockId, 'text_basis', basis),
          ...(observationOp === null ? [] : [observationOp]),
        ];
      })
      .then(() => {
        // Said through the sheet's polite live region; the field already shows the recomposed text.
        if (moved) api.announce(t.basisMoved);
      })
      .catch(() => undefined);
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
            <DictationButton label={t.dictateObservations} onStart={dictation.discard} onResult={dictation.offer} />
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
              maxLength={observationCap ?? undefined}
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
                dictation.discard();
                observation.change(event.target.value);
              }}
              onBlur={() => {
                observation.blur();
                if (observation.text.trim() === '') setTyping(false);
              }}
            />
            {observationSuggested || readOnly ? null : <CharCount length={observation.text.length} cap={observationCap} />}
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
          {dictation.pending === null ? null : <DictatedSuggestion text={dictation.pending} onUse={applyDictated} />}
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
              <SuggestionField label={t.suggestionLabel} pill={ui.suggestionField.preview} onConfirm={applySuggestion}>
                {conclusionSuggestionText(suggestion)}
              </SuggestionField>
            </div>
          )}
          <div className="conclusion-control">
            <ConclusionPair
              label={t.resultGroup}
              segments={resultSegments}
              value={result}
              stored={conclusionResultOf(block)}
              onChange={setResult}
              missing={result === null}
              readOnly={readOnly}
              isDisabled={looser}
              describedBy={describedBy(preview.result)}
              preview={preview.result}
            />
            <ConclusionPair
              label={t.restrictionGroup}
              segments={restrictionSegments}
              value={restriction}
              stored={conclusionRestrictionOf(block)}
              onChange={setRestriction}
              missing={result !== null && restriction === null}
              readOnly={readOnly}
              isDisabled={looser}
              describedBy={describedBy(preview.restriction)}
              preview={preview.restriction}
            />
            {floorReason === null || readOnly ? null : (
              <span className="conclusion-hint" id={floorReasonId}>
                {floorReason}
              </span>
            )}
            {previewing ? (
              <span className="conclusion-hint e24-preview-line" id={previewLineId}>
                {t.previewLine}
              </span>
            ) : null}
            {adjusted && !readOnly ? (
              <span className="conclusion-hint" role="status">
                {t.adjustedNote}{' '}
                <button type="button" className="btn btn-secondary confirm-action" onClick={confirmAdjusted}>
                  {ui.suggestionField.confirm}
                </button>
              </span>
            ) : null}
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
                maxLength={conclusionTextCap ?? undefined}
                helper={t.textHelper(section9)}
                confirmedHelper={t.textConfirmed(section9)}
                readOnly={readOnly}
              />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
