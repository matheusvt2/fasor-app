import type { RecurringFinding, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V2 } from './v2.ts';

/*
 * Seed version 3 (AR-20; Story 6.6): seed v2 as it shipped, plus the recurring-finding
 * chips of the point-of-attention editor ("Textos rápidos", `72-pontos.html`). Each chip
 * inserts its text at the caret as plain text. Derived from v2 rather than retyped, so the
 * two differ only by `recurring_findings` (`seed.test.ts` pins the difference). FROZEN once
 * merged, like v1 and v2.
 */

/** The labels are the story's; the texts are verbatim from the mock's chip row. */
const RECURRING_FINDINGS_V3: RecurringFinding[] = [
  {
    label: 'Ausência de placas de sinalização de segurança',
    text: 'As cabines deverão passar por processo de identificação via plaquetas de segurança: função da cabine, tensão, potência, função dos transformadores etc.',
  },
  {
    label: 'Diagrama unifilar desatualizado',
    text: 'Emoldurar e pendurar nas cabines o diagrama unifilar atualizado (faz parte do PIE).',
  },
  {
    label: 'Chuva e umidade elevada',
    text: 'Ressalta-se que os ensaios foram realizados em condições climáticas de chuva e elevada umidade, fatores que podem influenciar negativamente os resultados.',
  },
  {
    label: 'Ensaios pendentes',
    text: 'Programar os ensaios pendentes na próxima intervenção, com desligamento autorizado pelo cliente.',
  },
];

export const CABINE_PRIMARIA_V3: ReportSeed = {
  ...structuredClone(CABINE_PRIMARIA_V2),
  recurring_findings: RECURRING_FINDINGS_V3,
};
