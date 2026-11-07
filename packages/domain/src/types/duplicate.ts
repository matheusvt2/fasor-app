import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { EquipmentTypeDerivedFrom, EquipmentTypeRow, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { SEEDED_CRITERIA } from '../seed/criteria.ts';
import { getDefinition } from '../seed/definitions.ts';
import { TAG_PREFIX } from '../relatorio/tag.ts';
import { type CompanyCriterion, type CompanyTypeDefinition, type CompanyTypeDraft, type TypeNoun } from './definition.ts';

/*
 * Story 14.6 (Design Notes of `spec-e22t-company-types.md`): "Duplicar". A copy of a seeded type
 * carries everything the seed defines for it that a company type holds: the label (with
 * " (cópia)"), the print title, the nameplate, the checklist with every item applicable (a
 * company type has no subtypes, so no item is pre-marked NA), the tests and measurement tests, the
 * configuration fields; each criterion a test names (`criterion_key`, a measurement criterion's
 * `seeded`) is materialized from `SEEDED_CRITERIA` into the copy's own criteria table, with its
 * source, so the Critérios tab edits the copy's values; the TAG prefix and the noun come from the
 * kernel's tables. The oil rule is not carried: a company definition has none (a narrowing listed
 * in the PR), so a copy's oil items are answered as any other item. A copy of a company type copies
 * its published definition. The copy is a draft: nothing is published until "Publicar".
 */

// authored (Story 14.6, listed for Bruno): the suffix of a copy's name, and each seeded type's noun
// in the singular and the plural with its gender (the singular and the gender are the caption
// words' `CAPTION_EQUIPMENT_WORDS`, a plural noun there made singular).
export const COPY_SUFFIX = ' (cópia)';

const SEEDED_NOUNS: Readonly<Record<EquipmentBlockType, TypeNoun>> = {
  cabos_entrada: { singular: 'cabo de entrada', plural: 'cabos de entrada', gender: 'm' },
  para_raio: { singular: 'para-raio', plural: 'para-raios', gender: 'm' },
  chave_seccionadora: { singular: 'chave seccionadora', plural: 'chaves seccionadoras', gender: 'f' },
  disjuntor_mt: { singular: 'disjuntor de média tensão', plural: 'disjuntores de média tensão', gender: 'm' },
  tp: { singular: 'transformador de potencial', plural: 'transformadores de potencial', gender: 'm' },
  tc: { singular: 'transformador de corrente', plural: 'transformadores de corrente', gender: 'm' },
  cabos_saida: { singular: 'cabo de saída', plural: 'cabos de saída', gender: 'm' },
  transformador_forca: { singular: 'transformador de força', plural: 'transformadores de força', gender: 'm' },
  chave_transferencia_automatica: { singular: 'chave de transferência automática', plural: 'chaves de transferência automática', gender: 'f' },
  quadro_eletrico: { singular: 'quadro elétrico', plural: 'quadros elétricos', gender: 'm' },
  inspecao_qgbt: { singular: 'quadro geral de baixa tensão', plural: 'quadros gerais de baixa tensão', gender: 'm' },
};

/** The noun a copy of a seeded type starts with. */
export function seededTypeNoun(blockType: EquipmentBlockType): TypeNoun {
  return { ...SEEDED_NOUNS[blockType] };
}

/** The TAG prefix a copy of a seeded type starts with. */
export function seededTagPrefix(blockType: EquipmentBlockType): string {
  return TAG_PREFIX[blockType];
}

/** What "Duplicar" gives: the new type's provenance and its first draft. */
export interface TypeDuplicate {
  derived_from: EquipmentTypeDerivedFrom;
  draft: CompanyTypeDefinition;
}

/** A seeded criterion as a row of a company type's criteria table. */
function materialized(key: string): CompanyCriterion {
  const seeded = SEEDED_CRITERIA.find((criterion) => criterion.key === key);
  if (seeded === undefined) throw new Error(`duplicateSeededType: unknown seeded criterion "${key}"`);
  const operator = seeded.operator as CompanyCriterion['operator'];
  return {
    key: seeded.key,
    label: seeded.label,
    operator,
    value: seeded.value,
    unit: seeded.unit,
    type: seeded.type,
    source: { name: seeded.source.name, edition: seeded.source.edition },
  };
}

/** "Duplicar" on a seeded type (library or FO.SERV-03) as its seed version defines it. */
export function duplicateSeededType(seedVersion: string, blockType: EquipmentBlockType): TypeDuplicate {
  const seed = structuredClone(getDefinition(seedVersion, 'cabine_primaria', blockType));
  const keys: string[] = [];
  const named = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };
  for (const test of seed.tests) named(test.criterion_key);
  for (const test of seed.measurement_tests ?? []) {
    for (const criterion of test.criteria) if (criterion.type === 'absolute' && criterion.seeded !== undefined) named(criterion.seeded);
  }
  const draft: CompanyTypeDefinition = {
    label: `${seed.label}${COPY_SUFFIX}`,
    ...(seed.print_title === undefined ? {} : { print_title: seed.print_title }),
    tag_prefix: seededTagPrefix(blockType),
    noun: seededTypeNoun(blockType),
    nameplate: seed.nameplate,
    checklist: seed.checklist,
    tests: seed.tests.map(({ criterion: _criterion, ...test }) => test),
    ...(seed.measurement_tests === undefined ? {} : { measurement_tests: seed.measurement_tests as CompanyTypeDefinition['measurement_tests'] }),
    ...(seed.config_fields === undefined ? {} : { config_fields: seed.config_fields }),
    criteria: keys.map(materialized),
  };
  return { derived_from: { seed_version: seedVersion, block_type: blockType }, draft };
}

