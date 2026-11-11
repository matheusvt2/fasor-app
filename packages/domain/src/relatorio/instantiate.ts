import type { NewId } from '../ids.ts';
import type { OpDraft } from '../ops/op.ts';
import { initialOrderKey } from '../ops/order-key.ts';
import { companyTypeIdOf, isCompanyBlockType, isEquipmentKind, isSectionBlockType, typeVersionOf, type CompanyBlockType, type TemplateBlock } from '../schemas/block-config.ts';
import { findDefinitionIn, latestTypeVersion, type DefinitionContext } from '../seed/definitions.ts';
import { defaultBlockConfigIn, lockedSubBlocksOf } from '../seed/template.ts';
import {
  emptySheet,
  type BlockRow,
  type EquipmentRow,
  type JsonValue,
  type LocationRow,
  type ProjectRow,
  type RelatorioRow,
  type TemplateRow,
} from '../schemas/entities.ts';
import { canonicalSkeleton, sectionNumber, withoutOrphans } from '../templates/compose.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { legacySuggestTag, normalizeTag, suggestTag, type TagEquipment } from './tag.ts';

/*
 * Story 4.1 (FR-13, AR-5): a relatório is born as ONE client batch — the `relatorio`
 * create plus every `location`, `block` and `equipment` create the template's skeleton
 * and blocks produce. Everything is copied, nothing is referenced: a template edited
 * afterwards (D-4 bumps its `version`) never touches a relatório made from it, and the
 * server copies nothing. Ids come from the caller's `newId` in a fixed order (TC-2), so
 * two runs over the same sequence build the same drafts. The responsável técnico is
 * written in the same batch (Epic 4 QA Q2), so nothing looks filled without an op.
 *
 * Equipment (Epic 4 QA Q4, 2026-09-24, AD-24/AD-25, glossary "TAG is the equipment's
 * stable identity, unique within the Project"): a later relatório of the same obra reuses
 * the project's live equipment instead of minting rows. Each position gets the base TAG it
 * would get with no prior equipment (`suggestTag` over only the TAGs this run has already
 * produced or bound); a live prior row with that TAG and the same type, not yet bound in
 * this run, gives the block its `equipment_id` and no `equipment` create is emitted.
 * Otherwise the equipment is created as before, its TAG free among the prior rows and this
 * run's. Removed rows are never reused and never count as taken.
 * Story 24.21 (batch e24b): the base TAG became the placement's reuse key, stored on the row it
 * creates and matched before the TAG, so a renamed equipment is still found; see the run below.
 *
 * Section blocks (Story 4.3): the template's section blocks plus the two the template
 * never carries, 7 (photos) and 9 (equipment sheets), which the renderer generates; all
 * eleven are `block` rows with no location and no equipment, so the Sumário reorders them
 * through the same `block/{id}/order_key` op as anything else.
 */

/** The section block types a relatório holds: the template's nine plus the two generated ones. */
export const RELATORIO_SECTION_TYPES = [
  'section_1',
  'section_2',
  'section_3',
  'section_4',
  'section_5',
  'section_6',
  'section_7',
  'section_8',
  'section_9',
  'section_10',
  'section_11',
] as const;
export type RelatorioSectionType = (typeof RELATORIO_SECTION_TYPES)[number];

/** The two sections a template never carries, synthesized at creation. */
export const GENERATED_SECTION_TYPES: readonly RelatorioSectionType[] = ['section_7', 'section_9'];

export function isRelatorioSectionType(value: string): value is RelatorioSectionType {
  return (RELATORIO_SECTION_TYPES as readonly string[]).includes(value);
}

/** The FO.SERV-03 number of any relatório section block type. */
export function relatorioSectionNumber(type: string): number | null {
  return isRelatorioSectionType(type) ? Number(type.slice('section_'.length)) : null;
}

/**
 * Story 20.3: where a section of the given FO.SERV-03 number sits among a new relatório's
 * section blocks: its number, except that section 9 (RELATÓRIOS DOS ENSAIOS) comes before
 * section 8 (PONTOS DE ATENÇÃO).
 */
function creationPosition(number: number): number {
  return number === 9 ? 8 : number === 8 ? 9 : number;
}

/** What the creation reads of the project's equipment: enough to bind a block to a live row and keep new TAGs unique. */
export type PriorEquipment = Pick<EquipmentRow, 'id' | 'tag' | 'type' | 'removed_at' | 'reuse_key'>;

