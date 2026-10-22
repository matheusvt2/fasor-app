import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { listPtBr } from '../text/plural.ts';
import { isRelatorioSectionType, relatorioSectionNumber } from './instantiate.ts';
import { printsSeedSections, sectionBlocks, seedSectionNumbers, SUMARIO_TITLES } from './sumario.ts';

/*
 * UX pass 2026-10-22 (F43/F17): the one answer to "which number does the relatório give
 * FO.SERV-03 section N". A template may leave sections out (a compact one carries 1, 5, 7,
 * 8, 9 and 10), and the Sumário and the printed document number the sections it carries by
 * position (1-6); every caption, note, toast and composed sentence that names a section
 * speaks that position, never the FO.SERV-03 number. The composer's canonical `section_N`
 * keys (`templates/text.ts`) stay as they are: only what a person reads changes.
 */

type SectionsInput = Pick<RelatorioSnapshot, 'blocks' | 'relatorio'>;

/**
 * The Sumário position of FO.SERV-03 section `section` (the number the Sumário row and the
 * printed heading carry), or null when the relatório does not carry that section. A
 * relatório with no live section block prints the seed's sections, numbered in their order
 * (`printsSeedSections`), as the Sumário's virtual rows are.
 */
export function sectionPosition(snapshot: SectionsInput, section: number): number | null {
  if (printsSeedSections(snapshot.blocks)) {
    const at = seedSectionNumbers(snapshot.relatorio.seed_version).indexOf(section);
    return at === -1 ? null : at + 1;
  }
  const at = sectionBlocks(snapshot.blocks).findIndex((block) => relatorioSectionNumber(block.block_type) === section);
  return at === -1 ? null : at + 1;
}

/** The Sumário title of FO.SERV-03 section `section` ("Certificados"). */
function sectionTitle(section: number): string {
  const type = `section_${section}`;
  return isRelatorioSectionType(type) ? SUMARIO_TITLES[type] : type;
}

/**
 * How a sentence names section `section`: "seção 6" by its Sumário position; a section the
 * relatório does not carry by its Sumário title, with no number: 'seção "Certificados"'.
 * `capitalized` starts it with "Seção" (a caption, the start of a sentence).
 */
export function sectionRefText(snapshot: SectionsInput, section: number, capitalized = false): string {
  const word = capitalized ? 'Seção' : 'seção';
  const position = sectionPosition(snapshot, section);
  // authored: UX pass 2026-10-22 (F43), an absent section named by its Sumário title.
  return position === null ? `${word} "${sectionTitle(section)}"` : `${word} ${position}`;
}

/**
 * A wizard step's caption naming the sections it fills: "Seção 1", "Seções 1 e 3", by their
 * Sumário positions, ascending; the sections the relatório does not carry are left out, and
 * when it carries none of them the caption names the first by its title ('Seção "Certificados"').
 */
export function sectionsCaption(snapshot: SectionsInput, sections: readonly number[]): string {
  const positions = sections
    .map((section) => sectionPosition(snapshot, section))
    .filter((position): position is number => position !== null)
    .sort((a, b) => a - b);
  if (positions.length === 0) return sectionRefText(snapshot, sections[0] ?? 0, true);
  return `${positions.length === 1 ? 'Seção' : 'Seções'} ${listPtBr(positions.map(String))}`;
}

/** A sentence's view of section N: how to name it, whether the relatório prints it, and the absent wording. */
export interface SectionMention {
  /** `sectionRefText`: "seção 4", or 'seção "Pontos de atenção"' when absent. */
  ref: string;
  /** The relatório carries (and so prints) the section. */
  prints: boolean;
  /** The wording of `print/absent-sections.ts` for it: 'não sai no documento: o relatório não tem a seção "Pontos de atenção"'. */
  absent: string;
}

/**
 * UX pass 2026-10-22 (F43, coordinator review): what a sentence that promises printing into
 * section `section` needs. With `prints` false the surface says it does not print (`absent`)
 * instead of sending the reader to a section the relatório does not carry.
 */
export function sectionMention(snapshot: SectionsInput, section: number): SectionMention {
  const ref = sectionRefText(snapshot, section);
  // authored: p020 P-1b's absent wording (`print/absent-sections.ts`).
  return { ref, prints: sectionPosition(snapshot, section) !== null, absent: `não sai no documento: o relatório não tem a ${ref}` };
}
