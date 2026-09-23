import type { SectionBlockType } from '../schemas/block-config.ts';
import { DISPLAY_TIME_ZONE } from '../format/datetime.ts';
import { getSeed, SECTION_VARIABLES, sectionText, type SectionVariable } from '../seed/definitions.ts';
import type { TextBlock } from '../seed/schema.ts';
import { sectionNumber } from './compose.ts';

/*
 * Story 3.6: a section block's boilerplate as the Template composer edits it -- plain
 * text (no formatting runs; rich text is FR-12, Epic 11) holding `{name}` variable tokens
 * that resolve per relatório. The seed's text is a list of `TextBlock`s; a template's own
 * override (`TemplateBlock.section_text`) is one string, so the seed's text is flattened
 * the same way the editor shows it.
 */

/** The printed name of each variable, also what an unresolved one prints in brackets. */
export const SECTION_VARIABLE_LABELS: Readonly<Record<SectionVariable, string>> = {
  cliente: 'Cliente',
  obra: 'Obra',
  datas: 'Datas',
  empresa_executora: 'Empresa executora',
  responsavel: 'Responsável',
  escopo: 'Escopo',
};

/**
 * The variables the editor's "Inserir dado do relatório" row offers, in the story's order.
 * `escopo` resolves wherever the seed's text carries it but is not offered for insertion.
 */
export const INSERTABLE_SECTION_VARIABLES: readonly SectionVariable[] = ['cliente', 'obra', 'datas', 'empresa_executora', 'responsavel'];

export function isSectionVariable(name: string): name is SectionVariable {
  return (SECTION_VARIABLES as readonly string[]).includes(name);
}

/**
 * The seed's text blocks as one plain text: a paragraph is set apart by a blank line, a
 * heading starts a new group after a blank line, and consecutive items (a heading's list)
 * sit on their own lines.
 */
export function flattenSectionText(blocks: readonly TextBlock[]): string {
  let out = '';
  blocks.forEach((block, i) => {
    if (i > 0) {
      const previous = blocks[i - 1]!;
      const tight = block.kind === 'item' && previous.kind !== 'paragraph';
      out += tight ? '\n' : '\n\n';
    }
    out += block.text;
  });
  return out;
}

const dateInForce = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The seed's boilerplate of a section block in force at `now` (a São Paulo calendar
 * date), flattened; `null` for a section the seed carries no fixed text for (8 Pontos de
 * atenção and 11 Certificados are filled from the relatório), which the editor then does
 * not offer.
 */
export function defaultSectionText(seedVersion: string, type: SectionBlockType, now: Date): string | null {
  const section = sectionNumber(type);
  const date = dateInForce.format(now);
  const seeded = getSeed(seedVersion, 'cabine_primaria').sections.some(
    (entry) => entry.section === section && entry.effective_from <= date && entry.blocks !== null,
  );
  return seeded ? flattenSectionText(sectionText(seedVersion, section, date)) : null;
}

/** One piece of a section text: literal text or a variable token. */
export type SectionTextToken = { kind: 'text'; text: string } | { kind: 'variable'; name: SectionVariable };

const TOKEN = /\{([a-z_]+)\}/g;

/**
 * A section text cut into literal text and variable tokens, in order, for the editor to
 * draw each variable as one atomic chip. A `{name}` that is not a section variable stays
 * literal text.
 */
export function sectionTextTokens(text: string): SectionTextToken[] {
  const tokens: SectionTextToken[] = [];
  let literal = '';
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const name = match[1]!;
    literal += text.slice(last, match.index);
    last = match.index + match[0].length;
    if (isSectionVariable(name)) {
      if (literal !== '') tokens.push({ kind: 'text', text: literal });
      literal = '';
      tokens.push({ kind: 'variable', name });
    } else {
      literal += match[0];
    }
  }
  literal += text.slice(last);
  if (literal !== '') tokens.push({ kind: 'text', text: literal });
  return tokens;
}

export interface ResolvedSectionText {
  resolved: string;
  /** The variables with no value, once each, in order of first appearance. */
  unresolved: SectionVariable[];
}

/**
 * A section text with every variable replaced by the relatório's value. A variable with
 * no value (missing, empty or blank) prints its label in brackets ("[Responsável]") and
 * is listed in `unresolved`, which the kernel's pre-issue integrity check reads (Epic 4+).
 * Never throws.
 */
export function resolveSectionText(
  text: string,
  relatorioInputs: Partial<Record<SectionVariable, string>>,
): ResolvedSectionText {
  const unresolved: SectionVariable[] = [];
  const resolved = text.replace(TOKEN, (token, name: string) => {
    if (!isSectionVariable(name)) return token;
    const value = relatorioInputs[name];
    if (value !== undefined && value.trim() !== '') return value;
    if (!unresolved.includes(name)) unresolved.push(name);
    return `[${SECTION_VARIABLE_LABELS[name]}]`;
  });
  return { resolved, unresolved };
}