/**
 * Story 24.8: the TAG rule a run names its created equipment with. `current` (the default) is
 * Story 24.8's `PREFIX-NN` with the placement's `reuse_key` stored (Story 24.21); `legacy` is the
 * frozen rule before it with no key written, for the fixtures and goldens, so their drafts stay
 * byte-equal to the ones they were built with.
 */
export type TagRule = 'current' | 'legacy';

export interface InstantiateInputs {
  service_start: string | null;
  service_end: string | null;
  /**
   * The project's equipment as this device holds it, removed rows included: a live row
   * whose base TAG and type match a position is reused (Q4), and new TAGs stay unique
   * among the live ones.
   */
  existingEquipment: readonly PriorEquipment[];
  /** The responsável técnico of the new relatório (Q2): the signed-in user when they carry a registration, else null. */
  responsible_user_id: string | null;
  /**
   * Story 14.6 (AD-21 item 5): the company's published type versions (and type rows), through
   * which each company block of the template takes its type's latest version, a retired type's
   * included. e22h B1: required; a caller with no company type passes `EMPTY_DEFINITION_CONTEXT`.
   */
  definitions: DefinitionContext;
  /** Story 24.8: the TAG rule of the created equipment (`TagRule`); `current` when absent. */
  tagRule?: TagRule;
}

export interface InstantiateDeps {
  newId: NewId;
  actorId: string;
  companyId: string;
}

/**
 * e22h N4: a company type the template places that the relatório is born without, because no
 * published version of it resolves on the device (its company stream has not brought one yet).
 */
export interface OmittedPlacement {
  blockType: CompanyBlockType;
  /** The type's name as the device last knew it (`companyTypeNameIn`), null when it knows none. */
  label: string | null;
  /** How many blocks of it the template places, over every node. */
  quantity: number;
}

export interface Instantiated {
  relatorioId: string;
  drafts: OpDraft[];
  /** e22h N4: the company placements left out, one entry per type in template order; empty when none. */
  omitted: OmittedPlacement[];
}

/**
 * Story 14.6 (AD-21 item 5): the config a relatório block of a company type is born with: the
 * type's latest published version in the context (a retired type's included), else the version
 * the template records; its definition's sub-blocks, each keeping the template's switch where the
 * template holds one and the test is not locked, and the template's NA defaults and options that
 * the version still has. Null when no version of the type resolves (the block is left out: the
 * fold would refuse it).
 */
function companyBlockConfigOf(block: TemplateBlock, seedVersion: string, ctx: DefinitionContext): JsonValue | null {
  const typeId = companyTypeIdOf(block.block_type);
  if (typeId === null) return null;
  // e22h S2: the config names the version row it resolves (`defaultBlockConfigIn` writes its id).
  const version = latestTypeVersion(ctx, typeId) ?? typeVersionOf(block);
  const definition = findDefinitionIn(ctx, seedVersion, block.block_type, version);
  if (definition === null) return null;
  const config = defaultBlockConfigIn(ctx, seedVersion, block.block_type, version);
  const locked = lockedSubBlocksOf(definition);
  for (const [key, entry] of Object.entries(block.sub_blocks)) {
    if (config.sub_blocks[key] !== undefined && !locked.includes(key)) config.sub_blocks[key] = structuredClone(entry);
  }
  const items = new Set<string>((definition.checklist ?? []).map((item) => item.key));
  const fields = new Map((definition.config_fields ?? []).map((field) => [field.key, field]));
  const options = Object.fromEntries(Object.entries(block.options ?? {}).filter(([key, value]) => fields.get(key)?.options.some((option) => option.key === value) === true));
  return {
    ...config,
    na_defaults: block.na_defaults.filter((key) => items.has(key)),
    ...(Object.keys(options).length === 0 ? {} : { options }),
  } as JsonValue;
}

/** The `BlockConfig` a relatório block copies from a template block (AD-21), plus the section's own text. */
export function blockConfigOf(block: TemplateBlock): JsonValue {
  return {
    block_type: block.block_type,
    ...(block.subtype === undefined ? {} : { subtype: block.subtype }),
    ...(block.role === undefined ? {} : { role: block.role }),
    sub_blocks: structuredClone(block.sub_blocks),
    na_defaults: [...block.na_defaults],
    // Story 14.5: the block's own configuration, when the template holds one.
    ...(block.options === undefined ? {} : { options: { ...block.options } }),
    ...(isSectionBlockType(block.block_type) ? { section_text: block.section_text } : {}),
  } as JsonValue;
}

