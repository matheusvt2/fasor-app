import {
  composeParecer,
  PARECER_VERDICTS,
  parecerBoxText,
  parecerBoxTone,
  parecerHintText,
  parecerTextState,
  parecerVerdictLabel,
  parecerWithText,
  parecerWithVerdict,
  suggestParecer,
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

/*
 * Etapa 6 — Conclusão e parecer (Story 7.4, `50-relatorio-setup.html` `#setup-parecer`):
 * the three-segment Conclusion control (`conclusion-pair is-verdict parecer-choice`,
 * nothing preselected), the counts' suggestion as its hint (never Não apto, never set), the
 * summary as the shared Generated text field (Confirmar, Editar, Substituir as Story 5.8,
 * which wins over the mock's `parecer-own` field; dictation stays out of the slice), and
 * the Parecer box preview, toned by the verdict once one is set, never by a suggestion.
 * Every tap and text action writes the whole `setup.parecer` object built from the value
 * the store holds at write time (`onWriteParecer`), never the render's. Every word, count
 * and sentence is the kernel's; the static copy is `copy.setup`.
 */

/** Builds the next parecer from the one the store holds now; null writes nothing. */
export type WriteParecer = (build: (current: RelatorioParecer | null) => RelatorioParecer | null, options?: { toast?: string }) => Promise<void>;

/** The segments in the mock's order; the value attribute is the box tone (`components.css`). */
const SEGMENTS: readonly ParecerVerdict[] = PARECER_VERDICTS;

export function Etapa6Parecer({
  relatorioId,
  snapshot,
  onWriteParecer,
  onBackToExport,
  bandRef,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  onWriteParecer: WriteParecer;
  /** Shown when the band was opened from the Export dialog's blocking row (`?volta=exportar`). */
  onBackToExport: (() => void) | null;
  bandRef: BandRef;
}) {
  const t = copy.setup;
  const labelId = useId();
  const hintId = useId();
  const parecer = snapshot.relatorio.setup.parecer;
  const verdict = parecer?.verdict ?? null;
  const suggestion = useMemo(() => suggestParecer(snapshot), [snapshot]);
  const hint = useMemo(() => parecerHintText(suggestion, snapshot), [suggestion, snapshot]);
  const composed = useMemo(() => composeParecer(snapshot), [snapshot]);
  const textState = parecerTextState(parecer, composed);

  const setVerdict = (next: ParecerVerdict | null) => {
    // A verdict is never cleared: the parecer only moves between the three.
    if (next === null) return;
    void onWriteParecer((current) => (current?.verdict === next ? null : parecerWithVerdict(current, next))).catch(() => undefined);
  };
  const { latest, emit } = useLatestChoice<ParecerVerdict>(verdict, setVerdict);
  const refs = useRef(new Map<ParecerVerdict, HTMLButtonElement | null>());
  const selected = verdict === null ? -1 : SEGMENTS.indexOf(verdict);
  const tabbable = selected === -1 ? 0 : selected;

  const moveTo = (index: number) => {
    const target = SEGMENTS[(index + SEGMENTS.length) % SEGMENTS.length]!;
    refs.current.get(target)?.focus();
    if (target !== latest.current) emit(target);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      moveTo(index + step);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveTo(event.key === 'Home' ? 0 : SEGMENTS.length - 1);
    }
  };

  const writeText = (text: string, status: 'confirmed' | 'edited', toast?: string) =>
    onWriteParecer((current) => (current === null ? null : parecerWithText(current, text, status, composed.basis)), toast === undefined ? undefined : { toast });

  return (
    <section className="section-band" aria-labelledby="setup-e6" id="setup-parecer" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          6
        </span>
        <h2 className="band-title" id="setup-e6" tabIndex={-1}>
          {t.etapa6Title}
        </h2>
        <span className="band-note">{t.etapa6Note}</span>
      </div>
      <div className="band-body">
        {onBackToExport === null ? null : (
          <div className="row">
            <TextButton onPress={onBackToExport}>{t.backToExport}</TextButton>
          </div>
        )}
        <p className="section-note">{t.parecerNote}</p>

        <div className="field">
          <span className="field-label" id={labelId}>
            {t.parecerLabel}
          </span>
          <div
            className="conclusion-pair is-verdict parecer-choice"
            role="radiogroup"
            aria-labelledby={labelId}
            aria-describedby={hint === null ? undefined : hintId}
          >
            {SEGMENTS.map((segment, index) => (
              <button
                key={segment}
                type="button"
                role="radio"
                className="seg"
                data-value={parecerBoxTone(segment)}
                aria-checked={segment === verdict}
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
                  <use href="/sprite.svg#i-check" />
                </svg>
                {parecerVerdictLabel(segment)}
              </button>
            ))}
          </div>
          {hint === null ? null : (
            <span className="conclusion-hint" id={hintId}>
              {hint}
            </span>
          )}
        </div>

        {parecer === null ? null : (
          <GeneratedTextField
            label={t.parecerSummaryLabel}
            text={textState === 'unconfirmed' ? composed.text : (parecer.text ?? '')}
            criteriaItems={composed.criteriaItems}
            state={textState}
            onConfirm={() => void writeText(composed.text, 'confirmed', t.parecerConfirmedToast).catch(() => undefined)}
            onReplace={() => void writeText(composed.text, 'confirmed').catch(() => undefined)}
            onEdit={(text) => writeText(text, 'edited')}
            draft={{ surface: 'setup', entityId: relatorioId, field: 'parecer-text' }}
            helper={t.parecerHelper}
            confirmedHelper={t.parecerConfirmed}
          />
        )}

        {parecer === null ? null : (
          <div className="parecer-box" role="status" aria-live="polite" data-verdict={parecerBoxTone(parecer.verdict)}>
            <span className="pb-kicker">{t.parecerKicker}</span>
            <span className="pb-verdict">{parecerVerdictLabel(parecer.verdict)}</span>
            <span className="pb-text">{parecerBoxText(snapshot)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
