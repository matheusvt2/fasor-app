import { z } from 'zod';

/*
 * AD-21: `BlockConfig` is the only piece of seed-resolved structure ever copied into a
 * row -- into a Template block (`templateBlockSchema`) and, from Epic 4, into a relatório's
 * Block row. Every key below is enumerated so a typo in a template or a later
 * `block/{id}/config` put is a schema failure, never a silently ignored key. The
 * definitions these keys point at (fields, checklists, tables) live in `seed/` and are
 * resolved through `getDefinition`, never stored.
 *
 * Schemas grow append-only with the seed: a later seed version that adds an item or a
 * block type appends its key here, and every earlier key keeps parsing.
 */

/** The eight FO.SERV-03 equipment block types (glossary, addendum §9). */
export const EQUIPMENT_BLOCK_TYPES = [
  'cabos_entrada',
  'para_raio',
  'chave_seccionadora',
  'disjuntor_mt',
  'tp',
  'tc',
  'cabos_saida',
  'transformador_forca',
] as const;

/**
 * The FO.SERV-03 sections a Template carries as blocks. Sections 7 (photos) and 9
 * (equipment sheets) are generated from the relatório, never composed as a block.
 */
export const SECTION_BLOCK_TYPES = [
  'section_1',
  'section_2',
  'section_3',
  'section_4',
  'section_5',
  'section_6',
  'section_8',
  'section_10',
  'section_11',
] as const;

export const equipmentBlockTypeSchema = z.enum(EQUIPMENT_BLOCK_TYPES);
export type EquipmentBlockType = z.infer<typeof equipmentBlockTypeSchema>;

export const sectionBlockTypeSchema = z.enum(SECTION_BLOCK_TYPES);
export type SectionBlockType = z.infer<typeof sectionBlockTypeSchema>;

export const blockTypeSchema = z.enum([...EQUIPMENT_BLOCK_TYPES, ...SECTION_BLOCK_TYPES]);
export type BlockType = z.infer<typeof blockTypeSchema>;

export function isEquipmentBlockType(value: string): value is EquipmentBlockType {
  return (EQUIPMENT_BLOCK_TYPES as readonly string[]).includes(value);
}

