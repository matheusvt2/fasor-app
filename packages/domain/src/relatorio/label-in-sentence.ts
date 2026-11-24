import { seedRule } from '../seed/definitions.ts';
import { inlineLabel } from './screen-label.ts';

/**
 * Fix batch e28w (S3 of the pass of 2026-11-23): a checklist or site item's label as it runs inside a sentence the
 * kernel composes ("Item 18 (sensores de temperatura (PT100) …)", "item 18 (…) em 1 ficha", "… (item 18, NC)"). On a
 * seed that turns `label_acronyms_inline` on (v18) the acronyms of `SCREEN_LABEL_ACRONYMS` keep their screen form
 * (`inlineLabel`); on v1 to v17 the whole label is lowered, as those relatórios always printed it.
 */
export function labelInSentence(label: string, seedVersion: string): string {
  return seedRule(seedVersion, 'label_acronyms_inline') ? inlineLabel(label) : label.toLocaleLowerCase('pt-BR');
}
