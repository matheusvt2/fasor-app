/*
 * Story 27.5 (F9 of the 2026-11-21 pass): the order a new relatório's section blocks are created
 * in, once, so the template composer numbers its sections as `instantiate` will place them and the
 * two cannot drift. No import from `templates/`: the composer reads this module, never the reverse.
 */

/** The two sections a template never carries, synthesized at creation (`GENERATED_SECTION_TYPES`). */
export type GeneratedSectionType = 'section_7' | 'section_9';
const GENERATED: readonly GeneratedSectionType[] = ['section_7', 'section_9'];

/** The FO.SERV-03 number of a section block type: `section_10` is 10. */
function formNumber(type: string): number {
  return Number(type.slice('section_'.length));
}

/**
 * Story 20.3: where a section of the given FO.SERV-03 number sits among a new relatório's
 * section blocks: its number, except that section 9 (RELATÓRIOS DOS ENSAIOS) comes before
 * section 8 (PONTOS DE ATENÇÃO).
 */
export function creationPosition(number: number): number {
  return number === 9 ? 8 : number === 8 ? 9 : number;
}

/**
 * The creation sort `instantiate` applies to a template's sections followed by the generated ones:
 * stable by `creationPosition`, so two sections of one type keep the template's order. Returns a new array.
 */
export function sortForCreation<T>(sections: readonly T[], numberOf: (section: T) => number): T[] {
  return [...sections].sort((a, b) => creationPosition(numberOf(a)) - creationPosition(numberOf(b)));
}

/**
 * Story 27.5: the 1-based position each template section (in `types` order) and each generated
 * section takes among a new relatório's section blocks, after `instantiate`'s creation sort: the
 * number its Sumário row and its printed heading will carry.
 */
export function creationSectionNumbers(types: readonly string[]): { numbers: number[]; generated: Record<GeneratedSectionType, number> } {
  type Entry = { number: number; template: number | null; generated: GeneratedSectionType | null };
  const entries: Entry[] = [
    ...types.map((type, index): Entry => ({ number: formNumber(type), template: index, generated: null })),
    ...GENERATED.map((type): Entry => ({ number: formNumber(type), template: null, generated: type })),
  ];
  const numbers: number[] = new Array<number>(types.length).fill(0);
  const generated: Record<GeneratedSectionType, number> = { section_7: 0, section_9: 0 };
  sortForCreation(entries, (entry) => entry.number).forEach((entry, position) => {
    if (entry.template !== null) numbers[entry.template] = position + 1;
    if (entry.generated !== null) generated[entry.generated] = position + 1;
  });
  return { numbers, generated };
}
