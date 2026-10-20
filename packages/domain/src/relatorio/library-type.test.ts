import { describe, expect, it } from 'vitest';
import { contractExamples } from '../contract/examples.ts';
import { syncPullResponseSchema, syncPushBodySchema } from '../contract/sync.ts';
import { applyOp } from '../ops/apply.ts';
import { makeOp, opSchema } from '../ops/op.ts';
import { parsePath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { CAPTION_EQUIPMENT_WORDS, equipmentChipOptions } from '../photos/caption.ts';
import { section11Instruments } from '../print/section-11.ts';
import { PANEL_FIELDS, panelFields } from '../reading/panel.ts';
import { BASE_EQUIPMENT_BLOCK_TYPES, blockConfigSchema, EQUIPMENT_BLOCK_TYPES, isEquipmentBlockType, SUB_BLOCK_KEYS, type TemplateBlock } from '../schemas/block-config.ts';
import { blockRowSchema, sheetSchema, templateRowSchema, type BlockRow, type JsonValue } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { SEED_VERSION } from '../seed/definitions.ts';
import { defaultBlockConfig, standardTemplate, templateBlockTotal, templateTotals } from '../seed/template.ts';
import { addCabine, addColuna, composerView, enabledSubBlocks, setQuantity, setTypeDefaults, typeConfigFor } from '../templates/compose.ts';
import { templateFromRelatorio, templateSeedUpgrade } from '../templates/from-relatorio.ts';
import { emptyTemplate } from '../templates/list.ts';
import { quantityLabel, subBlockSummaryText, TOTALS_ORDER, totalsText } from '../templates/text.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { blockOf, CTA, CTA_BLOCK, CTA_EQUIPMENT, ctaBlock, ctaDefinition, ctaLocal, ctaRelatorio, ctaRows, ctaState, E1, E2, E6 } from './measurement-test-support.ts';
import { panelProposal, panelTypeChips, type PanelSuggestion } from './panel.ts';
import { enabledSubBlocksOf } from './sheet-state.ts';
import { suggestTag, TAG_PREFIX } from './tag.ts';
import { blockTypeLabel, LIBRARY_GROUP_LABEL, libraryTypeSummaryText, paletteItems, paletteTypeGroups } from './tree.ts';

/*
 * Story 14.5: what a library type is outside its own sheet. The palettes offer it after the
 * eight only on a seed version that ships it; its TAG, nouns, totals and caption word come
 * from the kernel; a template carries it, and its configuration, into a relatório and back.
 */

const TEMPLATE = '019966b0-0147-7000-8000-000000000001';

describe('matrix "Palettes by seed": v4 lists the eight; v5 the eight then "Outros equipamentos" with the CTA', () => {
  it('paletteTypeGroups: one group with no heading before v5, a second under the library label on v5', () => {
    expect(LIBRARY_GROUP_LABEL).toBe('Outros equipamentos');
    for (const version of ['v1', 'v2', 'v3', 'v4']) {
      expect(paletteTypeGroups(version), version).toEqual([{ key: 'seeded', label: null, types: [...BASE_EQUIPMENT_BLOCK_TYPES] }]);
    }
    expect(paletteTypeGroups('v5')).toEqual([
      { key: 'seeded', label: null, types: [...BASE_EQUIPMENT_BLOCK_TYPES] },
      { key: 'library', label: 'Outros equipamentos', types: [CTA] },
    ]);
    // Story 14.9: seed v6 adds the Quadro elétrico after it (`quadro-eletrico.test.ts`).
    expect(paletteTypeGroups(SEED_VERSION)[1]!.types[0]).toBe(CTA);
    // A version this bundle does not ship offers what every version holds.
    expect(paletteTypeGroups('v99')).toEqual([{ key: 'seeded', label: null, types: [...BASE_EQUIPMENT_BLOCK_TYPES] }]);
  });

  it('paletteItems: the field palette\'s rows, the library type last with its suggested TAG and what it holds', () => {
    const coluna = { kind: 'coluna' as const, name: 'Coluna 5' };
    const v4 = paletteItems('v4', coluna, []);
    expect(v4.map((item) => item.type)).toEqual([...BASE_EQUIPMENT_BLOCK_TYPES]);
    expect(v4.every((item) => !item.library && item.summary === null)).toBe(true);
    const v5 = paletteItems('v5', coluna, []);
    expect(v5.map((item) => item.type)).toEqual([...BASE_EQUIPMENT_BLOCK_TYPES, CTA]);
    expect(v5.slice(0, 8)).toEqual(v4);
    expect(v5[8]).toEqual({ type: CTA, label: 'Chave de transferência automática', tag: 'CTA-C05', library: true, summary: '17 itens · até 6 ensaios' });
    // Directly on a local, and with the TAG taken.
    const local = { kind: 'cabine' as const, name: 'Geradores' };
    expect(paletteItems('v5', local, [])[8]!.tag).toBe('CTA-GERADORES');
    expect(paletteItems('v5', local, [{ tag: 'CTA-GERADORES', removed_at: null }])[8]!.tag).toBe('CTA-GERADORES-2');
  });

  it('the TAG follows the existing rule with the prefix CTA; the type label and the summary are the seed\'s', () => {
    expect(TAG_PREFIX[CTA]).toBe('CTA');
    expect(suggestTag(CTA, { kind: 'coluna', name: 'Coluna 5' }, [])).toBe('CTA-C05');
    // On a local the code is the local's short name, as for the eight ("CE-ENEL").
    expect(suggestTag(CTA, { kind: 'cabine', name: 'Cubículo Enel' }, [])).toBe('CTA-ENEL');
    expect(suggestTag(CTA, { kind: 'cabine', name: 'Geradores' }, [{ tag: 'cta-geradores', removed_at: null }])).toBe('CTA-GERADORES-2');
    expect(blockTypeLabel('v5', CTA)).toBe('Chave de transferência automática');
    // On a version that does not ship it the label falls back to the key, as for any unknown type.
    expect(blockTypeLabel('v4', CTA)).toBe(CTA);
    expect(libraryTypeSummaryText('v5', CTA)).toBe('17 itens · até 6 ensaios');
    expect(libraryTypeSummaryText('v4', CTA)).toBeNull();
    expect(libraryTypeSummaryText('v5', 'tp')).toBeNull();
    expect(isEquipmentBlockType(CTA)).toBe(true);
  });

  it('"Fotografar equipamento": the provider is asked for the types of the seed version, and a read type the version does not ship proposes nothing', () => {
    expect(PANEL_FIELDS[0]!.options).toEqual([...BASE_EQUIPMENT_BLOCK_TYPES]);
    expect(panelFields('v4')).toEqual(PANEL_FIELDS);
    expect(panelFields('v5')[0]!.options).toEqual([...BASE_EQUIPMENT_BLOCK_TYPES, CTA]);
    expect(panelFields('v5')[1]).toEqual(PANEL_FIELDS[1]);
    const local = ctaLocal();
    const suggestion = { row: { trust: 'suggested' }, value: { block_type: CTA, column: null, column_text: null } } as unknown as PanelSuggestion;
    const input = { locations: [local], equipment: [], paletteLocationId: local.id, suggestion, pickedType: null };
    expect(panelProposal({ ...input, seedVersion: 'v4' })).toBeNull();
    // No column was read, so the location is the palette's own and the suggestion is not confirmed as read.
    expect(panelProposal({ ...input, seedVersion: 'v5' })).toMatchObject({ type: CTA, typeLabel: 'Chave de transferência automática', tag: 'CTA-GERADORES', matched: false });
    // The engineer's own pick stands, and the read type that could not be offered is discarded with it.
    expect(panelProposal({ ...input, seedVersion: 'v4', pickedType: 'tp' })).toMatchObject({ type: 'tp', trust: null, suggestionStatus: 'discarded' });
    expect(panelTypeChips('v5', CTA, false).chips.map((chip) => chip.type)).toEqual([CTA, 'cabos_entrada', 'para_raio', 'chave_seccionadora']);
  });
});

describe('derived words of the type', () => {
  it('names it in the template totals after the eight, singular at one, and in the stepper label', () => {
    // Story 14.9: the Quadro elétrico of seed v6 follows it.
    expect(TOTALS_ORDER).toHaveLength(10);
    expect(TOTALS_ORDER[8]).toBe(CTA);
    const zero = Object.fromEntries(EQUIPMENT_BLOCK_TYPES.map((type) => [type, 0])) as Record<(typeof EQUIPMENT_BLOCK_TYPES)[number], number>;
    expect(totalsText({ ...zero, [CTA]: 1 })).toBe('1 chave de transferência automática');
    expect(totalsText({ ...zero, chave_seccionadora: 25, para_raio: 5, [CTA]: 2 })).toBe('25 seccionadoras · 5 para-raios · 2 chaves de transferência automática');
    expect(totalsText({ ...zero, chave_seccionadora: 25 })).toBe('25 seccionadoras');
    expect(quantityLabel(CTA, 1)).toBe('Chaves de transferência automática, 1');
  });

  it('has a caption word that agrees in the feminine singular', () => {
    expect(CAPTION_EQUIPMENT_WORDS[CTA]).toEqual({ name: 'chave de transferência automática', gender: 'f', number: 'singular' });
    expect(equipmentChipOptions({ blocks: [ctaBlock()] }, CTA_BLOCK)).toEqual([CAPTION_EQUIPMENT_WORDS[CTA]]);
  });
});

describe('the block config of the type', () => {
  it('defaults to every sub-block on, the six tests included, with no option stored and no NA default', () => {
    const config = defaultBlockConfig('v5', CTA);
    expect(config).toEqual({
      block_type: CTA,
      sub_blocks: Object.fromEntries(ctaDefinition().sub_blocks.map((key) => [key, { enabled: true }])),
      na_defaults: [],
    });
    expect(Object.keys(config.sub_blocks)).toHaveLength(10);
    expect(blockConfigSchema.parse(config)).toEqual(config);
    expect(enabledSubBlocks(config)).toEqual(SUB_BLOCK_KEYS.filter((key) => ctaDefinition().sub_blocks.includes(key)));
    expect([...enabledSubBlocksOf(ctaBlock())].sort()).toEqual([...ctaDefinition().sub_blocks].sort());
    for (const version of ['v1', 'v2', 'v3', 'v4']) expect(() => defaultBlockConfig(version, CTA), version).toThrow(/is not in seed_version/);
  });

  it('`options` is optional and never defaulted: a config written before the key parses to the same bytes', () => {
    for (const type of BASE_EQUIPMENT_BLOCK_TYPES) {
      const config = defaultBlockConfig('v4', type);
      expect(JSON.stringify(blockConfigSchema.parse(config)), type).toBe(JSON.stringify(config));
      expect('options' in blockConfigSchema.parse(config), type).toBe(false);
    }
    const withOptions = { ...defaultBlockConfig('v5', CTA), options: { polos: '4', tensao: 'mt' } };
    expect(blockConfigSchema.parse(withOptions)).toEqual(withOptions);
    expect(blockConfigSchema.safeParse({ ...withOptions, options: { polos: 4 } }).success).toBe(false);
  });

  it('`values` is optional and never defaulted on a test entry: a sheet written before the key parses to the same bytes', () => {
    const before = { nameplate: {}, checklist: {}, test: { isolacao: { cells: { '0': { '1': { value: { raw: '900', unit: 'MΩ', state: 'measured' }, source_suggestion_id: null, op_id: CTA_BLOCK } } } } }, conclusion: {}, observations: null };
    expect(JSON.stringify(sheetSchema.parse(before))).toBe(JSON.stringify(before));
    expect('values' in sheetSchema.parse(before).test.isolacao!).toBe(false);
    const block = ctaBlock({}, [{ test: 'cta_transferencia', key: 'metodo', value: { raw: 'falta_real', unit: null, state: 'measured' } }]);
    expect(JSON.stringify(blockRowSchema.parse(block))).toBe(JSON.stringify(block));
  });
});

describe('a template with the type', () => {
  const skeleton = addColuna(addCabine([], 'geradores', 'Geradores'), 'geradores', 'c5', 'Coluna 5');
  const v5 = () => ({ ...emptyTemplate(TEMPLATE, 'v5'), skeleton });

  it('the Quantity stepper places it with its default config, the totals and the node name it', () => {
    const blocks = setQuantity(v5(), 'c5', CTA, 1);
    expect(blocks.filter((block) => block.block_type === CTA)).toEqual([{ ...defaultBlockConfig('v5', CTA), quantity: 1, skeleton_location_ref: 'c5', section_text: null }]);
    const template = { ...v5(), blocks };
    expect(templateRowSchema.safeParse(template).success).toBe(true);
    expect(templateTotals(template)[CTA]).toBe(1);
    expect(templateBlockTotal(template)).toBe(1);
    expect(totalsText(templateTotals(template))).toBe('1 chave de transferência automática');
    const view = composerView(template);
    expect(view.totals[CTA]).toBe(1);
    expect(setQuantity(template, 'c5', CTA, 3).find((block) => block.block_type === CTA)!.quantity).toBe(3);
    expect(setQuantity(template, 'c5', CTA, 0).some((block) => block.block_type === CTA)).toBe(false);
    // Its type defaults are one config for every placement, as for the eight.
    const config = typeConfigFor(blocks, CTA)!;
    const off = setTypeDefaults(blocks, CTA, { ...config, sub_blocks: { ...config.sub_blocks, [E6]: { enabled: false } } });
    expect(templateRowSchema.safeParse({ ...template, blocks: off }).success).toBe(true);
    expect(subBlockSummaryText(ctaDefinition(), 'checklist')).toBe('17 itens C · NC · NA');
    expect(subBlockSummaryText(ctaDefinition(), 'nameplate')).toBe('15 campos');
  });

  it('the standard template stays without it, and a v1 to v5 template moves to the current version (v6 since Story 14.9) as it is', () => {
    const standard = standardTemplate({ id: TEMPLATE });
    expect(standard.seed_version).toBe(SEED_VERSION);
    expect(standard.blocks.some((block) => block.block_type === CTA)).toBe(false);
    expect(templateTotals(standard)[CTA]).toBe(0);
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5']) expect(templateSeedUpgrade(standardTemplate({ id: TEMPLATE, seedVersion: version })), version).toBe(SEED_VERSION);
    expect(templateSeedUpgrade(standard)).toBeNull();
  });

  it('a template on v1 to v4 refuses the type as an issue of the row, never a throw; on v5 its options are checked against its config fields', () => {
    const entry: TemplateBlock = { ...defaultBlockConfig('v5', CTA), quantity: 1, skeleton_location_ref: 'c5', section_text: null };
    for (const version of ['v1', 'v2', 'v3', 'v4']) {
      const parsed = templateRowSchema.safeParse({ ...emptyTemplate(TEMPLATE, version), skeleton, blocks: [entry] });
      expect(parsed.success, version).toBe(false);
      expect(parsed.error!.issues[0]!.message, version).toBe(`${CTA} is not a block type of seed_version "${version}"`);
      expect(() => setQuantity({ ...emptyTemplate(TEMPLATE, version), skeleton }, 'c5', CTA, 1), version).toThrow(/is not in seed_version/);
    }
    const on = (options: Record<string, string>) => templateRowSchema.safeParse({ ...v5(), blocks: [{ ...entry, options }] });
    expect(on({ polos: '4', tensao: 'mt', neutro: 'chaveado', transicao: 'fechada', bypass: 'sim' }).success).toBe(true);
    expect(on({}).success).toBe(true);
    expect(on({ polos: '5' }).error!.issues[0]!.message).toBe('"5" is not an option of "polos"');
    expect(on({ fases: '3' }).error!.issues[0]!.message).toBe(`${CTA} has no config field "fases"`);
    // A type with no configuration takes no option, and neither does a section block.
    const tp: TemplateBlock = { ...defaultBlockConfig('v5', 'tp'), quantity: 1, skeleton_location_ref: 'c5', section_text: null, options: { polos: '4' } };
    expect(templateRowSchema.safeParse({ ...v5(), blocks: [tp] }).success).toBe(false);
    const section = { ...defaultBlockConfig('v5', 'section_1'), quantity: 1, skeleton_location_ref: null, section_text: null, options: {} };
    expect(templateRowSchema.safeParse({ ...v5(), blocks: [section] }).error!.issues[0]!.message).toBe('a section block has no configuration');
  });

  it('a relatório made from it is born with the block, its TAG and its configuration; saved back as a template it carries them', () => {
    const entry: TemplateBlock = { ...defaultBlockConfig('v5', CTA), options: { polos: '4', neutro: 'chaveado' }, quantity: 2, skeleton_location_ref: 'geradores', section_text: null };
    const template = { ...v5(), blocks: [entry] };
    const { relatorioId, drafts } = instantiateTemplate(
      template,
      { id: TEST_PROJECT },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
      { newId: idSequence('019966b0-0148-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
    );
    const ops = drafts.map((draft, index) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0149-7000-8000-'), now: T0 }), seq: index + 1 }));
    for (const op of ops) expect(opSchema.safeParse(op).success, op.path).toBe(true);
    const snapshot = buildSnapshot(replay(ops), relatorioId);
    expect(snapshot.relatorio.seed_version).toBe('v5');
    const blocks = snapshot.blocks.filter((block) => block.block_type === CTA);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag)).toEqual(['CTA-GERADORES', 'CTA-GERADORES-2']);
    for (const block of blocks) {
      expect(block.seed_version).toBe('v5');
      expect(block.config).toEqual({ block_type: CTA, sub_blocks: entry.sub_blocks, na_defaults: [], options: { polos: '4', neutro: 'chaveado' } });
    }
    const saved = templateFromRelatorio(snapshot, { id: TEMPLATE, name: 'Com CTA' });
    expect(templateRowSchema.safeParse(saved).success).toBe(true);
    // Saved from a v5 relatório, the template is born on the current version (Story 14.3's rule).
    expect(saved.seed_version).toBe(SEED_VERSION);
    expect(saved.blocks.filter((block) => block.block_type === CTA)).toEqual([{ ...entry, skeleton_location_ref: saved.skeleton[0]!.ref }]);
    // The eight carry no `options` key into a relatório, as before.
    const tp = instantiateTemplate(
      { ...v5(), blocks: setQuantity(v5(), 'c5', 'tp', 1) },
      { id: TEST_PROJECT },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
      { newId: idSequence('019966b0-0148-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
    );
    const created = tp.drafts.find((draft) => parsePath(draft.path).family === 'block' && (draft.value as { block_type: string }).block_type === 'tp')!;
    expect('options' in (created.value as { config: object }).config).toBe(false);
  });
});

describe('section 11 and the snapshot read a measurement test like a seeded one', () => {
  it('an instrument copied onto E1 and E2 is listed once each, in test order, and left out for a test switched off', () => {
    const megger = { instrument_id: '019966b0-0147-7000-8000-0000000000a1', code: '2E', manufacturer: 'Instrum', model: 'DMG10Ki', serial: 'IN1', cert_number: '37428/26', calibrated_at: null, valid_until: null, test_parameter: null };
    const micro = { ...megger, instrument_id: '019966b0-0147-7000-8000-0000000000a2', code: '3M', cert_number: '37276/26' };
    const { state, f } = ctaState();
    let next = state;
    for (const [key, header] of [
      [E2, megger],
      [E1, micro],
    ] as const) {
      next = applyOp(next, f.op({ path: `sheet/${CTA_BLOCK}/test/${key}/instrument`, value: header as unknown as JsonValue }));
    }
    const block = blockOf(next);
    const snapshot = { relatorio: ctaRelatorio(), instruments: [], blocks: [block], locations: [ctaLocal()], equipment: [ctaRows().equipment] };
    expect(section11Instruments(snapshot).map((row) => [row.code, row.cert_number])).toEqual([
      ['3M', '37276/26'],
      ['2E', '37428/26'],
    ]);
    const off: BlockRow = { ...block, config: { ...(block.config as object), sub_blocks: { ...(block.config as { sub_blocks: object }).sub_blocks, [E1]: { enabled: false } } } as JsonValue };
    expect(section11Instruments({ ...snapshot, blocks: [off] }).map((row) => row.code)).toEqual(['2E']);
    expect(CTA_EQUIPMENT).toBe(ctaRows().equipment.id);
  });
});

describe('contract 19: the examples carry the new family', () => {
  it('the valid push and pull examples hold a test value put that parses', () => {
    const values = (ops: readonly { path: string }[]) => ops.filter((op) => /^sheet\/[^/]+\/test\/[^/]+\/value\//.test(op.path));
    expect(values(contractExamples.pushRequest.valid.ops)).toHaveLength(1);
    expect(values(contractExamples.pullResponse.valid.ops)).toHaveLength(1);
    expect(syncPushBodySchema.safeParse(contractExamples.pushRequest.valid).success).toBe(true);
    expect(syncPullResponseSchema.safeParse(contractExamples.pullResponse.valid).success).toBe(true);
    for (const op of values(contractExamples.pushRequest.valid.ops)) expect(opSchema.safeParse(op).success).toBe(true);
  });
});
