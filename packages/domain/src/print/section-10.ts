import { councilLabel, defaultTitleForCouncil } from '../registration.ts';
import { effectiveParecer, parecerOwnText, parecerTextForPrint, parecerVerdictLabel } from '../relatorio/parecer.ts';
import { resultsItemsText } from '../relatorio/section-variables.ts';
import type { Council } from '../schemas/council.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { seedRule } from '../seed/definitions.ts';
import type { RichRun } from '../templates/rich-text.ts';
import { SECTION_VARIABLE_LABELS } from '../templates/section-text.ts';
import { artLabel } from './document-control.ts';

/*
 * Story 7.4 (FR-72): section 10 as the printed document carries it -- the Parecer box (the
 * verdict word as its title, then the confirmed summary), the section's fixed bullets (its
 * own text or the seed's, as every section text), the validity line naming the ART or the
 * TRT by the responsible's council, and the signature block (name, printed title,
 * registration). No signature image. `layout.ts` dispatches here for section 10 and
 * `apps/api/src/jobs/generate/sections/section-10.ts` renders it; neither composes a string.
 *
 * Story 22.6 (Bruno, 2026-11-06): the box title is the effective verdict (`effectiveParecer`;
 * e22f S5: `[Parecer]` while none exists), its text the composed summary, then a summary typed before this story as
 * "Observações do responsável" (`ownText`). Under Não apto the third fixed bullet ("Apesar dos
 * resultados dos testes serem positivos...") does not print (DF-4 of the 2026-10-08 field
 * review), and the fixed reference "nos itens 8 e 9" of a v1 to v7 seed text or of a
 * template's own text reads the printed positions (`resultsItemsText`, as `{itens_resultados}`
 * of v8 on). Both are print rules on the seed's text: no new seed version.
 */

export interface LayoutSection10 {
  number: number;
  title: string;
  kind: 'section_10';
  parecer: {
    /** The verdict word of the effective verdict; e22f S5: `[Parecer]` while none exists (a preview; issue is blocked then). */
    title: string;
    /** The composed summary (Story 22.6: always printed). */
    text: string | null;
    /** Story 22.6: a summary typed before Story 22.6, printed after the composed one ("Observações do responsável: …"); null when none. */
    ownText: string | null;
  };
  /**
   * The section's fixed items, in order: each its plain `text` and, Story 11.4, its printed
   * runs (bold and italic from the template's formatted text; a seed item is one plain run).
   * A numbered item of the own text keeps `numbered` and its position; every other block
   * prints as a bullet (`item`).
   */
  bullets: { kind: 'item' | 'numbered'; number?: number; text: string; runs: RichRun[] }[];
  validityLine: string;
  signature: { name: string; title: string; registration: string };
}

// authored: the box title of a relatório with no parecer yet, in the `[Label]` form a
// section body prints for a missing value (only a preview can print it). e22f S5: back, for a
// relatório with no concluded sheet and no verdict tapped (`effectiveParecer` null).
export const PARECER_MISSING_TITLE = '[Parecer]';

/** Story 22.6: the seed's start of the third fixed bullet, which never prints under Não apto. */
const POSITIVE_RESULTS_BULLET = 'Apesar dos resultados dos testes serem positivos';

/** Story 22.6: FO.SERV-03's fixed reference to the results sections, as seeded in v1 to v7 and copied into a template's own text. */
const FIXED_RESULTS_REFERENCE = 'nos itens 8 e 9';

// authored (Story 22.6, open for Bruno): the paragraph a summary typed before the summary became the composed one prints as.
export const PARECER_OWN_TEXT_LABEL = 'Observações do responsável';

/** The own-text paragraph: "Observações do responsável: ⟨text⟩". */
export function parecerOwnTextParagraph(text: string): string {
  return `${PARECER_OWN_TEXT_LABEL}: ${text}`;
}

/**
 * "Este relatório tem validade apenas acompanhada da ART 2620262602583" (CREA), "… da TRT 9"
 * (CRT), "… da ART/TRT …" while the council is unknown; a blank number prints the label in
 * brackets (`[ART]`, `[TRT]`, `[ART/TRT]`), the `[Label]` form of a missing value. Story 25.22 (`withoutNumber`, seed
 * v15): "Este relatório tem validade apenas acompanhado da respectiva ART." whatever the number.
 */
export function validityLine(council: Council | null, number: string | null, withoutNumber = false): string {
  const label = artLabel(council);
  // Story 25.22 (seed v15 `validity_line_without_number`; M-4 of the Epic 24 proposal): no number, so a blank one prints no bracket.
  if (withoutNumber) return `Este relatório tem validade apenas acompanhado da respectiva ${label}.`;
  const value = number === null || number.trim() === '' ? `[${label}]` : number.trim();
  return `Este relatório tem validade apenas acompanhada da ${label} ${value}`;
}