/** "Duplicar" on a published version of a company type: its definition, renamed as a copy. */
export function duplicateCompanyType(version: Pick<EquipmentTypeVersionRow, 'type_id' | 'version' | 'definition'>): TypeDuplicate {
  const definition = structuredClone(version.definition);
  return { derived_from: { type_id: version.type_id, version: version.version }, draft: { ...definition, label: `${definition.label}${COPY_SUFFIX}` } };
}

/** The value of the `equipment_type/{id}` create a duplicate becomes (the id is the caller's, TC-2). */
export function newEquipmentTypeRow(id: string, duplicate: TypeDuplicate): EquipmentTypeRow {
  return { id, derived_from: duplicate.derived_from, draft: duplicate.draft as CompanyTypeDraft, retired_at: null, removed_at: null, latest_version: 0 };
}

/** The value of the `equipment_type_version/{id}` create that publishes a type's draft as its next version. */
export function typeVersionRow(input: { id: string; type: Pick<EquipmentTypeRow, 'id' | 'latest_version'>; definition: CompanyTypeDefinition; publishedBy: string; publishedAt: string }): EquipmentTypeVersionRow {
  return { id: input.id, type_id: input.type.id, version: input.type.latest_version + 1, definition: input.definition, published_by: input.publishedBy, published_at: input.publishedAt };
}

// --- the type's status words (`41-templates.html` § Tipos de equipamento) --------------------------

/** The Status pill of a type in the list: `rascunho`, `publicado`, `aposentado` (the mock's `data-status`). */
export type TypeStatus = 'rascunho' | 'publicado' | 'aposentado';

/** A type's status: never published, published and live, or retired. */
export function typeStatusOf(type: Pick<EquipmentTypeRow, 'latest_version' | 'retired_at'>): TypeStatus {
  if (type.latest_version === 0) return 'rascunho';
  return type.retired_at === null ? 'publicado' : 'aposentado';
}

/** The pill's words: "Rascunho", "Publicado · versão 2", "Aposentado · versão 1". */
export function typeStatusText(type: Pick<EquipmentTypeRow, 'latest_version' | 'retired_at'>): string {
  const status = typeStatusOf(type);
  // authored (Story 14.6, from the mock `41-templates.html`).
  if (status === 'rascunho') return 'Rascunho';
  return `${status === 'publicado' ? 'Publicado' : 'Aposentado'} · versão ${type.latest_version}`;
}

/** The line under a published type with an open draft: "Rascunho da versão 3 aberto"; null when none is open or the type was never published. */
export function openDraftText(type: Pick<EquipmentTypeRow, 'latest_version' | 'draft'>): string | null {
  if (type.latest_version === 0 || type.draft === null) return null;
  // authored (Story 14.6, from EXPERIENCE.md § Templates).
  return `Rascunho da versão ${type.latest_version + 1} aberto`;
}
