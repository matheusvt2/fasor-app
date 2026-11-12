import {
  blockDefinitionIn,
  blockFieldPath,
  blockReadings,
  buildSnapshot,
  choiceValue,
  conclusionFloor,
  conclusionTextOnConclude,
  defaultBlockConfig,
  defaultBlockConfigIn,
  definitionContext,
  EMPTY_DEFINITION_CONTEXT,
  equipmentTypesOf,
  findDefinitionIn,
  getDefinition,
  instantiateTemplate,
  locationEnvPath,
  makeOp,
  recommendedPointText,
  relatorioSetupPath,
  replay,
  restrictionApplies,
  SECTION_BLOCK_TYPES,
  sheetChecklistPath,
  sheetConclusionPath,
  sheetNameplatePath,
  sheetObservationsPath,
  sheetPointFindings,
  sheetTestCellPath,
  sheetTestPath,
  sheetTestValuePath,
  snapshotDefinitionContext,
  visitContextOf,
  type BlockDefinition,
  type CompanyTypeDefinition,
  type DefinitionContext,
  type EquipmentBlockType,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type FieldDef,
  type JsonValue,
  type LastResults,
  type Op,
  type OpDraft,
  type RelatorioSnapshot,
  type TableDef,
  type TemplateBlock,
  type TemplateRow,
} from '../../src/index.ts';

/*
 * Story 23.2 (Epic 23 layout lock, taken on main a3b0ec0e after fix batch e23f): one synthetic
 * relatório per locked seed version (v5, v11, v12), each with one cabine holding one sheet of every
 * equipment type the version offers, its nameplate, checklist, instruments and readings filled by
 * rule from the definition. Bruno likes the current relatório, so the DOCX and the PDF text these
 * print are pinned (`apps/api/src/jobs/generate/golden/layout-lock-*`) and every later Epic 23 PR
 * keeps them byte-equal: only a v13 relatório may print something new.
 *
 * Every value is invented by rule (no client material, R-023 does not apply). Ids, op ids and
 * timestamps are fixed per version, so the three relatórios can sit in one company side by side.
 *
 * Story 24.2 (Epic 24 layout lock, taken on main after fix batches e24h and e24f): v13 joins the
 * lock. Its relatório is built by the same rule, plus what Epic 24 changes on v14, so each change
 * has its v13 pin (`epic24Extras`): stored conclusions (Reprovado by a reading out, Aprovado · Com
 * restrições by choice, Aprovado · Sem restrições with an observation), a second arrester whose
 * failed prerequisite stays stored while its nameplate is off, a previous visit (`last_results`)
 * with a contact rise out and an insulation drop restricted, an NC observation in two lines, a
 * company type's sheet with a reading out and a stored point holding its recommendation, and the
 * template's own Conclusão text with part of "nos itens 8 e 9" in bold. The v5, v11 and v12 ops
 * are those they were locked with, byte for byte: every addition is reached only through
 * `EPIC24_EXTRAS`. v14 takes the same additions (~~it is not locked~~: "24.2-UNIT-SAME" compares the
 * two with v14's rule flags read off, and the later stories print their v14 deltas from it: batch
 * e24a's in `e24a-v14-print.integration.test.ts`). 2026-11-11, batch e25b (coordinator's ask, Epic 24
 * deployed as 2009fa30, seed v14 frozen): v14 is locked too, its goldens taken from the product code of
 * 2009fa30 (main 928dad15) with this fixture as it stands (every type v14 offers); Story 25.5 keeps
 * them and adds its own second fixture.
 */

/** The seed versions whose printed layout is locked. */
export const LAYOUT_LOCK_VERSIONS = ['v5', 'v11', 'v12', 'v13', 'v14'] as const;
export type LayoutLockVersion = (typeof LAYOUT_LOCK_VERSIONS)[number];

/** The issue instant the DOCX golden renders with. */
export const LAYOUT_LOCK_ISSUED_AT = '2026-11-08T12:00:00.000Z';

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
const versionNumber = (version: string) => Number(version.slice(1));

/** Fixed entity ids per version: `019a6100-00VV-7000-8000-NNNNNNNNNNNN`. */
export const layoutLockId = (version: string, n: number): string => `019a6100-00${hex(versionNumber(version), 2)}-7000-8000-${hex(n, 12)}`;
/** Fixed op ids per version: `019a6100-01VV-7000-8000-NNNNNNNNNNNN`. */
const opId = (version: string, n: number): string => `019a6100-01${hex(versionNumber(version), 2)}-7000-8000-${hex(n, 12)}`;

export interface LayoutLockActor {
  companyId: string;
  actorId: string;
  deviceId: string;
}

const DEFAULT_ACTOR: LayoutLockActor = {
  companyId: '019a6100-0000-7000-8000-000000000001',
  actorId: '019a6100-0000-7000-8000-000000000002',
  deviceId: 'tablet-layout-lock',
};

const num = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });

/** The synthetic reading of a typed column: insulation in MΩ, contact in µΩ, the ratio's volts and readings. */
function readingOf(testKey: string, table: TableDef, col: number, row: number): string {
  const column = table.value_columns[col]!;
  if (testKey === 'isolacao') return String(2500 + row * 100);
  if (testKey === 'resistencia_contato') return String(40 + row * 3);
  if (column.role === 'input') return column.label.includes('PRIM') ? '13800' : '380';
  return '36';
}

