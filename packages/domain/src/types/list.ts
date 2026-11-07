import { isCompanyBlockType, type BlockTypeKey, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { EquipmentTypeRow } from '../schemas/entities.ts';
import { equipmentTypesOf, findDefinition, findDefinitionIn, isLibraryType, latestTypeVersion, type DefinitionContext } from '../seed/definitions.ts';
import { TAG_PREFIX } from '../relatorio/tag.ts';
import { LIBRARY_GROUP_LABEL } from '../relatorio/tree.ts';
import { plural } from '../text/plural.ts';
import { companyBlockType } from '../schemas/block-config.ts';
import type { CompanyTypeDraft } from './definition.ts';
import { openDraftText, typeStatusOf, typeStatusText, type TypeStatus } from './duplicate.ts';
import { TYPE_EDITOR_PARTS, validateTypeDraft, type TypeDraftIssue, type TypeEditorPart } from './validate.ts';

/*
 * Story 14.7 (`41-templates.html` § Tipos de equipamento, `43-tipo-equipamento.html`): the derived
 * text of the type list and of the type editor (AGENTS.md: counts, plurals, status words and
 * composed rows live in the kernel). The surfaces render these strings as they are.
 */

const SEP = ' · ';

// authored (Story 14.7, from `41-templates.html`): the two groups' headings.
/** "Da empresa (3)". */
export function companyTypesHeading(n: number): string {
  return `Da empresa (${n})`;
}

/** "Da biblioteca (10) · somente leitura". */
export function libraryTypesHeading(n: number): string {
  return `Da biblioteca (${n}) · somente leitura`;
}

/** The name a type row and the editor's head show: the latest version's label, else the draft's; "Tipo sem nome" while neither has one. */
export function typeNameOf(type: Pick<EquipmentTypeRow, 'id' | 'draft' | 'latest_version'>, ctx: DefinitionContext): string {
  const published = type.latest_version > 0 ? ctx.versions.get(`${type.id}@${type.latest_version}`)?.definition.label : undefined;
  const label = published ?? type.draft?.label;
  // authored (Story 14.7): a draft whose name was cleared.
  return label !== undefined && label.trim() !== '' ? label.trim() : 'Tipo sem nome';
}

/** "duplicado de Chave de transferência automática" (a seeded source), or of the company version it copies; null when the type names none. */
export function derivedFromText(type: Pick<EquipmentTypeRow, 'derived_from'>, ctx: DefinitionContext): string | null {
  const from = type.derived_from;
  if (from === null) return null;
  if ('block_type' in from) {
    const label = findDefinition(from.seed_version, from.block_type)?.label;
    return label === undefined ? null : `duplicado de ${label}`;
  }
  const label = ctx.versions.get(`${from.type_id}@${from.version}`)?.definition.label;
  return label === undefined ? null : `duplicado de ${label}`;
}

/** The TAG prefix a type row shows: the latest version's, else the draft's (null while blank). */
function prefixOf(type: Pick<EquipmentTypeRow, 'id' | 'draft' | 'latest_version'>, ctx: DefinitionContext): string | null {
  const published = type.latest_version > 0 ? ctx.versions.get(`${type.id}@${type.latest_version}`)?.definition.tag_prefix : undefined;
  const prefix = published ?? type.draft?.tag_prefix;
  return prefix !== undefined && prefix.trim() !== '' ? prefix.trim() : null;
}

/** "1 aviso para publicar" / "2 avisos para publicar"; "pronto para publicar" with none. */
export function issuesToPublishText(n: number): string {
  // authored (Story 14.7, from `41-templates.html`).
  return n === 0 ? 'pronto para publicar' : `${plural(n, 'aviso', 'avisos')} para publicar`;
}

/** One company type of the list, as `41-templates.html` draws it. */
export interface CompanyTypeListRow {
  id: string;
  name: string;
  status: TypeStatus;
  /** The Status pill's words ("Publicado · versão 2"). */
  statusText: string;
  /** The `.rr-secondary` line. */
  secondary: string;
  /** "Descartar rascunho" is offered only before the first publish. */
  discardable: boolean;
}

/**
 * The secondary line of a company type: a published one "Rascunho da versão 3 aberto · TAG NB ·
 * duplicado de …", a never-published one "Nunca publicado · 2 avisos para publicar · TAG NB · duplicado
 * de …", a retired one "Fora das paletas · os relatórios e templates que o usam continuam funcionando".
 */
export function companyTypeSecondaryText(type: EquipmentTypeRow, ctx: DefinitionContext): string {
  const status = typeStatusOf(type);
  const prefix = prefixOf(type, ctx);
  const from = derivedFromText(type, ctx);
  // authored (Story 14.7, from `41-templates.html`; the mock's author and date are not carried).
  if (status === 'aposentado') return ['Fora das paletas', 'os relatórios e templates que o usam continuam funcionando', openDraftText(type)].filter((part): part is string => part !== null).join(SEP);
  const parts: (string | null)[] =
    status === 'rascunho'
      ? ['Nunca publicado', issuesToPublishText(validateTypeDraft(type.draft).length)]
      : [openDraftText(type)];
  parts.push(prefix === null ? null : `TAG ${prefix}`, from);
  return parts.filter((part): part is string => part !== null).join(SEP);
}

/** The company types of the list (removed ones left out), by name (pt-BR) then id. */
export function companyTypeListRows(types: readonly EquipmentTypeRow[], ctx: DefinitionContext): CompanyTypeListRow[] {
  return types
    .filter((type) => type.removed_at === null)
    .map((type) => ({
      id: type.id,
      name: typeNameOf(type, ctx),
      status: typeStatusOf(type),
      statusText: typeStatusText(type),
      secondary: companyTypeSecondaryText(type, ctx),
      discardable: type.latest_version === 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One library (seeded) type of the list: read-only, "Duplicar" only. */
export interface LibraryTypeListRow {
  type: EquipmentBlockType;
  name: string;
  secondary: string;
}

/**
 * The seeded types a seed version ships, in palette order, each "Biblioteca · TAG SEC · manual,
 * epóxi ou a seco" (its subtypes, when it has some) or "Biblioteca · TAG CTA · Outros equipamentos"
 * (a library type, Story 14.5).
 */
export function libraryTypeListRows(seedVersion: string): LibraryTypeListRow[] {
  return equipmentTypesOf(seedVersion).map((type) => {
    const definition = findDefinition(seedVersion, type);
    const subtypes = (definition?.subtypes ?? []).map((subtype) => subtype.label.toLowerCase());
    const variants = subtypes.length === 0 ? null : subtypes.length === 1 ? subtypes[0]! : `${subtypes.slice(0, -1).join(', ')} ou ${subtypes.at(-1)!}`;
    // authored (Story 14.7, from `41-templates.html`).
    const parts = ['Biblioteca', `TAG ${TAG_PREFIX[type]}`, isLibraryType(seedVersion, type) ? LIBRARY_GROUP_LABEL : variants];
    return { type, name: definition?.label ?? type, secondary: parts.filter((part): part is string => part !== null).join(SEP) };
  });
}

// --- the type editor (`43-tipo-equipamento.html`) ----------------------------------------------------

/** How many entries a tab lists: placa fields, verificação items, ensaios, critérios; null for Identificação. */
function partCount(draft: CompanyTypeDraft | null, part: TypeEditorPart): number | null {
  if (draft === null) return part === 'identificacao' ? null : 0;
  switch (part) {
    case 'placa':
      return (draft.nameplate ?? []).length;
    case 'verificacoes':
      return (draft.checklist ?? []).length;
    case 'ensaios':
      return (draft.tests ?? []).length + (draft.measurement_tests ?? []).length;
    case 'criterios':
      return (draft.criteria ?? []).length;
    default:
      return null;
  }
}

// authored (Story 14.7): the editor's tab words (the same as the issue summaries').
const TAB_WORD: Readonly<Record<TypeEditorPart, string>> = {
  identificacao: 'Identificação',
  placa: 'Placa',
  verificacoes: 'Verificações',
  ensaios: 'Ensaios',
  criterios: 'Critérios',
};

/** A tab's label with its count and its issues: "Placa (8)", "Critérios (4) · 1 aviso", "Identificação · 2 avisos". */
export function typeEditorTabLabel(draft: CompanyTypeDraft | null, part: TypeEditorPart, issues: readonly TypeDraftIssue[]): string {
  const count = partCount(draft, part);
  const issueCount = issues.filter((issue) => issue.part === part).length;
  const base = count === null ? TAB_WORD[part] : `${TAB_WORD[part]} (${count})`;
  return issueCount === 0 ? base : `${base}${SEP}${plural(issueCount, 'aviso', 'avisos')}`;
}

/** The editor's tabs in their order, with their labels. */
export function typeEditorTabs(draft: CompanyTypeDraft | null, issues: readonly TypeDraftIssue[]): { part: TypeEditorPart; label: string; issues: number }[] {
  return TYPE_EDITOR_PARTS.map((part) => ({ part, label: typeEditorTabLabel(draft, part, issues), issues: issues.filter((issue) => issue.part === part).length }));
}

/**
 * The head's line: "Editando o rascunho da versão 3 · duplicado de Chave de transferência automática
 * (biblioteca)"; a published type with no draft open "Versão 2 publicada, sem rascunho aberto"; a
 * retired type starts with "Aposentado".
 */
export function typeEditorMetaText(type: EquipmentTypeRow, ctx: DefinitionContext): string {
  const from = type.derived_from;
  let source = derivedFromText(type, ctx);
  if (source !== null && from !== null && 'block_type' in from) source = `${source} (biblioteca)`;
  // authored (Story 14.7, from `43-tipo-equipamento.html`; the save time and the use count are not carried).
  const head =
    type.draft === null
      ? `Versão ${type.latest_version} publicada, sem rascunho aberto`
      : type.latest_version === 0
        ? 'Editando o rascunho da versão 1'
        : `Editando o rascunho da versão ${type.latest_version + 1}`;
  return [head, source].filter((part): part is string => part !== null).join(SEP);
}

/** "Publicar versão 3": the version the draft would become. */
export function publishVersionLabel(type: Pick<EquipmentTypeRow, 'latest_version'>): string {
  // authored (Story 14.7, from `43-tipo-equipamento.html`).
  return `Publicar versão ${type.latest_version + 1}`;
}

/** The toast of a publish: "Versão 3 publicada · relatórios criados a partir de agora usam a versão 3". */
export function publishedText(version: number): string {
  // authored (Story 14.7, from `43-tipo-equipamento.html`).
  return `Versão ${version} publicada · relatórios criados a partir de agora usam a versão ${version}`;
}

/** The toast of a duplicate: "Rascunho criado: Chave seccionadora (cópia)". */
export function typeDuplicatedText(name: string): string {
  // authored (Story 14.7, from `41-templates.html`).
  return `Rascunho criado: ${name}`;
}

/** The Aposentar Confirm's title: "Aposentar No-break de comando?". */
export function retireTypeTitle(name: string): string {
  // authored (Story 14.7, from `41-templates.html`).
  return `Aposentar ${name}?`;
}

/** The Aposentar Confirm's body; it says the open draft is kept when one is ("O rascunho da versão 3 fica guardado."). */
export function retireTypeBody(type: Pick<EquipmentTypeRow, 'latest_version' | 'draft'>): string {
  // authored (Story 14.7, from `41-templates.html`; the mock's counts of relatórios and templates are not carried).
  const base = 'O tipo sai das paletas do template e da ficha. Os relatórios e templates que já o usam continuam funcionando e imprimindo como estão.';
  return type.draft === null || type.latest_version === 0 ? base : `${base} O rascunho da versão ${type.latest_version + 1} fica guardado.`;
}

/** "TAG sugerida: NB-01, NB-02… · letras maiúsculas e números, até 6" (the prefix as typed; the rule alone while blank). */
export function suggestedTagHelperText(prefix: string | undefined): string {
  // authored (Story 14.7, from `43-tipo-equipamento.html`).
  const rule = 'letras maiúsculas e números, até 6';
  const p = (prefix ?? '').trim();
  return p === '' ? rule : `TAG sugerida: ${p}-01, ${p}-02…${SEP}${rule}`;
}

// --- the composer and the palettes beside a company type (Story 14.8) ---------------------------

/**
 * AD-21 item 5: what the Template composer says of a company type a template places: the version it
 * records, the newer published one when there is one ("versão 1 · versão 2 publicada"), and
 * "Aposentado" when the type is retired. Null for a seeded type.
 */
export function templateTypeVersionText(ctx: DefinitionContext, blockType: BlockTypeKey, recorded: number | undefined): string | null {
  if (!isCompanyBlockType(blockType)) return null;
  const typeId = blockType.slice('type:'.length);
  const latest = latestTypeVersion(ctx, typeId);
  const retired = (ctx.types.get(typeId)?.retired_at ?? null) !== null;
  // authored (Story 14.8).
  const parts: string[] = [];
  if (recorded !== undefined) parts.push(`versão ${recorded}`);
  if (latest !== null && recorded !== undefined && latest > recorded) parts.push(`versão ${latest} publicada`);
  if (retired) parts.push('Aposentado');
  return parts.length === 0 ? null : parts.join(SEP);
}

/** A company type's noun of the version given (else its latest): what the composed texts and the quantity labels agree with. */
export function companyTypeNoun(ctx: DefinitionContext, blockType: string, typeVersion?: number): { singular: string; plural: string; gender: 'm' | 'f' } | null {
  if (!isCompanyBlockType(blockType)) return null;
  const version = typeVersion ?? latestTypeVersion(ctx, blockType.slice('type:'.length)) ?? undefined;
  return findDefinitionIn(ctx, '', blockType, version)?.noun ?? null;
}

/** The company block types a context can name (published), for a caller that lists them beside the seeded ones. */
export function companyTypeKeys(ctx: DefinitionContext): BlockTypeKey[] {
  const ids = new Set<string>();
  for (const row of ctx.versions.values()) ids.add(row.type_id);
  return [...ids].sort().map((id) => companyBlockType(id));
}