/**
 * Batch e24a (Story 24.4, seed v14, row at 3125): FO.SERV-03's fixed "nos itens 8 e 9" replaced by
 * `reference` where a template's own text splits it across formatted runs ("nos itens " and a bold
 * "8 e 9"): the runs are read joined, each occurrence is replaced, the replaced phrase takes the marks
 * of the run where it starts, and the text around it keeps its own run; a run left empty is dropped.
 */
export function referenceAcrossRuns(runs: readonly RichRun[], reference: string): RichRun[] {
  const joined = runs.map((run) => run.text).join('');
  const matches: { from: number; to: number }[] = [];
  for (let at = joined.indexOf(FIXED_RESULTS_REFERENCE); at !== -1; at = joined.indexOf(FIXED_RESULTS_REFERENCE, at + FIXED_RESULTS_REFERENCE.length)) {
    matches.push({ from: at, to: at + FIXED_RESULTS_REFERENCE.length });
  }
  const out: RichRun[] = [];
  let runFrom = 0;
  for (const run of runs) {
    const runTo = runFrom + run.text.length;
    let text = '';
    let cursor = runFrom;
    for (const match of matches) {
      if (match.to <= runFrom || match.from >= runTo) continue;
      if (match.from > cursor) text += joined.slice(cursor, match.from);
      if (match.from >= runFrom) text += reference;
      cursor = Math.min(match.to, runTo);
    }
    if (cursor < runTo) text += joined.slice(cursor, runTo);
    if (text !== '') out.push({ ...run, text });
    runFrom = runTo;
  }
  return out;
}

/** The signature block: the responsible's name, printed title and registration ("CREA 5063583141"). */
function signatureOf(responsible: RelatorioSnapshot['responsible']): LayoutSection10['signature'] {
  if (responsible === null) return { name: `[${SECTION_VARIABLE_LABELS.responsavel}]`, title: '', registration: '' };
  const name = responsible.name.trim() === '' ? `[${SECTION_VARIABLE_LABELS.responsavel}]` : responsible.name.trim();
  const ownTitle = responsible.title?.trim() ?? '';
  const council = responsible.council;
  const title = ownTitle !== '' ? ownTitle : council === null ? '' : defaultTitleForCouncil(council);
  const number = responsible.registration_number?.trim() ?? '';
  const registration = council === null ? '' : number === '' ? councilLabel(council) : `${councilLabel(council)} ${number}`;
  return { name, title, registration };
}

/**
 * Section 10's layout from the section as `layoutSpec` resolved it (`base`: its number,
 * title and printable paragraphs, or an empty section when the text resolves to nothing).
 */
export function section10Layout(
  snapshot: RelatorioSnapshot,
  base: { number: number; title: string; paragraphs?: readonly { kind?: string; number?: number; text: string; runs?: readonly RichRun[] }[] },
): LayoutSection10 {
  const verdict = effectiveParecer(snapshot);
  const reference = resultsItemsText(snapshot);
  const positioned = (text: string) => text.replaceAll(FIXED_RESULTS_REFERENCE, reference);
  // Batch e24a (Story 24.4, seed v14, row at 3125): the reference replaced across the formatted runs it spans.
  const acrossRuns = seedRule(snapshot.relatorio.seed_version, 'results_reference_across_runs');
  const positionedRuns = (runs: readonly RichRun[]): RichRun[] => (acrossRuns ? referenceAcrossRuns(runs, reference) : runs.map((run) => ({ ...run, text: positioned(run.text) })));
  return {
    number: base.number,
    title: base.title,
    kind: 'section_10',
    parecer: {
      title: verdict === null ? PARECER_MISSING_TITLE : parecerVerdictLabel(verdict),
      text: parecerTextForPrint(snapshot),
      ownText: parecerOwnText(snapshot),
    },
    bullets: (base.paragraphs ?? [])
      .filter((paragraph) => verdict !== 'nao_apto' || !paragraph.text.trimStart().startsWith(POSITIVE_RESULTS_BULLET))
      .map((paragraph) => ({
        ...(paragraph.kind === 'numbered' ? { kind: 'numbered' as const, ...(paragraph.number === undefined ? {} : { number: paragraph.number }) } : { kind: 'item' as const }),
        text: positioned(paragraph.text),
        runs: paragraph.runs === undefined ? [{ text: positioned(paragraph.text) }] : positionedRuns(paragraph.runs),
      })),
    validityLine: validityLine(
      snapshot.responsible?.council ?? null,
      snapshot.relatorio.setup.art_trt_number,
      seedRule(snapshot.relatorio.seed_version, 'validity_line_without_number'),
    ),
    signature: signatureOf(snapshot.responsible),
  };
}