/** The synthetic nameplate value of a field, by kind; a select takes its last option. */
function nameplateValueOf(field: FieldDef, n: number): JsonValue {
  switch (field.kind) {
    case 'text':
      return `SINT-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante Sintético';
    case 'number':
      return num(String(100 + n * 10), field.unit ?? null);
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options!.at(-1)!;
  }
}

function instrumentOf(version: string, testKey: string, n: number): JsonValue {
  return {
    instrument_id: layoutLockId(version, 900 + n),
    code: `IN-${n + 1}`,
    manufacturer: 'Instrumentos Sintéticos',
    model: testKey === 'isolacao' ? 'MEG-5' : testKey === 'resistencia_contato' ? 'MIC-1' : 'TTR-3',
    serial: `SN-${1000 + n}`,
    cert_number: `C-${200 + n}/26`,
    calibrated_at: '2026-06-01',
    // Far ahead, so no golden reads "vencido" on the day it renders.
    valid_until: '2099-12-31',
    test_parameter: testKey === 'isolacao' ? '5.000 V' : testKey === 'resistencia_contato' ? '100 A' : '80 V',
  };
}

/** The sheet writes of one equipment block, by rule from its definition. */
function sheetWrites(version: string, blockId: string, definition: BlockDefinition, sheetIndex: number): [string, JsonValue][] {
  const writes: [string, JsonValue][] = [];
  definition.nameplate.forEach((field, n) => writes.push([sheetNameplatePath(blockId, field.key), nameplateValueOf(field, n)]));
  (definition.checklist ?? []).forEach((item, n) => {
    // Every item C, the second NC with its first phrase, the third NA: the three marks print.
    const result = n === 1 ? 'NC' : n === 2 ? 'NA' : 'C';
    writes.push([sheetChecklistPath(blockId, item.key, 'result'), result]);
    if (result === 'NC') writes.push([sheetChecklistPath(blockId, item.key, 'observation'), item.nc_phrases[0]!]);
  });
  definition.tests.forEach((test, t) => {
    writes.push([sheetTestPath(blockId, test.key, 'instrument'), instrumentOf(version, test.key, sheetIndex * 4 + t)]);
    let offset = 0;
    for (const table of test.tables) {
      table.rows.forEach((_, r) => {
        table.value_columns.forEach((column, col) => {
          if (column.role !== 'capture' && column.role !== 'input') return;
          // The disjuntor's first insulation row reads below every criterion: an out row, its point and NC conclusion print.
          const out = definition.block_type === 'disjuntor_mt' && test.key === 'isolacao' && offset + r === 0;
          writes.push([sheetTestCellPath(blockId, test.key, offset + r, col), num(out ? '150' : readingOf(test.key, table, col, r), column.unit)]);
        });
      });
      offset += table.rows.length;
    }
  });
  if (sheetIndex % 3 === 0) writes.push([sheetObservationsPath(blockId), `Observação sintética da ficha ${sheetIndex + 1}.`]);
  return writes;
}

function templateOf(version: string, company: CompanyType | null = null, withoutTypes: readonly string[] = []): TemplateRow {
  const ref = 'cabine-sintetica';
  const blocks: TemplateBlock[] = [
    ...SECTION_BLOCK_TYPES.map((type) => ({ ...defaultBlockConfig(version, type), quantity: 1, skeleton_location_ref: null, section_text: null })),
    ...equipmentTypesOf(version)
      .filter((type) => !withoutTypes.includes(type))
      .map((type) => ({ ...defaultBlockConfig(version, type), quantity: 1, skeleton_location_ref: ref, section_text: null })),
  ];
  if (company !== null) {
    // Story 24.2: the template's own Conclusão text, a second arrester and the company type's sheet.
    for (const block of blocks) {
      if (block.block_type === 'section_10') block.section_text = OWN_CONCLUSAO_TEXT;
      if (block.block_type === 'para_raio') block.quantity = 2;
    }
    blocks.push({ ...defaultBlockConfigIn(company.ctx, version, company.blockType, { version: 1, id: company.versionId }), quantity: 1, skeleton_location_ref: ref, section_text: null });
  }
  return {
    id: layoutLockId(version, 3),
    name: 'Trava de layout',
    version: 1,
    seed_version: version,
    blocks,
    skeleton: [{ ref, kind: 'cabine', parent_ref: null, name: 'Subestação Sintética', agrupar_por_tipo: false }],
    archived_at: null,
    removed_at: null,
  };
}

export interface LayoutLockFixture {
  version: string;
  relatorioId: string;
  projectId: string;
  log: Op[];
  /** Story 24.2: the company-scoped rows the log creates outside its project and relatório (the company type's), to remove after a test. */
  companyEntityIds: string[];
}

/** The op log of the synthetic relatório of `version`: the project, the instantiated template, then every sheet write. */
/**
 * Story 24.2: `epic24: false` builds the v13 (or v14) relatório by the rule alone, as Story 23.2 built
 * every version: the base the kernel tests of Epic 23 write their own sheets into. The lock reads
 * the default, which carries the Epic 24 additions on v13 and v14 (`EPIC24_EXTRAS`).
 */
export interface LayoutLockOptions {
  epic24?: boolean;
  /**
   * Batch e24s (Story 24.13): types the template leaves out, so a v14 relatório compares with the v13 one sheet for
   * sheet without the No-break de comando v13 does not offer (24.2-UNIT-SAME). Absent: every type the version offers.
   */
  withoutTypes?: readonly string[];
}

export function layoutLockFixture(version: string, actor: LayoutLockActor = DEFAULT_ACTOR, options: LayoutLockOptions = {}): LayoutLockFixture {
  let ids = 10;
  const newId = () => layoutLockId(version, ids++);
  let ops = 0;
  const base = Date.parse('2026-11-08T09:00:00.000Z');
  const opOf = (draft: OpDraft): Op =>
    makeOp({ ...draft, device_id: actor.deviceId }, { newId: () => opId(version, ++ops), now: new Date(base + ops * 1000) });

  const projectId = layoutLockId(version, 4);
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: actor.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: `Obra sintética ${version}`, site: 'Rua Sintética, 100', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor.actorId,
  };
  const company = EPIC24_EXTRAS.has(version) && options.epic24 !== false ? companyTypeOf(version, actor) : null;
  const { relatorioId, drafts } = instantiateTemplate(
    templateOf(version, company, options.withoutTypes),
    { id: projectId },
    { service_start: '2026-11-03', service_end: '2026-11-04', existingEquipment: [], responsible_user_id: null, definitions: company?.ctx ?? EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId, actorId: actor.actorId, companyId: actor.companyId },
  );
  const log = [...(company?.drafts ?? []), project, ...drafts].map(opOf);

  const sheets = drafts
    .filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/'))
    .map((draft) => draft.value as unknown as SheetCreate)
    .filter((block) => block.equipment_id !== null);
  const relatorioOp = (kind: 'put' | 'create', path: string, value: JsonValue): OpDraft => ({
    kind,
    scope: 'relatorio',
    company_id: actor.companyId,
    project_id: null,
    relatorio_id: relatorioId,
    path,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor.actorId,
  });
  if (company === null) {
    sheets.forEach((block, n) => {
      const definition = getDefinition(version, 'cabine_primaria', block.block_type);
      for (const [path, value] of sheetWrites(version, block.id, definition, n)) {
        log.push(
          opOf({ kind: 'put', scope: 'relatorio', company_id: actor.companyId, project_id: null, relatorio_id: relatorioId, path, value, prev_op_id: null, batch_id: null, meta: null, actor_id: actor.actorId }),
        );
      }
    });
    return { version, relatorioId, projectId, log, companyEntityIds: [] };
  }

  // Story 24.2: the v13 (and v14) relatório, by the same rule plus the Epic 24 pins.
  const extras = epic24Extras(version, relatorioId, sheets, company, actor);
  sheets.forEach((block, n) => {
    const definition = findDefinitionIn(company.ctx, version, block.block_type, { version: 1, id: company.versionId })!;
    for (const [path, value] of extras.sheet(block, sheetWrites(version, block.id, definition, n))) log.push(opOf(relatorioOp('put', path, value)));
  });
  // The previous visit, as another relatório's issue job leaves it, from the readings this one holds now
  // (before any conclude, as a previous visit is there before the technician concludes).
  const snapshot = buildSnapshot(replay(log), relatorioId);
  for (const [equipmentId, value] of extras.previousVisit(snapshot)) {
    log.push(
      makeOp(
        {
          kind: 'put',
          scope: 'project',
          company_id: actor.companyId,
          project_id: projectId,
          relatorio_id: null,
          path: `equipment/${equipmentId}/last_results`,
          value: value as unknown as JsonValue,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: 'system:generate',
          device_id: 'server',
        },
        { newId: () => opId(version, ++ops), now: new Date(base + ops * 1000) },
      ),
    );
  }
  // The conclusions, each as "Concluir ficha" writes it (`use-ficha-actions.ts`): the pair, then the text the
  // kernel composes from the fichas as they stand (`conclusionTextOnConclude`), confirmed with its basis, then
  // `concluded_by`.
  for (const { blockId, result, restriction } of extras.conclusions) {
    log.push(opOf(relatorioOp('put', sheetConclusionPath(blockId, 'result'), result)));
    log.push(opOf(relatorioOp('put', sheetConclusionPath(blockId, 'restriction'), restriction)));
    const state = buildSnapshot(replay(log), relatorioId);
    const block = state.blocks.find((row) => row.id === blockId)!;
    const tag = state.equipment.find((row) => row.id === block.equipment_id)?.tag ?? '';
    const text = conclusionTextOnConclude(block, blockDefinitionIn(snapshotDefinitionContext(state), block)!, tag, visitContextOf(state, block));
    if (text !== null) {
      log.push(opOf({ ...relatorioOp('put', sheetConclusionPath(blockId, 'text'), text.text), meta: { composed: true } }));
      log.push(opOf(relatorioOp('put', sheetConclusionPath(blockId, 'text_status'), 'confirmed')));
      log.push(opOf(relatorioOp('put', sheetConclusionPath(blockId, 'text_basis'), text.basis)));
    }
    log.push(opOf(relatorioOp('put', blockFieldPath(blockId, 'concluded_by'), extras.concludedBy)));
  }
  for (const [path, value] of extras.after) log.push(opOf(relatorioOp('put', path, value)));
  log.push(opOf(relatorioOp('create', extras.point.path, extras.point.value)));
  return { version, relatorioId, projectId, log, companyEntityIds: [company.typeId, company.versionId] };
}

// --- Story 24.2: the v13 pins of what Epic 24 changes on v14 -------------------------------------

/** The versions whose fixture carries the Epic 24 additions: v13 (locked) and v14 (compared with it). */
const EPIC24_EXTRAS: ReadonlySet<string> = new Set(['v13', 'v14']);

interface SheetCreate {
  id: string;
  block_type: string;
  equipment_id: string | null;
  config: Record<string, unknown>;
}

/**
 * The template's own Conclusão text (Story 11.4's markup): the seed's three items with FO.SERV-03's
 * fixed "nos itens 8 e 9", its numbers in bold, so the reference is split across formatted runs.
 */
const OWN_CONCLUSAO_TEXT = [
  '- Foram realizados os ensaios elétricos e mecânicos (acionamentos) nos equipamentos pertinentes às Subestações de Proteção (Primária), Distribuição e de Transformação;',
  '- Todos os resultados dos testes aplicados nos equipamentos das subestações e as observações e particularidades pertinentes a cada equipamento objeto desta manutenção preventiva encontram-se nos itens **8 e 9** deste relatório;',
  '- Apesar dos resultados dos testes serem positivos para a continuidade de operação das SE’s, sugerimos que as observações dos relatórios e dos pontos críticos constantes nos itens **8 e 9** deste sejam atendidas.',
].join('\n');

const RECOMMENDATION = 'Ajustar a tensão de saída do retificador';

/** The synthetic company type: a rectifier with two measured voltages judged by one band, and a recommendation when it fails. */
const COMPANY_DEFINITION: CompanyTypeDefinition = {
  label: 'Retificador sintético',
  tag_prefix: 'RT',
  noun: { singular: 'retificador', plural: 'retificadores', gender: 'm' },
  nameplate: [
    { key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' },
    { key: 'modelo', label: 'MODELO', kind: 'text' },
  ],
  checklist: [
    { key: 'limpeza_e_fixacao', label: 'Limpeza e fixação do gabinete', nc_phrases: ['Gabinete sujo', 'Fixação solta', 'Corrosão aparente'] },
    { key: 'bornes', label: 'Bornes e conexões', nc_phrases: ['Bornes oxidados', 'Conexão frouxa', 'Isolação danificada'] },
  ],
  tests: [],
  measurement_tests: [
    {
      key: 'tensoes_medidas',
      label: 'Tensões medidas',
      row_header: 'Medição',
      columns: [{ key: 'valor', label: 'Valor medido', kind: 'number', unit: 'Vcc' }],
      rows: [
        { key: 'saida', label: 'Tensão de saída' },
        { key: 'flutuacao', label: 'Tensão de flutuação' },
      ],
      criteria: [{ type: 'absolute', seeded: 'tensao_saida', rows: ['saida', 'flutuacao'], source: { name: 'Manual do fabricante', edition: 'rev. 1' } }],
      recommendation: RECOMMENDATION,
    },
  ],
  criteria: [
    { key: 'tensao_saida', label: 'Tensão de saída', operator: 'between', value: 118, value_max: 132, unit: 'Vcc', type: 'deviation_between', source: { name: 'Manual do fabricante', edition: 'rev. 1' } },
  ],
};

interface CompanyType {
  typeId: string;
  versionId: string;
  blockType: `type:${string}`;
  ctx: DefinitionContext;
  /** The type's create and its published version's create, before the relatório. */
  drafts: OpDraft[];
}

function companyTypeOf(version: string, actor: LayoutLockActor): CompanyType {
  const typeId = layoutLockId(version, 700);
  const versionId = layoutLockId(version, 701);
  const typeRow: EquipmentTypeRow = { id: typeId, derived_from: { seed_version: version, block_type: 'quadro_eletrico' }, draft: null, retired_at: null, removed_at: null, latest_version: 0 };
  const versionRow: EquipmentTypeVersionRow = {
    id: versionId,
    type_id: typeId,
    version: 1,
    definition: COMPANY_DEFINITION,
    published_by: actor.actorId,
    published_at: '2026-11-01T12:00:00.000Z',
  };
  const companyDraft = (path: string, value: unknown): OpDraft => ({
    kind: 'create',
    scope: 'company',
    company_id: actor.companyId,
    project_id: null,
    relatorio_id: null,
    path,
    value: value as JsonValue,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor.actorId,
  });
  return {
    typeId,
    versionId,
    blockType: `type:${typeId}`,
    ctx: definitionContext([versionRow], [{ ...typeRow, latest_version: 1 }]),
    drafts: [companyDraft(`equipment_type/${typeId}`, typeRow), companyDraft(`equipment_type_version/${versionId}`, versionRow)],
  };
}

type LastReading = LastResults['readings'][string];

/** A previous reading of the same equipment, scaled by `factor` (its 20 °C value too, when it has one). */
function scaledReading(reading: LastReading, factor: number): LastReading {
  const scale = (raw: string) => String(Math.round(Number(raw) * factor * 100) / 100);
  return reading.corrected === undefined
    ? { ...reading, raw: scale(reading.raw) }
    : { ...reading, raw: scale(reading.raw), corrected: { ...reading.corrected, raw: scale(reading.corrected.raw) } };
}

/**
 * The Epic 24 additions of a v13 (and v14) relatório: per sheet, its by-rule writes amended; the
 * previous visit's readings of three equipment, read from the snapshot the writes give; the fichas
 * concluded; the second arrester's switch; and the stored point.
 */
function epic24Extras(version: string, relatorioId: string, sheets: readonly SheetCreate[], company: CompanyType, actor: LayoutLockActor) {
  const first = (type: string) => sheets.find((block) => block.block_type === type)!;
  const disjuntor = first('disjuntor_mt');
  const arrester = sheets.filter((block) => block.block_type === 'para_raio')[1]!;
  const chosen = first('tc');
  const clean = first('tp');
  const twoLines = first('cabos_entrada');
  const companySheet = first(company.blockType);
  const transformer = first('transformador_forca');
  const seccionadora = first('chave_seccionadora');
  const concludedBy: JsonValue = { actor_id: actor.actorId, at: '2026-11-04T17:00:00.000Z' };
  const pointId = layoutLockId(version, 702);
  const point: JsonValue = {
    id: pointId,
    relatorio_id: relatorioId,
    // Story 23.11's form: the test's recommendation first, then the reading the point was written from.
    text: recommendedPointText(RECOMMENDATION, 'Tensões medidas: 110 Vcc em Tensão de saída (critério: 118 a 132 Vcc)'),
    equipment_id: companySheet.equipment_id,
    origin: 'reading',
    order_key: 'a0',
    removed_at: null,
    action: null,
    priority: null,
    deadline: null,
    owner: null,
    test_key: 'tensoes_medidas',
  };
  return {
    /** One sheet's by-rule writes, amended where this sheet pins a change. */
    sheet(block: SheetCreate, writes: [string, JsonValue][]): [string, JsonValue][] {
      if (block.id === chosen.id || block.id === clean.id) {
        // No NC row, so the stored pair alone says Com restrições (by choice) or Sem restrições (with an observation).
        const nc = new Set(writes.filter(([path, value]) => value === 'NC' && path.endsWith('/result')).map(([path]) => path.slice(0, -'/result'.length)));
        const amended = writes
          .filter(([path]) => !(path.endsWith('/observation') && nc.has(path.slice(0, -'/observation'.length))))
          .filter(([path]) => path !== sheetObservationsPath(block.id))
          .map(([path, value]): [string, JsonValue] => (value === 'NC' && path.endsWith('/result') ? [path, 'C'] : [path, value]));
        if (block.id === chosen.id) return [...amended, [sheetObservationsPath(block.id), 'Com restrições por escolha do técnico: acompanhar o aquecimento do secundário.']];
        // Aprovado · Sem restrições with text in OBSERVAÇÕES and in a conforming row's observation (H9: neither floors anything).
        const firstItem = amended.find(([path, value]) => path.includes('/checklist/') && path.endsWith('/result') && value === 'C')![0].slice(0, -'/result'.length);
        return [...amended, [`${firstItem}/observation`, 'Comentário sintético em item conforme.'], [sheetObservationsPath(block.id), 'Observação sintética que não muda a conclusão.']];
      }
      if (block.id === twoLines.id) {
        // The NC observation typed in two lines.
        return writes.map(([path, value]): [string, JsonValue] =>
          path.includes('/checklist/') && path.endsWith('/observation') ? [path, `${String(value)}\nVerificar na próxima visita`] : [path, value],
        );
      }
      if (block.id === companySheet.id) {
        // The output voltage out of its band, the floating one within.
        return [...writes, [sheetTestCellPath(block.id, 'tensoes_medidas', 0, 0), num('110', 'Vcc')], [sheetTestCellPath(block.id, 'tensoes_medidas', 1, 0), num('125', 'Vcc')]];
      }
      if (block.id === arrester.id) {
        // Readings within its criterion, so the second arrester is Reprovado by its failed prerequisite alone.
        return writes.map(([path, value]): [string, JsonValue] => {
          const cell = /\/test\/isolacao\/cell\/(\d+)\/\d+$/.exec(path);
          return cell === null ? [path, value] : [path, { ...(value as Record<string, JsonValue>), raw: String(6000 + Number(cell[1]) * 100) }];
        });
      }
      if (block.id === disjuntor.id) {
        // The first insulation row below the v13 criterion (≥ 5.000 MΩ; the v13 column reads GΩ): Reprovado by a reading out.
        const out = sheetTestCellPath(block.id, 'isolacao', 0, 0);
        return writes.map(([path, value]): [string, JsonValue] => (path === out ? [path, num('1', 'GΩ')] : [path, value]));
      }
      if (block.id === transformer.id) {
        // An oil and a winding temperature the 20 °C correction reads, so the previous visit's drop is judged on corrected values.
        const temperatures = new Map([
          [sheetNameplatePath(block.id, 'temperatura_oleo_c'), num('40', '°C')],
          [sheetNameplatePath(block.id, 'temperatura_enrolamento_c'), num('45', '°C')],
        ]);
        // The winding resistance at the current tap and on BT, the three phases within 1 % of each other.
        const cells: [string, JsonValue][] = [];
        for (const [row, raw, unit] of [
          [0, 1.2, 'Ω'],
          [3, 3.1, 'mΩ'],
        ] as const) {
          [0, 0.005, 0.01].forEach((step, col) => cells.push([sheetTestCellPath(block.id, 'resistencia_enrolamento', row, col), num(String(Math.round(raw * (1 + step) * 1000) / 1000), unit)]));
        }
        return [...writes.map(([path, value]): [string, JsonValue] => [path, temperatures.get(path) ?? value]), ...cells];
      }
      return writes;
    },
    /**
     * The fichas concluded, in order, each with the pair stored before its conclude (as the conclude batch
     * writes the effective pair): Reprovado by a reading out, Aprovado · Com restrições by choice, Aprovado ·
     * Sem restrições with observations, the NC row in two lines, and the second arrester by its prerequisite.
     */
    conclusions: [
      { blockId: disjuntor.id, result: 'reprovado', restriction: 'com_restricoes' },
      { blockId: chosen.id, result: 'aprovado', restriction: 'com_restricoes' },
      { blockId: clean.id, result: 'aprovado', restriction: 'sem_restricoes' },
      { blockId: twoLines.id, result: 'aprovado', restriction: 'com_restricoes' },
      { blockId: arrester.id, result: 'reprovado', restriction: 'com_restricoes' },
    ] as const,
    concludedBy,
    /** After the conclusions: the second arrester's plate switched off after its own conclude. */
    after: [
      [blockFieldPath(arrester.id, 'config'), { ...arrester.config, sub_blocks: { ...(arrester.config.sub_blocks as Record<string, JsonValue>), nameplate: { enabled: false } } } as JsonValue],
    ] as [string, JsonValue][],
    /** The stored point of the company sheet (a create). */
    point: { path: `point/${pointId}`, value: point },
    /** The previous visit: the transformer's insulation dropped (restricted), the seccionadora's contact risen (out), the rest as it was. */
    previousVisit(snapshot: RelatorioSnapshot): [string, LastResults][] {
      const ctx = snapshotDefinitionContext(snapshot);
      const entry = (blockId: string, factorOf: (key: string) => number): [string, LastResults] => {
        const block = snapshot.blocks.find((row) => row.id === blockId)!;
        const readings = blockReadings(block, blockDefinitionIn(ctx, block)!, visitContextOf(snapshot, block));
        const previous = Object.fromEntries(Object.entries(readings).map(([key, reading]) => [key, scaledReading(reading, factorOf(key))]));
        return [
          block.equipment_id!,
          { relatorio_id: layoutLockId(version, 800), revision_number: 1, issued_at: '2025-11-05T12:00:00.000Z', seed_version: version, block_type: block.block_type, readings: previous, prior: null },
        ];
      };
      return [
        entry(transformer.id, (key) => (key.startsWith('isolacao|') ? 3 : 1)),
        entry(seccionadora.id, (key) => (key.startsWith('resistencia_contato|') ? 0.5 : 1)),
        entry(disjuntor.id, () => 1),
      ];
    },
  };
}

/** The snapshot the renderer reads for the synthetic relatório of `version`. */
export function layoutLockSnapshot(version: string, options: LayoutLockOptions = {}): RelatorioSnapshot {
  const fixture = layoutLockFixture(version, DEFAULT_ACTOR, options);
  return buildSnapshot(replay(fixture.log), fixture.relatorioId);
}

// --- Story 25.5: the second v14 fixture, the cases Epic 25 changes on v15 -------------------------

/*
 * Story 25.5 (Epic 25 layout lock, batch e25c, 2026-11-12): the first v14 golden (PR #325, taken from
 * the product code deployed as 2009fa30) stays byte-equal. This second synthetic v14 relatório holds,
 * one sheet each, the cases the later Epic 25 stories change on v15, so every one of them has its v14
 * pin before any rule moves. Its golden (`golden/layout-lock-v14-epic25`) is taken once, from code that
 * changes no rule (Story 25.5's own), and every later Epic 25 PR keeps it byte-equal:
 *   - Story 25.6: a cabos de entrada whose every reading is "Não medido", concluded Aprovado;
 *   - Story 25.7: a cabos de saída the technician reproved over readings within their criteria, and a
 *     seccionadora with its insulation measured and its contact left "Não medido", each concluded with
 *     its confirmed text;
 *   - Story 25.8: a breaker whose contact rose exactly 50 % since the previous visit;
 *   - Story 25.9: a TP whose third phase is "Não medido";
 *   - Story 25.10: a stored point written from a test with three readings out of its criterion (the
 *     text and action the kernel offers today, `sheetPointFindings`);
 *   - Story 25.15: three arresters' thermography, measured on its four points in load, one with
 *     "Equipamento em carga" Não, and one left unanswered;
 *   - Stories 25.16 and 25.17: the Malha de aterramento with its five continuity rows, a No-break de comando;
 *   - Stories 25.18 and 25.19: a TC and an oil transformer with every item answered, and a transformer of
 *     each TIPO DE ISOLAÇÃO (ÓLEO ISOLANTE, EPÓXI, Á SECO);
 *   - Story 25.20: the oil transformer's winding-resistance table, the breaker's paired insulation tables
 *     corrected to 20 °C (the cabine's ambient), and a company type's table with a "nominal ± %" row, each
 *     with a previous visit;
 *   - Story 25.21: the oil transformer's second visit, whose note line names more than three cells;
 *   - Story 25.22: Etapa 2's Local and the obra's site filled, an exclusion naming the relays, a blank ART,
 *     and the TP's and the TC's ratio tables.
 * Every value is invented by rule (R-023 does not apply). The same builder runs on v15 for
 * "25.5-UNIT-SAME": a v15 relatório with the same answers concludes and prints as the v14 one.
 */

/** The seed versions whose Epic 25 fixture is locked (its golden directory: `layoutLockEpic25Golden`). */
export const LAYOUT_LOCK_EPIC25_VERSIONS = ['v14'] as const;

/** The golden directory of a version's Epic 25 fixture, beside `layout-lock-{version}`. */
export const layoutLockEpic25Golden = (version: string): string => `layout-lock-${version}-epic25`;

/** Fixed entity ids of the Epic 25 fixture: `019a6100-02VV-7000-8000-NNNNNNNNNNNN`. */
const epic25Id = (version: string, n: number): string => `019a6100-02${hex(versionNumber(version), 2)}-7000-8000-${hex(n, 12)}`;
/** Fixed op ids of the Epic 25 fixture: `019a6100-03VV-7000-8000-NNNNNNNNNNNN`. */
const epic25OpId = (version: string, n: number): string => `019a6100-03${hex(versionNumber(version), 2)}-7000-8000-${hex(n, 12)}`;

/** The equipment the Epic 25 template places, in order, with how many of each. */
const EPIC25_BLOCKS: readonly [EquipmentBlockType, number][] = [
  ['cabos_entrada', 1],
  ['para_raio', 3],
  ['chave_seccionadora', 1],
  ['disjuntor_mt', 2],
  ['tp', 1],
  ['tc', 1],
  ['cabos_saida', 1],
  ['transformador_forca', 3],
  ['malha_aterramento', 1],
  ['no_break_comando', 1],
];

/** The synthetic company type of the Epic 25 fixture: a rectifier whose output voltage is judged "nominal ± %". */
const EPIC25_COMPANY_DEFINITION: CompanyTypeDefinition = {
  ...COMPANY_DEFINITION,
  label: 'Retificador nominal sintético',
  tag_prefix: 'RN',
  measurement_tests: [
    {
      ...COMPANY_DEFINITION.measurement_tests![0]!,
      criteria: [
        { type: 'absolute', seeded: 'tensao_nominal_saida', rows: ['saida'], source: { name: 'Manual do fabricante', edition: 'rev. 2' } },
        { type: 'absolute', seeded: 'tensao_saida', rows: ['flutuacao'], source: { name: 'Manual do fabricante', edition: 'rev. 1' } },
      ],
    },
  ],
  criteria: [
    ...COMPANY_DEFINITION.criteria,
    { key: 'tensao_nominal_saida', label: 'Tensão nominal de saída', operator: 'nominal_pct', value: 125, tolerance_pct: 5, unit: 'Vcc', type: 'deviation_between', source: { name: 'Manual do fabricante', edition: 'rev. 2' } },
  ],
};

const notMeasured = (unit: string | null): JsonValue => ({ raw: '', unit, state: 'not_measured' });

/** A measurement test's column index by key, so a cell is addressed as the sheet addresses it. */
function columnOf(definition: BlockDefinition, testKey: string, columnKey: string): number {
  return definition.measurement_tests!.find((test) => test.key === testKey)!.columns.findIndex((column) => column.key === columnKey);
}

/** The by-rule writes of one sheet with every capture cell of `testKey` (rows `rows`, or all) written "Não medido". */
function withNotMeasured(writes: [string, JsonValue][], blockId: string, testKey: string, rows: ReadonlySet<number> | null = null): [string, JsonValue][] {
  const cell = new RegExp(`^${sheetTestCellPath(blockId, testKey, 0, 0).replace(/\/0\/0$/, '')}/(\\d+)/\\d+$`);
  return writes.map(([path, value]): [string, JsonValue] => {
    const match = cell.exec(path);
    if (match === null || (rows !== null && !rows.has(Number(match[1])))) return [path, value];
    return [path, notMeasured((value as { unit: string | null }).unit)];
  });
}

/** The by-rule writes with every checklist row Conforme and no OBSERVAÇÕES (a sheet whose verdict is its readings alone). */
function allConforming(writes: [string, JsonValue][], blockId: string): [string, JsonValue][] {
  return writes
    .filter(([path]) => !(path.includes('/checklist/') && path.endsWith('/observation')))
    .filter(([path]) => path !== sheetObservationsPath(blockId))
    .map(([path, value]): [string, JsonValue] => (path.includes('/checklist/') && path.endsWith('/result') && value !== 'C' ? [path, 'C'] : [path, value]));
}

/** The op log of the Epic 25 synthetic relatório of `version` (v14 locked; v15 compared with it). */
export function layoutLockEpic25Fixture(version: string, actor: LayoutLockActor = DEFAULT_ACTOR): LayoutLockFixture {
  let ids = 10;
  const newId = () => epic25Id(version, ids++);
  let ops = 0;
  const base = Date.parse('2026-11-12T09:00:00.000Z');
  const nextOp = () => ({ newId: () => epic25OpId(version, ++ops), now: new Date(base + ops * 1000) });
  const opOf = (draft: OpDraft): Op => makeOp({ ...draft, device_id: actor.deviceId }, nextOp());

  // The company type, its published version and its context.
  const typeId = epic25Id(version, 700);
  const versionId = epic25Id(version, 701);
  const typeRow: EquipmentTypeRow = { id: typeId, derived_from: { seed_version: version, block_type: 'quadro_eletrico' }, draft: null, retired_at: null, removed_at: null, latest_version: 0 };
  const versionRow: EquipmentTypeVersionRow = { id: versionId, type_id: typeId, version: 1, definition: EPIC25_COMPANY_DEFINITION, published_by: actor.actorId, published_at: '2026-11-01T12:00:00.000Z' };
  const ctx = definitionContext([versionRow], [{ ...typeRow, latest_version: 1 }]);
  const companyBlockType = `type:${typeId}` as const;
  const companyDraft = (path: string, value: unknown): OpDraft => ({
    kind: 'create',
    scope: 'company',
    company_id: actor.companyId,
    project_id: null,
    relatorio_id: null,
    path,
    value: value as JsonValue,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor.actorId,
  });

  const projectId = epic25Id(version, 4);
  const project = companyDraft(`project/${projectId}`, { id: projectId, client_id: null, name: `Obra sintética ${version} das regras novas`, site: 'Avenida Sintética, 250', removed_at: null });
  const ref = 'cabine-regras';
  const template: TemplateRow = {
    id: epic25Id(version, 3),
    name: 'Trava de layout das regras novas',
    version: 1,
    seed_version: version,
    blocks: [
      ...SECTION_BLOCK_TYPES.map((type) => ({ ...defaultBlockConfig(version, type), quantity: 1, skeleton_location_ref: null, section_text: null })),
      ...EPIC25_BLOCKS.map(([type, quantity]) => ({ ...defaultBlockConfig(version, type), quantity, skeleton_location_ref: ref, section_text: null })),
      { ...defaultBlockConfigIn(ctx, version, companyBlockType, { version: 1, id: versionId }), quantity: 1, skeleton_location_ref: ref, section_text: null },
    ],
    skeleton: [{ ref, kind: 'cabine', parent_ref: null, name: 'Subestação das Regras', agrupar_por_tipo: false }],
    archived_at: null,
    removed_at: null,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: projectId },
    { service_start: '2026-11-10', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: ctx, tagRule: 'legacy' },
    { newId, actorId: actor.actorId, companyId: actor.companyId },
  );
  const log = [companyDraft(`equipment_type/${typeId}`, typeRow), companyDraft(`equipment_type_version/${versionId}`, versionRow), project, ...drafts].map(opOf);
  const put = (path: string, value: JsonValue, meta: OpDraft['meta'] = null): void => {
    log.push(opOf({ kind: 'put', scope: 'relatorio', company_id: actor.companyId, project_id: null, relatorio_id: relatorioId, path, value, prev_op_id: null, batch_id: null, meta, actor_id: actor.actorId }));
  };

  const sheets = drafts
    .filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/'))
    .map((draft) => draft.value as unknown as SheetCreate)
    .filter((block) => block.equipment_id !== null);
  const all = (type: string) => sheets.filter((block) => block.block_type === type);
  const [noMeasure] = all('cabos_entrada');
  const [thermoInLoad, thermoOff, thermoUnanswered] = all('para_raio');
  const [partly] = all('chave_seccionadora');
  const [rise, threeOut] = all('disjuntor_mt');
  const [tp] = all('tp');
  const [byHand] = all('cabos_saida');
  const [oil, epoxy, dry] = all('transformador_forca');
  const [grid] = all('malha_aterramento');
  const [company] = all(companyBlockType);
  const definitionOf = (block: SheetCreate) => findDefinitionIn(ctx, version, block.block_type, { version: 1, id: versionId })!;

  // --- each sheet's answers: the by-rule writes, amended where the sheet pins a case ---
  sheets.forEach((block, n) => {
    const definition = definitionOf(block);
    let writes = sheetWrites(version, block.id, definition, n);
    if (block.id === noMeasure!.id) writes = withNotMeasured(allConforming(writes, block.id), block.id, 'isolacao');
    if (block.id === partly!.id) writes = withNotMeasured(writes, block.id, 'resistencia_contato');
    if (block.id === tp!.id) writes = withNotMeasured(withNotMeasured(writes, block.id, 'isolacao', new Set([2])), block.id, 'relacao_transformacao', new Set([2]));
    if (block.id === byHand!.id) writes = [...writes.filter(([path]) => path !== sheetObservationsPath(block.id)), [sheetObservationsPath(block.id), 'Reprovado pelo técnico: isolação dentro do critério, mas o terminal apresenta trinca.']];
    if (block.id === rise!.id) {
      // Every contact reading 45 µΩ, the previous visit's 30 µΩ: a rise of exactly 50 %. The insulation within its criterion.
      writes = writes.map(([path, value]): [string, JsonValue] => {
        if (/\/test\/resistencia_contato\/cell\//.test(path)) return [path, num('45', 'µΩ')];
        if (/\/test\/isolacao\/cell\//.test(path) && (value as { state?: string }).state === 'measured' && (value as { unit?: string }).unit === 'GΩ') return [path, num('12', 'GΩ')];
        return [path, value];
      });
    }
    if (block.id === threeOut!.id) {
      // The first three insulation rows below the criterion (≥ 5.000 MΩ, the column in GΩ): one test, three readings out.
      writes = writes.map(([path, value]): [string, JsonValue] => {
        const cell = /\/test\/isolacao\/cell\/(\d+)\/0$/.exec(path);
        return cell !== null && Number(cell[1]) < 3 ? [path, num(String(0.5 + Number(cell[1]) * 0.5), 'GΩ')] : [path, value];
      });
    }
    if (block.id === epoxy!.id || block.id === dry!.id) {
      const kind = block.id === epoxy!.id ? 'EPÓXI' : 'Á SECO';
      writes = writes.map(([path, value]): [string, JsonValue] => (path === sheetNameplatePath(block.id, 'tipo_de_isolacao') ? [path, kind] : [path, value]));
    }
    if (block.id === oil!.id) {
      // The oil transformer: its oil and winding temperatures, and the winding resistance on its four rows.
      const temperatures = new Map([
        [sheetNameplatePath(block.id, 'temperatura_oleo_c'), num('40', '°C')],
        [sheetNameplatePath(block.id, 'temperatura_enrolamento_c'), num('45', '°C')],
      ]);
      writes = writes.map(([path, value]): [string, JsonValue] => [path, temperatures.get(path) ?? value]);
      for (const [row, raw, unit] of [
        [0, 1.2, 'Ω'],
        [1, 1.25, 'Ω'],
        [2, 1.15, 'Ω'],
        [3, 3.1, 'mΩ'],
      ] as const) {
        [0, 0.005, 0.01].forEach((step, col) => writes.push([sheetTestCellPath(block.id, 'resistencia_enrolamento', row, col), num(String(Math.round(raw * (1 + step) * 1000) / 1000), unit)]));
      }
    }
    for (const [path, value] of writes) put(path, value);
  });

  // The thermography of the three arresters: in load and measured on its four points, out of load, unanswered.
  const thermo = definitionOf(thermoInLoad!);
  put(sheetTestValuePath(thermoInLoad!.id, 'termografia', 'em_carga'), choiceValue('sim'));
  thermo.measurement_tests!.find((test) => test.key === 'termografia')!.rows.forEach((_, row) => {
    put(sheetTestCellPath(thermoInLoad!.id, 'termografia', row, columnOf(thermo, 'termografia', 'delta_t_similares')), num(String(1 + row), '°C'));
    put(sheetTestCellPath(thermoInLoad!.id, 'termografia', row, columnOf(thermo, 'termografia', 'delta_t_ambiente')), num(String(4 + row * 2), '°C'));
  });
  put(sheetTestValuePath(thermoOff!.id, 'termografia', 'em_carga'), choiceValue('nao'));
  void thermoUnanswered;

  // The Malha de aterramento: its resistance and its five continuity rows.
  const malha = definitionOf(grid!);
  put(sheetTestCellPath(grid!.id, 'resistencia_malha', 0, columnOf(malha, 'resistencia_malha', 'resistencia')), num('4.2', 'Ω'));
  malha.measurement_tests!.find((test) => test.key === 'continuidade_malha')!.rows.forEach((_, row) => {
    put(sheetTestCellPath(grid!.id, 'continuidade_malha', row, columnOf(malha, 'continuidade_malha', 'resistencia')), num(String(0.1 + row * 0.05), 'Ω'));
  });

  // The company sheet: its output at 127 Vcc (125 ± 5 %), its floating voltage at 125 Vcc.
  put(sheetTestCellPath(company!.id, 'tensoes_medidas', 0, 0), num('127', 'Vcc'));
  put(sheetTestCellPath(company!.id, 'tensoes_medidas', 1, 0), num('125', 'Vcc'));

  // The cabine's ambient temperature, so the breaker's and the seccionadora's insulation print at 20 °C beside the reading.
  const cabine = buildSnapshot(replay(log), relatorioId).locations.find((row) => row.kind === 'cabine')!;
  put(locationEnvPath(cabine.id, 'temperature_c'), num('30', '°C'));

  // Etapa 2: the Local beside the obra's site, an exclusion naming the relays; the ART left blank.
  put(relatorioSetupPath('local'), 'Galpão de utilidades');
  put(relatorioSetupPath('exclusions'), ['Quadros elétricos terminais, localizados nos respectivos setores;', 'Ensaios dos relés de proteção, executados por terceiros.']);

  // --- the previous visit, as another relatório's issue job leaves it, from the readings this one holds now ---
  const snapshot = buildSnapshot(replay(log), relatorioId);
  const ctxNow = snapshotDefinitionContext(snapshot);
  const previous = (block: SheetCreate, reading: (key: string, value: LastReading) => LastReading): [string, LastResults] => {
    const row = snapshot.blocks.find((one) => one.id === block.id)!;
    const readings = blockReadings(row, blockDefinitionIn(ctxNow, row)!, visitContextOf(snapshot, row));
    return [
      row.equipment_id!,
      {
        relatorio_id: epic25Id(version, 800),
        revision_number: 1,
        issued_at: '2025-11-06T12:00:00.000Z',
        seed_version: version,
        block_type: row.block_type,
        readings: Object.fromEntries(Object.entries(readings).map(([key, value]) => [key, reading(key, value)])),
        prior: null,
      },
    ];
  };
  const visits: [string, LastResults][] = [
    // Story 25.8: the contact 30 µΩ then, 45 µΩ now; the insulation as it was.
    previous(rise!, (key, value) => (key.startsWith('resistencia_contato|') ? { ...value, raw: '30' } : value)),
    // Stories 25.20 and 25.21: the oil transformer's insulation three times higher then, its winding 20 % lower: many cells named.
    previous(oil!, (key, value) => (key.startsWith('isolacao|') ? scaledReading(value, 3) : key.startsWith('resistencia_enrolamento|') ? scaledReading(value, 0.8) : value)),
    // Story 25.20: the company sheet's output and floating voltages 10 % lower then.
    previous(company!, (_key, value) => scaledReading(value, 0.9)),
  ];
  for (const [equipmentId, value] of visits) {
    log.push(
      makeOp(
        {
          kind: 'put',
          scope: 'project',
          company_id: actor.companyId,
          project_id: projectId,
          relatorio_id: null,
          path: `equipment/${equipmentId}/last_results`,
          value: value as unknown as JsonValue,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: 'system:generate',
          device_id: 'server',
        },
        nextOp(),
      ),
    );
  }

  // --- the conclusions, each as "Concluir ficha" writes it: the pair (its restriction as the floor and the seed give it),
  // the text the kernel composes, confirmed with its basis, then `concluded_by` ---
  const concludedBy: JsonValue = { actor_id: actor.actorId, at: '2026-11-11T17:00:00.000Z' };
  for (const [block, result] of [
    [noMeasure!, 'aprovado'],
    [byHand!, 'reprovado'],
    [partly!, 'aprovado'],
  ] as const) {
    const state = buildSnapshot(replay(log), relatorioId);
    const row = state.blocks.find((one) => one.id === block.id)!;
    const definition = blockDefinitionIn(snapshotDefinitionContext(state), row)!;
    const visit = visitContextOf(state, row);
    const restriction = restrictionApplies(row, result) ? (conclusionFloor(row, definition, visit)?.pair.restriction ?? 'sem_restricoes') : null;
    put(sheetConclusionPath(block.id, 'result'), result);
    put(sheetConclusionPath(block.id, 'restriction'), restriction);
    const after = buildSnapshot(replay(log), relatorioId);
    const concluded = after.blocks.find((one) => one.id === block.id)!;
    const tag = after.equipment.find((one) => one.id === concluded.equipment_id)?.tag ?? '';
    const text = conclusionTextOnConclude(concluded, blockDefinitionIn(snapshotDefinitionContext(after), concluded)!, tag, visitContextOf(after, concluded));
    if (text !== null) {
      put(sheetConclusionPath(block.id, 'text'), text.text, { composed: true });
      put(sheetConclusionPath(block.id, 'text_status'), 'confirmed');
      put(sheetConclusionPath(block.id, 'text_basis'), text.basis);
    }
    put(blockFieldPath(block.id, 'concluded_by'), concludedBy);
  }

  // Story 25.10: the point the breaker's insulation finding offers today, stored as its editor closes.
  const state = buildSnapshot(replay(log), relatorioId);
  const finding = sheetPointFindings(state, threeOut!.id).find((one) => one.origin === 'reading' && one.testKey === 'isolacao')!;
  const pointId = epic25Id(version, 702);
  log.push(
    opOf({
      kind: 'create',
      scope: 'relatorio',
      company_id: actor.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: `point/${pointId}`,
      value: {
        id: pointId,
        relatorio_id: relatorioId,
        text: finding.text,
        equipment_id: threeOut!.equipment_id,
        origin: 'reading',
        order_key: 'a0',
        removed_at: null,
        action: finding.action === '' ? null : finding.action,
        priority: null,
        deadline: null,
        owner: null,
        test_key: 'isolacao',
      },
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: actor.actorId,
    }),
  );
  return { version, relatorioId, projectId, log, companyEntityIds: [typeId, versionId] };
}

/** The snapshot the renderer reads for the Epic 25 synthetic relatório of `version`. */
export function layoutLockEpic25Snapshot(version: string): RelatorioSnapshot {
  const fixture = layoutLockEpic25Fixture(version);
  return buildSnapshot(replay(fixture.log), fixture.relatorioId);
}
