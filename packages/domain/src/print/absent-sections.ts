import { sectionRefText } from '../relatorio/section-position.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { printsSection } from './layout.ts';

/*
 * p020 P-1b (v0.2.0 production check): what the app says when the relatório does not print
 * section 8 (points of attention) or section 10 (parecer and signature), read through the
 * one rule `printsSection`. A relatório printing the seed's eleven, or with both sections,
 * gets none of these texts. Nothing here changes what prints.
 *
 * UX pass 2026-10-22 (F43): a section the relatório does not carry has no Sumário number, so
 * these texts name it by its Sumário title (`sectionRefText`), never by its FO.SERV-03 number.
 */

type PrintsInput = Pick<RelatorioSnapshot, 'blocks' | 'relatorio'>;

/** Etapa 6's texts for a relatório without section 10. */
export interface ParecerAbsentTexts {
  /** In place of the band's note on the parecer. */
  note: string;
  /** The confirmed helper of the parecer summary. */
  confirmedHelper: string;
  /** The toast of the summary's "Confirmar". */
  toast: string;
  /** The parecer box's kicker. */
  kicker: string;
}

/** Etapa 6's variant texts while section 10 does not print, else null (the band reads as before). */
export function parecerAbsentTexts(snapshot: PrintsInput): ParecerAbsentTexts | null {
  if (printsSection(snapshot, 10)) return null;
  const ref = sectionRefText(snapshot, 10);
  return {
    // authored: p020 P-1b, Etapa 6 on a relatório without section 10.
    note: `Este relatório não tem a ${ref}: o parecer e a assinatura não saem no documento.`,
    // authored: p020 P-1b.
    confirmedHelper: `Confirmado · não sai no documento: o relatório não tem a ${ref}`,
    // authored: p020 P-1b.
    toast: 'Resumo do parecer confirmado',
    // authored: p020 P-1b.
    kicker: `Não sai no documento (sem ${ref})`,
  };
}

/**
 * The sentence the Sumário's reason line ends with, naming what will not print: section 8's
 * points of attention, section 10's parecer and signature, or both; null when both print.
 */
export function absentSectionsSentence(snapshot: PrintsInput): string | null {
  const no8 = !printsSection(snapshot, 8);
  const no10 = !printsSection(snapshot, 10);
  const ref8 = sectionRefText(snapshot, 8);
  const ref10 = sectionRefText(snapshot, 10);
  // authored: p020 P-1b, the three sentences of the Sumário's reason line.
  if (no8 && no10) return `Sem a ${ref8} e a ${ref10}, os pontos de atenção, o parecer e a assinatura não saem no documento.`;
  if (no8) return `Sem a ${ref8}, os pontos de atenção não saem no documento.`;
  if (no10) return `Sem a ${ref10}, o parecer e a assinatura não saem no documento.`;
  return null;
}
