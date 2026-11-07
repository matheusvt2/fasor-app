import { ACCURACY_CLASS_FIELD, parseAccuracyClass } from '../relatorio/accuracy-class.ts';
import { isVectorGroupOptions, parseVectorGroup } from '../relatorio/vector-group.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import type { FieldDef } from './schema.ts';

/*
 * Story 14.14 (seed v7): the ONE mapping of a value onto a select field's options, read by every
 * path that brings a value into a select from outside the field itself: a plate reading, a typed
 * suggestion, "Igual à ⟨TAG⟩?" and "Copiar da última visita". A v6 disjuntor's "ÓLEO (PVO)" lands
 * on a v7 disjuntor as "Óleo"; a value no option and no alias names is not carried over.
 *
 * Story 21.1 (seed v11): a select whose options are the vector-group codes (the transformer's
 * LIGAÇÃO SECUNDÁRIA) reads its value through `parseVectorGroup`, so a v10 "DYN1" or "Y/yn0"
 * lands on a v11 select as "Dyn1" or "Yyn0".
 *
 * Story 22.9 (seed v12): a select whose options are accuracy classes (the TC's and TP's EXATIDÃO)
 * reads its value through `parseAccuracyClass`, so a v11 text "0,6C25" or "0.6" lands as "0,6".
 * e22g (review S6): the rule is keyed on the field (`ACCURACY_CLASS_FIELD`), never on the shape of
 * its options, so a select whose options happen to be bare numbers (an office's "NÚMERO DE FASES"
 * with 1, 2 and 3, wave C) never reads "3F" as "3" through the class parser.
 */

/** The select's option `value` reads as: the option itself, else the option or alias matched ignoring case and accents, else null. */
export function selectOptionFor(field: Pick<FieldDef, 'options' | 'option_aliases'> & { key?: string }, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const options = field.options ?? [];
  if (options.includes(value)) return value;
  const wanted = normalizeRegistryName(value);
  if (wanted === '') return null;
  const option = options.find((candidate) => normalizeRegistryName(candidate) === wanted);
  if (option !== undefined) return option;
  for (const [alias, target] of Object.entries(field.option_aliases ?? {})) {
    if (normalizeRegistryName(alias) === wanted && options.includes(target)) return target;
  }
  if (isVectorGroupOptions(options)) {
    const group = parseVectorGroup(value);
    if (group !== null && options.includes(group.code)) return group.code;
  }
  if (field.key === ACCURACY_CLASS_FIELD) {
    const cls = parseAccuracyClass(value);
    if (cls !== null && options.includes(cls)) return cls;
  }
  return null;
}
