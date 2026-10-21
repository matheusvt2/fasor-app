import { normalizeRegistryName } from '../text/normalize-name.ts';
import type { FieldDef } from './schema.ts';

/*
 * Story 14.14 (seed v7): the ONE mapping of a value onto a select field's options, read by every
 * path that brings a value into a select from outside the field itself: a plate reading, a typed
 * suggestion, "Igual à ⟨TAG⟩?" and "Copiar da última visita". A v6 disjuntor's "ÓLEO (PVO)" lands
 * on a v7 disjuntor as "Óleo"; a value no option and no alias names is not carried over.
 */

/** The select's option `value` reads as: the option itself, else the option or alias matched ignoring case and accents, else null. */
export function selectOptionFor(field: Pick<FieldDef, 'options' | 'option_aliases'>, value: unknown): string | null {
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
  return null;
}