export function isSectionBlockType(value: string): value is SectionBlockType {
  return (SECTION_BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * The switchable parts of an equipment sheet (FR-11). `ia_ip_display` is the optional,
 * off-by-default "IA e IP lidos do visor" columns of single-table insulation
 * (source-deltas: insulation is captured at 1 minuto only).
 */
export const SUB_BLOCK_KEYS = [
  'nameplate',
  'checklist',
  'isolacao',
  'ia_ip_display',
  'resistencia_contato',
  'relacao_transformacao',
  'observations',
  'conclusion',
] as const;

export const subBlockKeySchema = z.enum(SUB_BLOCK_KEYS);
export type SubBlockKey = z.infer<typeof subBlockKeySchema>;

/**
 * Every checklist item key of every seeded list (the union of the five FO.SERV-03 lists,
 * addendum §9.2). A key is the ASCII snake_case of its label; one key shared by several
 * lists (`limpeza`, `conexoes`, `aterramento`, ...) appears once.
 */
export const ITEM_KEYS = [
  // Cabos (entrada, saída, alimentação)
  'limpeza',
  'mufla',
  'conexoes',
  'aterramento_cordoalhas',
  'fixacao',
  // Para-raio
  'isolador',
  'contador_de_operacao',
  'aterramento',
  // Chave seccionadora
  'abertura_e_fechamento_manual',
  'abertura_e_fechamento_eletrico',
  'mecanismo_de_acionamento',
  'intertravamento_eletrico',
  'intertravamento_mecanico',
  'isoladores',
  'contatos',
  'motor',
  'fusiveis',
  'simultaneidade',
  'pintura_corrosao',
  'limpeza_e_lubrificacao',
  // Disjuntor MT
  'abertura_e_fechamento_eletrico_remoto',
  'abertura_e_fechamento_mecanico',
  'bobinas',
  'carregamento_manual_de_molas',
  'indicador_de_posicao',
  'camara_de_extincao',
  'contatos_movel_e_fixo',
  'cabos_de_controle',
  'lampadas_de_sinalizacao',
  'contatos_auxiliares',
  'condicao_geral_dos_mecanismos',
  'rele_de_acionamento_secundario_ou_prim',
  'oleo_isolante_indicador_de_nivel',
  // TP, TC and Transformador de força (one shared list)
  'valvula_de_alivio',
  'elemento_secante',
  'juntas_vedacoes_e_vazamentos',
  'indicador_nivel_de_oleo',
  'ventiladores',
  'registros_radiadores',
  'rele_de_gas_funcionamento',
  'corrosao_pintura_vibracoes',
  'buchas_primaria_secundarias',
  'termometro',
  'rele_de_temperatura_externo',
] as const;

export const itemKeySchema = z.enum(ITEM_KEYS);
export type ItemKey = z.infer<typeof itemKeySchema>;

/** FR-11 subtypes: they only pre-mark checklist items NA, never remove one. */
export const subtypeSchema = z.enum(['manual', 'epoxi', 'a_seco']);
export type Subtype = z.infer<typeof subtypeSchema>;

/** AD-6/AD-21: a block's role lives only here. */
export const roleSchema = z.enum(['entrada', 'saida', 'alimentacao']);
export type Role = z.infer<typeof roleSchema>;

export const subBlockConfigSchema = z.object({
  enabled: z.boolean(),
  options: z.record(z.string(), z.json()).optional(),
});
export type SubBlockConfig = z.infer<typeof subBlockConfigSchema>;

/** AD-21 `BlockConfig`. Section blocks carry `sub_blocks: {}` and no subtype or role. */
export const blockConfigSchema = z.object({
  block_type: blockTypeSchema,
  subtype: subtypeSchema.optional(),
  role: roleSchema.optional(),
  sub_blocks: z.partialRecord(subBlockKeySchema, subBlockConfigSchema),
  /** Each item once: a repeat would pre-mark nothing new and only hide a writer's bug. */
  na_defaults: z.array(itemKeySchema).refine((keys) => new Set(keys).size === keys.length, { message: 'na_defaults repeats an item' }),
});
export type BlockConfig = z.infer<typeof blockConfigSchema>;

/** UX-DR30: the Quantity stepper counts 0 to 99 of one type at one node; a Template block holds 1 to 99. */
export const MAX_QUANTITY = 99;

/**
 * A Template block: a `BlockConfig` plus how many of it the template places at one
 * skeleton node. Section blocks sit outside the skeleton (`skeleton_location_ref: null`).
 *
 * `section_text` (Story 3.6) is a section block's own plain-text boilerplate with `{name}`
 * variable tokens. `null` means the seed's text is in force (`sectionText`, resolved and
 * never copied, AD-21); an equipment block always holds `null`. Defaulted, so a row
 * written before the field existed still parses.
 */
export const templateBlockSchema = blockConfigSchema.extend({
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  skeleton_location_ref: z.string().min(1).nullable(),
  section_text: z.string().nullable().default(null),
});
export type TemplateBlock = z.infer<typeof templateBlockSchema>;

/** A cabine, coluna or location name: any text, but never empty or blank (kept as written, not trimmed). */
export const nodeNameSchema = z.string().refine((name) => name.trim().length > 0, { message: 'name is blank' });

/**
 * One node of a Template's location skeleton: a `cabine` root or a `coluna` under one.
 * `agrupar_por_tipo` exists only on a cabine (AD-6); `ref` is a stable string the
 * template's blocks point at, turned into location ids by `instantiateTemplate` (Epic 4).
 */
export const skeletonNodeSchema = z.discriminatedUnion('kind', [
  z.object({
    ref: z.string().min(1),
    kind: z.literal('cabine'),
    parent_ref: z.null(),
    name: nodeNameSchema,
    agrupar_por_tipo: z.boolean(),
  }),
  z.object({
    ref: z.string().min(1),
    kind: z.literal('coluna'),
    parent_ref: z.string().min(1),
    name: nodeNameSchema,
  }),
]);
export type SkeletonNode = z.infer<typeof skeletonNodeSchema>;
