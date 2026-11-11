import type { BlockTypeKey } from '../schemas/block-config.ts';
import type { DefinitionContext } from '../seed/definitions.ts';
import { blockTypeLabelIn, hidingCopies } from '../relatorio/tree.ts';
import { hiddenTypeText } from './list.ts';

/*
 * Fix batch e24x (C3 and Matheus's decision 17 of 2026-11-11): what both palettes say beside a
 * type, composed once here (AD-1/AD-13) instead of in each surface.
 */

const SEP = ' · ';

/** Story 24.19 (`40-relatorio-overview.html` `#lo-type-tr`): the mark a company type's palette row starts with, wherever it stands. */
export const COMPANY_TYPE_PALETTE_MARK = 'Tipo da empresa';

/**
 * C3: a palette row's `.pi-meta` line from its parts in order (the composer's summary and version
 * text, the field palette's summary and TAG), a blank or missing part left out: a company type's
 * line starts with "Tipo da empresa" and is that alone with no part; any other type's is its parts
 * joined, or no line with none. Never a doubled " ·  · ".
 */
export function paletteMetaText(company: boolean, parts: readonly (string | null | undefined)[]): string | null {
  const kept = parts.filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  if (company) return [COMPANY_TYPE_PALETTE_MARK, ...kept].join(SEP);
  return kept.length === 0 ? null : kept.join(SEP);
}

/** Decision 17: a seeded type the composer keeps for its defaults although a published copy hides it. */
export interface ComposerHiddenType {
  /** The hidden seeded type. */
  type: BlockTypeKey;
  /** The last of its copies in the palette: its row is drawn right after it. */
  after: BlockTypeKey;
  /** The type list's line naming its copies ("Oculto nas paletas: a cópia … está publicada."). */
  text: string;
}

/**
 * Decision 17 (the spec's Design Notes D4): the seeded types a published company copy hides
 * (`hidingCopies`) that the template still places (`placed`). The composer draws each right after
 * its copies with "Editar padrões" and a disabled stepper, so a template keeps a way to its
 * defaults; nothing new of it can be placed (Story 24.19 holds). None once the template no longer
 * places it or its copies are retired.
 */
export function composerHiddenTypes(ctx: DefinitionContext, seedVersion: string, placed: ReadonlySet<string>): ComposerHiddenType[] {
  const out: ComposerHiddenType[] = [];
  for (const [type, copies] of hidingCopies(ctx, seedVersion)) {
    const last = copies.at(-1);
    if (!placed.has(type) || last === undefined) continue;
    const text = hiddenTypeText(copies.map((copy) => blockTypeLabelIn(ctx, seedVersion, copy)));
    if (text !== null) out.push({ type, after: last, text });
  }
  return out;
}
