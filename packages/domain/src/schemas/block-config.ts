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

/** The eight FO.SERV-03 equipment block types (glossary, addendum §9): every seed version ships all of them. */
export const BASE_EQUIPMENT_BLOCK_TYPES = [
  'cabos_entrada',
  'para_raio',
  'chave_seccionadora',
  'disjuntor_mt',
  'tp',
  'tc',
  'cabos_saida',
  'transformador_forca',
] as const;
export type BaseEquipmentBlockType = (typeof BASE_EQUIPMENT_BLOCK_TYPES)[number];

/**
 * Every equipment block type any seed version ships: the eight, then (seed v5, Story 14.5,
 * contract 19) the Chave de transferência automática, then (seed v6, Story 14.9, contract 21)
 * the Quadro elétrico (QGBT/QD). A closed, append-only list; which of
 * them a relatório or a template offers is its seed version's (`equipmentTypesOf`): a type
 * its version does not ship has no definition there (`getDefinition` throws, `findDefinition`
 * answers null) and the fold refuses a block of it.
 */
export const EQUIPMENT_BLOCK_TYPES = [...BASE_EQUIPMENT_BLOCK_TYPES, 'chave_transferencia_automatica', 'quadro_eletrico'] as const;

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
  // Appended (seed v5, Story 14.5): the six measurement tests of the Chave de transferência
  // automática, E1 to E6. A test's key is its sub-block key, so its switch is `sub_blocks[key]`.
  'cta_resistencia_contato',
  'cta_isolamento_principal',
  'cta_isolamento_controle',
  'cta_ajustes_controlador',
  'cta_transferencia',
  'cta_termografia',
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
  // Appended (seed v4, Story 14.3): the sixteenth Disjuntor MT item, NO-BREAK DE COMANDO.
  'no_break_de_comando',
  // Appended (seed v5, Story 14.5): the 17 items of the Chave de transferência automática
  // (`sprint-change-proposal-2026-10-08.md` § 8.4), in the order they are answered and printed.
  'placa_confere_com_o_projeto',
  'involucro_fixacao_e_continuidade_do_aterramento_do_painel',
  'tampas_e_barreiras_fixadas_aviso_de_transferencia_manual_presente',
  'limpeza_interna_aspirada_sem_soprar',
  'contatos_principais_de_arco_e_auxiliares_posicao_sem_pites_ou_superaquecimento',
  'isoladores_e_barramentos',
  'reaperto_da_potencia_ao_torque_da_etiqueta',
  'reaperto_da_fiacao_de_controle_chicote_e_fusiveis_de_comando',
  'lubrificacao_somente_conforme_o_fabricante_sem_oleo',
  'operacao_manual_com_as_fontes_desenergizadas',
  'intertravamento_mecanico_e_eletrico_n_e',
  'rotacao_de_fases_da_emergencia_igual_a_da_normal',
  'indicacao_de_posicao_leds_e_alarmes_leituras_de_v_i_e_f_conferem_com_instrumento',
  'registro_de_manobras_e_contador_de_transferencias_revisados',
  'partida_do_gerador_comandada_pela_chave_exercitador_programado',
  'aquecedor_e_ventilacao_se_houver',
  'gerador_deixado_em_automatico_ao_final',
  // Appended (seed v6, Story 14.9): the items of the Quadro elétrico (QGBT/QD) not already above
  // (`docs/nc-chip-phrases.md`, "Quadros elétricos"); its `lampadas_de_sinalizacao`, `fusiveis`,
  // `aterramento` and `isoladores` are the keys the eight already use.
  'limpeza_interna_e_externa',
  'pintura_corrosao_da_caixa',
  'resistencia_de_aquecimento',
  'iluminacao_interna',
  'reles_e_contatores',
  'disjuntores_termomagneticos',
  'instrumentos_de_medicao',
  'barramentos',
  'fiacao_interna',
  'reaperto_geral',
  'placas_de_sinalizacao',
  'organizacao_interna',
  'identificacao_de_circuitos',
  // Appended (seed v10, Story 15.7, contract 27): the TC's own list (`docs/nc-chip-phrases.md`,
  // "TC"); `fusiveis`, `aterramento` and `conexoes` are the keys other lists already use.
  'limpeza_pintura_e_corrosao',
  'vasamento',
  'fiacao_secundaria',
  'buchas',
] as const;

export const itemKeySchema = z.enum(ITEM_KEYS);
export type ItemKey = z.infer<typeof itemKeySchema>;

