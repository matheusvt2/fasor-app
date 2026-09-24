import type { NewId } from '../ids.ts';
import type { OpDraft } from '../ops/op.ts';
import { initialOrderKey } from '../ops/order-key.ts';
import { isEquipmentBlockType, isSectionBlockType, type SkeletonNode, type TemplateBlock } from '../schemas/block-config.ts';
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
import { sectionNumber, withoutOrphans } from '../templates/compose.ts';
import { suggestTag, type TagEquipment } from './tag.ts';

/*
 * Story 4.1 (FR-13, AR-5): a relatório is born as ONE client batch — the `relatorio`
 * create plus every `location`, `block` and `equipment` create the template's skeleton
 * and blocks produce. Everything is copied, nothing is referenced: a template edited
 * afterwards (D-4 bumps its `version`) never touches a relatório made from it, and the
 * server copies nothing. Ids come from the caller's `newId` in a fixed order (TC-2), so
 * two runs over the same sequence build the same drafts.
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

export interface InstantiateInputs {
  service_start: string | null;
  service_end: string | null;
  /** The project's equipment as this device holds it, so the new tags stay unique among the live ones. */
  existingEquipment: readonly TagEquipment[];
}

export interface InstantiateDeps {
  newId: NewId;
  actorId: string;
  companyId: string;
}

export interface Instantiated {
  relatorioId: string;
  drafts: OpDraft[];
}

/** The `BlockConfig` a relatório block copies from a template block (AD-21), plus the section's own text. */
export function blockConfigOf(block: TemplateBlock): JsonValue {
  return {
    block_type: block.block_type,
    ...(block.subtype === undefined ? {} : { subtype: block.subtype }),
    ...(block.role === undefined ? {} : { role: block.role }),
    sub_blocks: structuredClone(block.sub_blocks),
    na_defaults: [...block.na_defaults],
    ...(isSectionBlockType(block.block_type) ? { section_text: block.section_text } : {}),
  } as JsonValue;
}

/** Cabines in skeleton order, each followed by its colunas in skeleton order. */
function canonicalNodes(skeleton: readonly SkeletonNode[]): SkeletonNode[] {
  const out: SkeletonNode[] = [];
  for (const cabine of skeleton) {
    if (cabine.kind !== 'cabine') continue;
    out.push(cabine, ...skeleton.filter((node) => node.kind === 'coluna' && node.parent_ref === cabine.ref));
  }
  return out;
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
 * create, one `location` per skeleton node (cabines then their colunas, `order_key` per
 * sibling), the section blocks in FO.SERV-03 number order (the template's, plus 7 and 9
 * synthesized with `section_text: null`), then per template block in skeleton order one
 * `equipment` create (project scope, tag from `suggestTag` over the project's equipment
 * and the ones born before it) and its `block` create in its column. An orphan template
 * block (a node the skeleton lacks) is skipped, as every other reader skips it.
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
      responsible_user_id: null,
      cover_photo_file_id: null,
      escopo: null,
      exclusions: null,
      additional_info: null,
      art_trt_number: null,
      instrument_ids: [],
      site_altitude_m: null,
      site_altitude_confirmed: false,
      next_intervention_date: null,
      next_intervention_justification: null,
    },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  };
  drafts.push({ ...relatorioScope, kind: 'create', path: `relatorio/${relatorioId}`, value: relatorio as unknown as JsonValue });

  // Locations: every node gets its id first (a coluna names its cabine's id), in canonical order.
  const nodes = canonicalNodes(template.skeleton);
  const locationIdOf = new Map<string, string>();
  for (const node of nodes) locationIdOf.set(node.ref, deps.newId());
  const siblingCount = new Map<string | null, number>();
  for (const node of nodes) {
    const n = siblingCount.get(node.parent_ref) ?? 0;
    siblingCount.set(node.parent_ref, n + 1);
    const id = locationIdOf.get(node.ref)!;
    const base = { id, relatorio_id: relatorioId, parent_id: node.parent_ref === null ? null : locationIdOf.get(node.parent_ref)!, name: node.name, order_key: initialOrderKey(n), removed_at: null };
    const row: LocationRow =
      node.kind === 'coluna'
        ? { ...base, kind: 'coluna' }
        : {
            ...base,
            kind: 'cabine',
            se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
            env: { altitude_m: null, temperature_c: null, humidity_pct: null },
            agrupar_por_tipo: node.agrupar_por_tipo,
          };
    drafts.push({ ...relatorioScope, kind: 'create', path: `location/${id}`, value: row as unknown as JsonValue });
  }

  // Section blocks, in FO.SERV-03 number order; 7 and 9 are synthesized.
  const liveBlocks = withoutOrphans(template);
  const sections: { number: number; config: JsonValue; type: string }[] = liveBlocks
    .filter((block) => isSectionBlockType(block.block_type))
    .map((block) => ({ number: sectionNumber(block.block_type as never), config: blockConfigOf(block), type: block.block_type }));
  for (const type of GENERATED_SECTION_TYPES) {
    sections.push({ number: relatorioSectionNumber(type)!, type, config: { block_type: type, sub_blocks: {}, na_defaults: [], section_text: null } });
  }
  sections.sort((a, b) => a.number - b.number);
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
  const equipment: TagEquipment[] = [...inputs.existingEquipment];
  const blockCount = new Map<string, number>();
  for (const node of nodes) {
    const locationId = locationIdOf.get(node.ref)!;
    for (const block of liveBlocks) {
      if (!isEquipmentBlockType(block.block_type) || block.skeleton_location_ref !== node.ref) continue;
      for (let i = 0; i < block.quantity; i++) {
        const equipmentId = deps.newId();
        const blockId = deps.newId();
        const n = blockCount.get(locationId) ?? 0;
        blockCount.set(locationId, n + 1);
        const tag = suggestTag(block.block_type, { kind: node.kind, name: node.name }, equipment);
        const equipmentRow: EquipmentRow = { id: equipmentId, project_id: project.id, tag, type: block.block_type, last_nameplate: null, removed_at: null };
        equipment.push(equipmentRow);
        drafts.push({ ...projectScope, kind: 'create', path: `equipment/${equipmentId}`, value: equipmentRow as unknown as JsonValue });
        const row = blockRow(blockId, relatorioId, seedVersion, {
          location_id: locationId,
          equipment_id: equipmentId,
          block_type: block.block_type,
          config: blockConfigOf(block),
          order_key: initialOrderKey(n),
        });
        drafts.push({ ...relatorioScope, kind: 'create', path: `block/${blockId}`, value: row as unknown as JsonValue });
      }
    }
  }

  return { relatorioId, drafts };
}