function blockRow(id: string, relatorioId: string, seedVersion: string, fields: Pick<BlockRow, 'location_id' | 'equipment_id' | 'block_type' | 'config' | 'order_key'>): BlockRow {
  return {
    id,
    relatorio_id: relatorioId,
    ...fields,
    seed_version: seedVersion,
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: emptySheet(),
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

/**
 * The drafts of one relatório created from `template` in `project`: the `relatorio`
 * create, one `location` per skeleton node (Story 14.2: each cabine, the colunas directly
 * under it, then each of its painéis with its colunas; `order_key` per sibling, the cabine
 * carrying its `funcao` when the template sets one), the section blocks in FO.SERV-03 number order (the template's, plus 7 and 9
 * synthesized with `section_text: null`), then per template block in skeleton order its
 * `block` create in its column: bound to the project's live equipment of the same base TAG
 * and type when one is free, else preceded by one `equipment` create (project scope, tag
 * from `suggestTag` over the project's equipment and the ones born before it). An orphan
 * template block (a node the skeleton lacks) is skipped, as every other reader skips it.
 */
export function instantiateTemplate(
  template: TemplateRow,
  project: Pick<ProjectRow, 'id'>,
  inputs: InstantiateInputs,
  deps: InstantiateDeps,
): Instantiated {
  const relatorioId = deps.newId();
  const seedVersion = template.seed_version;
  const relatorioScope = {
    scope: 'relatorio' as const,
    company_id: deps.companyId,
    project_id: null,
    relatorio_id: relatorioId,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: deps.actorId,
  };
  const projectScope = { ...relatorioScope, scope: 'project' as const, project_id: project.id, relatorio_id: null };
  const drafts: OpDraft[] = [];

  const relatorio: RelatorioRow = {
    id: relatorioId,
    project_id: project.id,
    template_id: template.id,
    template_version: template.version,
    seed_version: seedVersion,
    status: 'rascunho',
    setup: {
      service_start: inputs.service_start,
      service_end: inputs.service_end,
      atividade: null,
      local: null,
      responsible_user_id: inputs.responsible_user_id,
      cover_photo_file_id: null,
      escopo: null,
      exclusions: null,
      additional_info: null,
      art_trt_number: null,
      instrument_ids: [],
      site_altitude_m: null,
      site_altitude_na: false,
      site_altitude_confirmed: false,
      next_intervention_date: null,
      next_intervention_justification: null,
      parecer: null,
    },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  };
  drafts.push({ ...relatorioScope, kind: 'create', path: `relatorio/${relatorioId}`, value: relatorio as unknown as JsonValue });

  // Locations: every node gets its id first (a coluna names its cabine's id), in canonical order.
  const nodes = canonicalSkeleton(template.skeleton);
  const locationIdOf = new Map<string, string>();
  for (const node of nodes) locationIdOf.set(node.ref, deps.newId());
  const siblingCount = new Map<string | null, number>();
  for (const node of nodes) {
    const n = siblingCount.get(node.parent_ref) ?? 0;
    siblingCount.set(node.parent_ref, n + 1);
    const id = locationIdOf.get(node.ref)!;
    const base = { id, relatorio_id: relatorioId, parent_id: node.parent_ref === null ? null : locationIdOf.get(node.parent_ref)!, name: node.name, order_key: initialOrderKey(n), removed_at: null };
    // A cabine with no Função keeps the row shape from before the field existed (Story 14.2).
    const funcao = node.kind === 'cabine' ? (node.funcao ?? null) : null;
    const row: LocationRow =
      node.kind === 'coluna'
        ? { ...base, kind: 'coluna' }
        : node.kind === 'painel'
          ? { ...base, parent_id: base.parent_id!, kind: 'painel' }
          : {
              ...base,
              kind: 'cabine',
              se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
              env: { altitude_m: null, temperature_c: null, humidity_pct: null },
              agrupar_por_tipo: node.agrupar_por_tipo,
              ...(funcao === null ? {} : { funcao }),
            };
    drafts.push({ ...relatorioScope, kind: 'create', path: `location/${id}`, value: row as unknown as JsonValue });
  }

  // Section blocks, in FO.SERV-03 number order but for one swap (Story 20.3, FR-17): the
  // tests section (section_9) is created before the points section (section_8), so a new
  // relatório prints RELATÓRIOS DOS ENSAIOS at position 8 and PONTOS DE ATENÇÃO at 9. Only
  // the creation order changes: a stored relatório keeps its blocks' order, and one with no
  // section blocks keeps the FO.SERV-03 fallback (`seedSectionNumbers`). 7 and 9 are synthesized.
  const liveBlocks = withoutOrphans(template);
  const sections: { number: number; config: JsonValue; type: string }[] = liveBlocks
    .filter((block) => isSectionBlockType(block.block_type))
    .map((block) => ({ number: sectionNumber(block.block_type as never), config: blockConfigOf(block), type: block.block_type }));
  for (const type of GENERATED_SECTION_TYPES) {
    sections.push({ number: relatorioSectionNumber(type)!, type, config: { block_type: type, sub_blocks: {}, na_defaults: [], section_text: null } });
  }
  sections.sort((a, b) => creationPosition(a.number) - creationPosition(b.number));
  sections.forEach((section, n) => {
    const id = deps.newId();
    const row = blockRow(id, relatorioId, seedVersion, {
      location_id: null,
      equipment_id: null,
      block_type: section.type,
      config: section.config,
      order_key: initialOrderKey(n),
    });
    drafts.push({ ...relatorioScope, kind: 'create', path: `block/${id}`, value: row as unknown as JsonValue });
  });

  // Equipment and its blocks, per node in skeleton order, per template block on that node.
  // Story 24.21: each placement's key is the frozen rule's TAG over the keys this run has
  // already bound or created (`runKeys`), so a template gives the same keys in every relatório
  // of the obra whatever the TAGs became. It binds a live row of the type, not yet bound, whose
  // stored key equals it (step 2), else one with no stored key whose TAG equals it (step 3, the
  // match before the story); the smallest id wins a tie. With none it creates the row with the
  // key stored and Story 24.8's TAG, free among the obra's live TAGs and this run's (`taken`).
  // Under `tagRule: 'legacy'` the created row carries no key and the frozen rule's TAG, and the
  // run's keys are the bound and created TAGs: the drafts of the rule before, byte for byte.
  const legacy = inputs.tagRule === 'legacy';
  const prior = inputs.existingEquipment.filter((row) => row.removed_at === null).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const bound = new Set<string>();
  const runKeys: TagEquipment[] = [];
  const taken: TagEquipment[] = [...inputs.existingEquipment];
  const blockCount = new Map<string, number>();
  const omitted: OmittedPlacement[] = [];
  for (const node of nodes) {
    // A painel takes no block: `withoutOrphans` already dropped any block naming one.
    if (node.kind === 'painel') continue;
    const locationId = locationIdOf.get(node.ref)!;
    const location = { kind: node.kind, name: node.name };
    for (const block of liveBlocks) {
      if (!isEquipmentKind(block.block_type) || block.skeleton_location_ref !== node.ref) continue;
      // Story 14.6: a company block takes its type's latest version; one no version resolves is left out.
      const company = isCompanyBlockType(block.block_type);
      const config = company ? companyBlockConfigOf(block, seedVersion, inputs.definitions) : blockConfigOf(block);
      if (config === null) {
        // e22h N4: said, never silent: "Novo relatório" names what the relatório is born without.
        if (company) omitPlacement(omitted, block.block_type as CompanyBlockType, block.quantity, inputs.definitions);
        continue;
      }
      const definition = company ? findDefinitionIn(inputs.definitions, seedVersion, block.block_type, typeVersionOf(config)) : null;
      for (let i = 0; i < block.quantity; i++) {
        const n = blockCount.get(locationId) ?? 0;
        blockCount.set(locationId, n + 1);
        const key = normalizeTag(legacySuggestTag(block.block_type, location, runKeys, definition));
        const free = (row: PriorEquipment): boolean => !bound.has(row.id) && row.type === block.block_type;
        const match =
          prior.find((row) => free(row) && row.reuse_key !== undefined && normalizeTag(row.reuse_key) === key) ??
          prior.find((row) => free(row) && row.reuse_key === undefined && normalizeTag(row.tag) === key);
        let equipmentId: string;
        if (match !== undefined) {
          equipmentId = match.id;
          bound.add(match.id);
          runKeys.push({ tag: legacy ? match.tag : key, removed_at: null });
        } else {
          equipmentId = deps.newId();
          const tag = legacy ? legacySuggestTag(block.block_type, location, taken, definition) : suggestTag(block.block_type, taken, definition);
          const equipmentRow: EquipmentRow = {
            id: equipmentId,
            project_id: project.id,
            tag,
            type: block.block_type,
            last_nameplate: null,
            removed_at: null,
            ...(legacy ? {} : { reuse_key: key }),
          };
          runKeys.push({ tag: legacy ? tag : key, removed_at: null });
          taken.push(equipmentRow);
          drafts.push({ ...projectScope, kind: 'create', path: `equipment/${equipmentId}`, value: equipmentRow as unknown as JsonValue });
        }
        const blockId = deps.newId();
        const row = blockRow(blockId, relatorioId, seedVersion, {
          location_id: locationId,
          equipment_id: equipmentId,
          block_type: block.block_type,
          config: structuredClone(config),
          order_key: initialOrderKey(n),
        });
        drafts.push({ ...relatorioScope, kind: 'create', path: `block/${blockId}`, value: row as unknown as JsonValue });
      }
    }
  }

  return { relatorioId, drafts, omitted };
}

function omitPlacement(omitted: OmittedPlacement[], blockType: CompanyBlockType, quantity: number, ctx: DefinitionContext): void {
  const known = omitted.find((entry) => entry.blockType === blockType);
  if (known !== undefined) known.quantity += quantity;
  else omitted.push({ blockType, label: companyTypeNameIn(ctx, blockType), quantity });
}

/**
 * e22h N4: the name a device knows a company type by when no version of it may be placed: the
 * label of the highest version row it holds, else its open draft's label; null when it holds
 * neither (the type row and its versions have not reached the device).
 */
export function companyTypeNameIn(ctx: DefinitionContext, blockType: string): string | null {
  const typeId = companyTypeIdOf(blockType);
  if (typeId === null) return null;
  // One row per number (`versions`: the smaller id when the device holds two), so the name is stable.
  let latest: { version: number; label: string } | null = null;
  for (const row of ctx.versions.values()) {
    if (row.type_id === typeId && (latest === null || row.version > latest.version)) latest = { version: row.version, label: row.definition.label };
  }
  if (latest !== null && latest.label.trim() !== '') return latest.label;
  const draft = ctx.types.get(typeId)?.draft as { label?: unknown } | null | undefined;
  return typeof draft?.label === 'string' && draft.label.trim() !== '' ? draft.label : null;
}

/**
 * e22h N4: the company placements a template would leave out of a relatório created on this
 * device now (`instantiateTemplate`'s `omitted`, without building the drafts): what "Novo
 * relatório" says before "Criar relatório" is pressed.
 */
export function omittedPlacementsOf(template: Pick<TemplateRow, 'seed_version' | 'skeleton' | 'blocks'>, ctx: DefinitionContext): OmittedPlacement[] {
  const omitted: OmittedPlacement[] = [];
  const nodes = canonicalSkeleton(template.skeleton);
  const liveBlocks = withoutOrphans(template);
  for (const node of nodes) {
    if (node.kind === 'painel') continue;
    for (const block of liveBlocks) {
      if (!isCompanyBlockType(block.block_type) || block.skeleton_location_ref !== node.ref) continue;
      if (companyBlockConfigOf(block, template.seed_version, ctx) === null) omitPlacement(omitted, block.block_type, block.quantity, ctx);
    }
  }
  return omitted;
}

/**
 * e22h N4: the sentence "Novo relatório" shows for the company placements a relatório would be
 * born without, naming each type and how many of it; null when none. A type the device knows no
 * name of reads "um tipo de equipamento da empresa".
 */
export function omittedPlacementsText(omitted: readonly OmittedPlacement[]): string | null {
  if (omitted.length === 0) return null;
  const items = omitted.map((entry) => `${entry.label ?? 'um tipo de equipamento da empresa'} (${plural(entry.quantity, 'equipamento', 'equipamentos')})`);
  // authored: e22h N4
  return omitted.length === 1
    ? `Fica de fora deste relatório: ${items[0]}, cuja versão publicada ainda não chegou a este aparelho.`
    : `Ficam de fora deste relatório: ${listPtBr(items)}, cujas versões publicadas ainda não chegaram a este aparelho.`;
}
