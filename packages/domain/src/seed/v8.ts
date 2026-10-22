import type { ReportSeed, SectionEntry, TextBlock } from './schema.ts';
import { CABINE_PRIMARIA_V7 } from './v7.ts';

/*
 * Seed version 8 (UX pass 2026-10-22, F43, Matheus's decision SEED_V8_VARIABLES; contract 24):
 * seed v7 plus a Conclusão (section 10) text that names the sections holding the results by
 * one variable instead of FO.SERV-03's fixed "nos itens 8 e 9": `{itens_resultados}` resolves
 * (`relatorio/section-variables.ts`) to "nos itens 4 e 5" by the Sumário positions of Pontos de
 * atenção and Relatórios dos ensaios, "no item 5" when the relatório carries one of them, "no
 * corpo" when it carries neither. Every other word, text, block and rule is v7's. Derived from
 * v7 rather than retyped, so the two differ only by this (`seed.test.ts` pins the difference).
 * Relatórios on v1 to v7 keep their text.
 */

const v7 = CABINE_PRIMARIA_V7;

/** FO.SERV-03's fixed reference, as seeded in v1 to v7. */
const FIXED_REFERENCE = 'nos itens 8 e 9';
/** The same reference by the sections' Sumário positions. */
const VARIABLE_REFERENCE = '{itens_resultados}';

function section10V8(entry: SectionEntry): SectionEntry {
  if (entry.section !== 10 || entry.blocks === null) return entry;
  const blocks = entry.blocks.map((block): TextBlock => ({ ...block, text: block.text.replaceAll(FIXED_REFERENCE, VARIABLE_REFERENCE) }));
  return { ...entry, blocks };
}

function cabinePrimariaV8(): ReportSeed {
  const seed = structuredClone(v7);
  return { ...seed, sections: seed.sections.map(section10V8) };
}

export const CABINE_PRIMARIA_V8: ReportSeed = cabinePrimariaV8();