/**
 * Story 14.3 (seed v4, contract 18): the 19 items of a local's site checklist, "Verificações
 * do local", in the order they are answered and printed (`sprint-change-proposal-2026-10-08.md`
 * § 4.1). A closed list like `ITEM_KEYS`: a key is the ASCII snake_case of its label, the list
 * grows append-only with the seed, and `location/{id}/checklist/{item_key}/...` accepts no other
 * key. Which of them a relatório offers is its seed version's `site_checklist` (`siteItems`).
 * Story 15.3 (seed v9, contract 25) appends two Ambiente items, so v9 offers 21 and v4 to v8 the
 * first 19.
 */
export const SITE_ITEM_KEYS = [
  // Segurança e EPC no local
  'luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido',
  'tapete_ou_estrado_isolante',
  'vara_de_manobra_com_ensaio_dieletrico_valido',
  'detector_de_tensao',
  'conjunto_de_aterramento_temporario',
  'epi_disponivel',
  'dispositivos_de_bloqueio_e_cartoes_de_impedimento',
  // Combate a incêndio
  'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido',
  'bacia_de_contencao_de_oleo',
  // Iluminação
  'iluminacao_normal',
  'iluminacao_de_emergencia_autonomia_minima_de_2_h',
  // Aterramento
  'portas_telas_e_grades_aterradas',
  'pontos_para_aterramento_temporario',
  // Sinalização e documentação
  'placas_de_advertencia_na_porta_e_nas_grades',
  'diagrama_unifilar_atualizado_no_local',
  'circuitos_e_equipamentos_identificados',
  // Ambiente
  'porta_abrindo_para_fora_com_fechadura',
  'ventilacao',
  'limpeza_e_ausencia_de_infiltracao',
  // Seed v9 (Story 15.3, contract 25): appended to Ambiente as its items 20 and 21.
  'grades_e_portas_estado_e_fixacao',
  'pintura_e_corrosao',
] as const;

export const siteItemKeySchema = z.enum(SITE_ITEM_KEYS);
export type SiteItemKey = z.infer<typeof siteItemKeySchema>;

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
  /**
   * Story 14.5 (contract 19): the block's own configuration, one option key per config field of
   * its definition (`config_fields`: the CTA's tensão, polos, neutro, transição, bypass). It is
   * structure, written whole with the config (`block/{id}/config`), and shapes the sheet: which
   * rows a measurement test shows and which criterion applies. Optional and never defaulted:
   * a config written before the key existed parses to the same bytes, and a field with no
   * entry reads its definition's default (`configOptionsOf`).
   */
  options: z.record(z.string(), z.string()).optional(),
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

/** A local (cabine), painel, coluna or location name: any text, but never empty or blank (kept as written, not trimmed). */
export const nodeNameSchema = z.string().refine((name) => name.trim().length > 0, { message: 'name is blank' });

/**
 * Story 14.2 (AD-6): the reserved keys of a local's Função. `funcao` holds one of these or a
 * typed name ("Medição"); the pt-BR label of either is `funcaoLabel` (`relatorio/local.ts`).
 */
export const FUNCAO_KEYS = ['entrada', 'primaria', 'transformacao', 'distribuicao'] as const;
export type FuncaoKey = (typeof FUNCAO_KEYS)[number];

/** The longest Função a row holds, a reserved key or a typed name. */
export const FUNCAO_MAX_LENGTH = 80;

/** A local's Função as stored: a reserved key or a typed name, never blank, at most 80 characters. */
export const funcaoSchema = z
  .string()
  .max(FUNCAO_MAX_LENGTH)
  .refine((funcao) => funcao.trim().length > 0, { message: 'funcao is blank' });

/**
 * One node of a Template's location skeleton (Story 14.2: Local › Painel › Coluna): a
 * `cabine` root (the local), a `painel` under one, or a `coluna` under a painel. A coluna
 * directly under a cabine is the shape every template had before the painel level and stays
 * valid. `agrupar_por_tipo` and `funcao` exist only on a cabine (AD-6); `funcao` is optional,
 * absent and null both meaning none, so a row written before it existed parses unchanged.
 * `ref` is a stable string the template's blocks point at, turned into location ids by
 * `instantiateTemplate` (Epic 4).
 */
export const skeletonNodeSchema = z.discriminatedUnion('kind', [
  z.object({
    ref: z.string().min(1),
    kind: z.literal('cabine'),
    parent_ref: z.null(),
    name: nodeNameSchema,
    agrupar_por_tipo: z.boolean(),
    funcao: funcaoSchema.nullable().optional(),
  }),
  z.object({
    ref: z.string().min(1),
    kind: z.literal('coluna'),
    parent_ref: z.string().min(1),
    name: nodeNameSchema,
  }),
  // Appended (Story 14.2): a painel only groups colunas; it holds no data and no block.
  z.object({
    ref: z.string().min(1),
    kind: z.literal('painel'),
    parent_ref: z.string().min(1),
    name: nodeNameSchema,
  }),
]);
export type SkeletonNode = z.infer<typeof skeletonNodeSchema>;
