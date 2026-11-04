import type { BlockDefinition, FieldDef, ReportSeed } from './schema.ts';

/*
 * 2026-11-04 (Matheus, for Bruno's field request of the same day): the one amendment to a
 * shipped seed version. AD-21 keeps every shipped version as it shipped, so a relatório
 * created on v1 to v5 (before 2026-10-20) offered only AR and SF6 in the Disjuntor MT's MEIO
 * DE EXTINÇÃO and only EPÓXI and Á SECO in the Transformador de força's TIPO DE ISOLAÇÃO,
 * while Bruno tests oil and vacuum breakers and oil transformers on those relatórios too.
 *
 * Matheus chose to append the missing options to v1 to v5, and nothing else: the lists only
 * grow, at their end, so every stored value stays an option and every document already
 * issued renders as before. The oil rule (seed v6, `relatorio/oil-rule.ts`) stays on v6 and
 * later; on v1 to v5 an oil value is printed as stored and changes no checklist item. The
 * spelling follows those versions' capitals (v6 wrote VÁCUO and ÓLEO the same way). TP, TC
 * and the Chave seccionadora keep their lists: Bruno named the disjuntor and the
 * transformador de força only.
 */

/** What each block type's select field gains on v1 to v5, appended in this order. */
const LEGACY_ADDITIONS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  disjuntor_mt: { meio_de_extincao: ['VÁCUO', 'ÓLEO'] },
  transformador_forca: { tipo_de_isolacao: ['ÓLEO'] },
};

/** The seed versions the amendment applies to: every one shipped before seed v6 carried these options. */
export const LEGACY_OPTION_VERSIONS = ['v1', 'v2', 'v3', 'v4', 'v5'] as const;

function widenField(field: FieldDef, additions: Readonly<Record<string, readonly string[]>>): FieldDef {
  const extra = additions[field.key];
  if (extra === undefined || field.options === undefined) return field;
  return { ...field, options: [...field.options, ...extra.filter((option) => !field.options!.includes(option))] };
}

function widenDefinition(definition: BlockDefinition): BlockDefinition {
  const additions = LEGACY_ADDITIONS[definition.block_type];
  if (additions === undefined) return definition;
  return { ...definition, nameplate: definition.nameplate.map((field) => widenField(field, additions)) };
}

/** A v1 to v5 seed with the 2026-11-04 options appended; every other part is the seed as shipped. */
export function withLegacyOptions(seed: ReportSeed): ReportSeed {
  const blocks = Object.fromEntries(Object.entries(seed.blocks).map(([type, definition]) => [type, widenDefinition(definition)]));
  return { ...seed, blocks: blocks as ReportSeed['blocks'] };
}
