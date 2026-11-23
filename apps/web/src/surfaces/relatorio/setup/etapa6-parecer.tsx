import {
  effectiveParecer,
  offersAdditionalItems,
  PARECER_VERDICTS,
  parecerBoxText,
  parecerAbsentTexts,
  parecerBoxTone,
  parecerLooser,
  parecerOwnText,
  parecerReasonText,
  parecerReplacedText,
  parecerVerdictLabel,
  parecerWithoutOwnText,
  parecerWithVerdict,
  printedParecer,
  sectionRefText,
  sectionsCaption,
  type ParecerVerdict,
  type RelatorioParecer,
  type RelatorioSnapshot,
} from '@app/domain';
import { useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { TextButton } from '../../../components/index.ts';
import { GeneratedTextField } from '../../../components/generated-text-field.tsx';
import { useLatestChoice } from '../../../components/use-latest-choice.ts';
import { copy } from '../../../copy/pt-br.ts';
import type { BandRef } from './setup-fields.ts';
import type { UndoableEdits } from '../../../state/use-undoable-edits.ts';
import { AdditionalItems } from './additional-items.tsx';
import { spriteHref } from '../../../styles/sprite.ts';

/*
 * Etapa 6 — Conclusão e parecer (Story 7.4, `50-relatorio-setup.html` `#setup-parecer`):
 * the three-segment Conclusion control (`conclusion-pair is-verdict parecer-choice`), the
 * summary as the shared Generated text field, and the Parecer box preview, toned by the
 * verdict. Every tap writes the whole `setup.parecer` object built from the value the store
 * holds at write time (`onWriteParecer`), never the render's. Every word, count and sentence
 * is the kernel's; the static copy is `copy.setup`.
 *
 * Story 22.6 (2026-11-06, Bruno; amends FR-71): the segments show the effective verdict
 * (`effectiveParecer`: derived from the fichas, or a stricter one the engineer tapped); every
 * verdict looser than the derived one is disabled, with the kernel's reason line. e22f S5: with
 * no concluded sheet and no verdict tapped there is none: no segment is checked and the box,
 * as before Story 22.6, waits for one. The summary
 * is the composed one, read-only (~~Confirmar, Editar, Substituir~~); a summary typed before
 * shows under "Observações do responsável" with "Limpar", and none can be added.
 */

/** Builds the next parecer from the one the store holds now; null writes nothing. */
export type WriteParecer = (build: (current: RelatorioParecer | null) => RelatorioParecer | null, options?: { toast?: string }) => Promise<void>;

/** A relatório row stored before contract 59 holds no list: read as none. */
const NO_ITEMS: readonly string[] = [];

/** The segments in the mock's order; the value attribute is the box tone (`components.css`). */
const SEGMENTS: readonly ParecerVerdict[] = PARECER_VERDICTS;

export function Etapa6Parecer({
  relatorioId,
  snapshot,
  onWriteParecer,
  onBackToExport,
  onWriteAdditionalItems,
  undoable,
  bandRef,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  onWriteParecer: WriteParecer;
  /** Story 28.9: writes the whole `setup.additional_items` now, as its own batch; resolves to the batch id. */
  onWriteAdditionalItems: (value: string[]) => Promise<string | null>;
  undoable: UndoableEdits['undoable'];
  /** Shown when the band was opened from the Export dialog (`?volta=exportar`). */
  onBackToExport: (() => void) | null;
  bandRef: BandRef;
}) {
  const t = copy.setup;
  const labelId = useId();
  const hintId = useId();
  const verdict = useMemo(() => effectiveParecer(snapshot), [snapshot]);
  // Story 27.3 (F7): when the chosen verdict was replaced by a stricter one, that one line stands for the reason line.
  const reason = useMemo(() => parecerReplacedText(snapshot) ?? parecerReasonText(snapshot), [snapshot]);
  // Fix batch e27a-review (R1): the field says it is what section 10 prints, so it is composed as the print composes it
  // for this relatório's seed; the split of the open fichas stays in the reason line above.
  const composed = useMemo(() => printedParecer(snapshot), [snapshot]);
  const ownText = parecerOwnText(snapshot);
  // p020 P-1b: a relatório without section 10 says the parecer does not print (the kernel's texts).
  const absent = useMemo(() => parecerAbsentTexts(snapshot), [snapshot]);
  const looser = (segment: ParecerVerdict) => parecerLooser(snapshot, segment);

  const setVerdict = (next: ParecerVerdict | null) => {
    // A verdict is never cleared, and never set looser than the fichas give.
    if (next === null || parecerLooser(snapshot, next)) return;
    void onWriteParecer((current) => (current?.verdict === next ? null : parecerWithVerdict(current, next))).catch(() => undefined);
  };
  const { latest, emit } = useLatestChoice<ParecerVerdict>(verdict, setVerdict);
  const refs = useRef(new Map<ParecerVerdict, HTMLButtonElement | null>());
  // e22f S5: no verdict while no sheet is concluded and none was tapped: no segment checked, the first tabbable.
  const selected = verdict === null ? -1 : SEGMENTS.indexOf(verdict);
  const tabbable = selected === -1 ? SEGMENTS.findIndex((segment) => !looser(segment)) : selected;

  const moveTo = (index: number, step: number) => {
    // Story 22.6: the arrows skip a disabled verdict.
    let at = (index + SEGMENTS.length) % SEGMENTS.length;
    for (let tries = 0; tries < SEGMENTS.length && looser(SEGMENTS[at]!); tries += 1) at = (at + step + SEGMENTS.length) % SEGMENTS.length;
    const target = SEGMENTS[at]!;
    if (looser(target)) return;
    refs.current.get(target)?.focus();
    if (target !== latest.current) emit(target);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      moveTo(index + step, step);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (event.key === 'Home') moveTo(0, 1);
      else moveTo(SEGMENTS.length - 1, -1);
    }
  };

  const clearOwnText = () => void onWriteParecer((current) => (current === null || current.text_status === null ? null : parecerWithoutOwnText(current))).catch(() => undefined);

  return (
    <section className="section-band" aria-labelledby="setup-e6" id="setup-parecer" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          6
        </span>
        <h2 className="band-title" id="setup-e6" tabIndex={-1}>
          {t.etapa6Title}
        </h2>
        <span className="band-note">{t.etapa6Note(sectionsCaption(snapshot, [10]))}</span>
      </div>
      <div className="band-body">
        {onBackToExport === null ? null : (
          <div className="row">
            <TextButton onPress={onBackToExport}>{t.backToExport}</TextButton>
          </div>
        )}
        <p className="section-note">{absent?.note ?? t.parecerNote}</p>

        <div className="field">
          <span className="field-label" id={labelId}>
            {t.parecerLabel}
          </span>
          <div
            className="conclusion-pair is-verdict parecer-choice"
            role="radiogroup"
            aria-labelledby={labelId}
            aria-describedby={reason === null ? undefined : hintId}
          >
            {SEGMENTS.map((segment, index) => (
              <button
                key={segment}
                type="button"
                role="radio"
                className="seg"
                data-value={parecerBoxTone(segment)}
                aria-checked={segment === verdict}
                disabled={looser(segment)}
                tabIndex={index === tabbable ? 0 : -1}
                ref={(element) => {
                  refs.current.set(segment, element);
                }}
                onClick={() => {
                  // A re-tap of the chosen segment writes nothing (a glove double-tap).
                  if (segment !== latest.current) emit(segment);
                }}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <svg className="ico check" aria-hidden="true">
                  <use href={spriteHref('i-check')} />
                </svg>
                {parecerVerdictLabel(segment)}
              </button>
            ))}
          </div>
          {reason === null ? null : (
            <span className="conclusion-hint" id={hintId}>
              {reason}
            </span>
          )}
        </div>

        <GeneratedTextField
          label={t.parecerSummaryLabel}
          text={composed.text}
          criteriaItems={composed.criteriaItems}
          state="confirmed"
          onConfirm={() => undefined}
          onReplace={() => undefined}
          onEdit={() => undefined}
          draft={{ surface: 'setup', entityId: relatorioId, field: 'parecer-text' }}
          confirmedHelper={absent?.confirmedHelper ?? t.parecerComposed(sectionRefText(snapshot, 10))}
          readOnly
        />

        {ownText === null ? null : (
          <div className="field">
            <span className="field-label">
              {t.parecerOwnTextLabel}
            </span>
            <p className="section-note">
              {ownText}
            </p>
            <div className="row">
              <TextButton onPress={clearOwnText}>{t.parecerOwnTextClear}</TextButton>
            </div>
          </div>
        )}

        {verdict === null ? null : (
          <div className="parecer-box" role="status" aria-live="polite" data-verdict={parecerBoxTone(verdict)}>
            <span className="pb-kicker">{absent?.kicker ?? t.parecerKicker(sectionRefText(snapshot, 10))}</span>
            <span className="pb-verdict">{parecerVerdictLabel(verdict)}</span>
            <span className="pb-text">{parecerBoxText(snapshot)}</span>
          </div>
        )}

        {/* Story 28.9 (seed v18, B-15): the relatório's additional items under the parecer; none on an older seed. */}
        {offersAdditionalItems(snapshot.relatorio.seed_version) ? (
          <AdditionalItems stored={snapshot.relatorio.setup.additional_items ?? NO_ITEMS} onWrite={onWriteAdditionalItems} undoable={undoable} />
        ) : null}
      </div>
    </section>
  );
}
