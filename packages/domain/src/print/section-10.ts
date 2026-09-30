import { councilLabel, defaultTitleForCouncil } from '../registration.ts';
import { parecerOf, parecerTextForPrint, parecerVerdictLabel } from '../relatorio/parecer.ts';
import type { Council } from '../schemas/council.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
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
 */

export interface LayoutSection10 {
  number: number;
  title: string;
  kind: 'section_10';
  parecer: {
    /** The verdict word, or `[Parecer]` while none is set (a preview; issue is blocked then). */
    title: string;
    /** The confirmed or edited summary; null while unconfirmed. */
    text: string | null;
  };
  /**
   * The section's fixed items, in order: each its plain `text` and, Story 11.4, its printed
   * runs (bold and italic from the template's formatted text; a seed item is one plain run).
   */
  bullets: { text: string; runs: RichRun[] }[];
  validityLine: string;
  signature: { name: string; title: string; registration: string };
}

// authored: the box title of a relatório with no parecer yet, in the `[Label]` form a
// section body prints for a missing value (only a preview can print it).
export const PARECER_MISSING_TITLE = '[Parecer]';

/**
 * "Este relatório tem validade apenas acompanhada da ART 2620262602583" (CREA), "… da TRT 9"
 * (CRT), "… da ART/TRT …" while the council is unknown; a blank number prints the label in
 * brackets (`[ART]`, `[TRT]`, `[ART/TRT]`), the `[Label]` form of a missing value.
 */
export function validityLine(council: Council | null, number: string | null): string {
  const label = artLabel(council);
  const value = number === null || number.trim() === '' ? `[${label}]` : number.trim();
  return `Este relatório tem validade apenas acompanhada da ${label} ${value}`;
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
  base: { number: number; title: string; paragraphs?: readonly { text: string; runs?: readonly RichRun[] }[] },
): LayoutSection10 {
  const parecer = parecerOf(snapshot);
  return {
    number: base.number,
    title: base.title,
    kind: 'section_10',
    parecer: {
      title: parecer === null ? PARECER_MISSING_TITLE : parecerVerdictLabel(parecer.verdict),
      text: parecerTextForPrint(snapshot),
    },
    bullets: (base.paragraphs ?? []).map((paragraph) => ({ text: paragraph.text, runs: paragraph.runs === undefined ? [{ text: paragraph.text }] : [...paragraph.runs] })),
    validityLine: validityLine(snapshot.responsible?.council ?? null, snapshot.relatorio.setup.art_trt_number),
    signature: signatureOf(snapshot.responsible),
  };
}
