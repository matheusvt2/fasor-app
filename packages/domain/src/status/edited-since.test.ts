import { describe, expect, it } from 'vitest';
import { FAMILIES, opPathSchema, type PathFamily } from '../ops/path.ts';
import { idSequence, TEST_USER } from '../test-support.ts';
import {
  countsAsEdit,
  countsAsFieldContent,
  editedOnDevice,
  editedSince,
  EDITED_SINCE_FAMILIES,
  inRelatorioStream,
  NEVER_EDIT_FAMILIES,
  referencedEquipmentIds,
  relatorioEditedSince,
  type EditCandidate,
  type StreamCandidate,
} from './edited-since.ts';

/*
 * Test 1.6-UNIT-001, second half (P1, risk R-015): AD-15's family set. Each excluded
 * family is named so a later story that adds one has to change this table on purpose.
 */

const ids = idSequence('019966b0-0004-7000-8000-');
const BLOCK = ids();
const LOCATION = ids();
const POINT = ids();
const EQUIPMENT = ids();
const FILE = ids();
const SUGGESTION = ids();
const REGISTRY = ids();
const TEMPLATE = ids();
const USER = ids();

/**
 * `countsAsEdit` reads only the path, the actor, the kind and a create's value, so the
 * candidates are written as the literal it takes rather than through `opFactory` — a
 * photo create whose `value` is a whole `file` row would say nothing more about AD-15.
 */
function op(path: string, extra: Partial<EditCandidate> = {}): EditCandidate {
  return { path, actor_id: TEST_USER, kind: 'put', value: 'x', ...extra };
}

const photo = { kind: 'photo' };

const COUNTS: ReadonlyArray<[string, EditCandidate]> = [
  ['relatorio/setup', op('relatorio/setup/local')],
  ['location', op(`location/${LOCATION}/name`)],
  ['block', op(`block/${BLOCK}/order_key`)],
  ['sheet', op(`sheet/${BLOCK}/nameplate/fabricante`)],
  ['sheet cell', op(`sheet/${BLOCK}/test/isolacao/cell/0/1`)],
  ['photo file create', op(`file/${FILE}`, { kind: 'create', value: photo })],
  ['photo caption', op(`file/${FILE}/caption`)],
  ['point', op(`point/${POINT}/text`)],
  ['equipment', op(`equipment/${EQUIPMENT}/tag`)],
];

const DOES_NOT_COUNT: ReadonlyArray<[string, EditCandidate]> = [
  ['suggestion', op(`suggestion/${SUGGESTION}/status`)],
  ['relatorio/status', op('relatorio/status', { value: 'emitido' })],
  ['registry', op(`registry/client/${REGISTRY}/name`)],
  ['template', op(`template/${TEMPLATE}/name`)],
  ['user', op(`user/${USER}/name`)],
  ['a system actor on an edit family', op(`block/${BLOCK}/order_key`, { actor_id: 'system:generate' })],
  ['a non-photo file create', op(`file/${FILE}`, { kind: 'create', value: { kind: 'certificate' } })],
  ['an unparseable path', op('nonsense/path')],
];

describe('countsAsEdit', () => {
  for (const [name, candidate] of COUNTS) {
    it(`counts ${name}`, () => {
      expect(countsAsEdit(candidate)).toBe(true);
    });
  }

  for (const [name, candidate] of DOES_NOT_COUNT) {
    it(`does not count ${name}`, () => {
      expect(countsAsEdit(candidate)).toBe(false);
    });
  }

  it('the family set is exactly AD-15 expanded, with no server-only family in it', () => {
    expect([...EDITED_SINCE_FAMILIES].some((f) => f === 'file/server')).toBe(false);
    expect([...EDITED_SINCE_FAMILIES].some((f) => f === 'equipment/last_nameplate')).toBe(false);
  });
});

describe('editedSince', () => {
  const edit = (seq: number) => ({ ...op(`block/${BLOCK}/order_key`), seq, actor_id: TEST_USER });

  it('is true for an edit after the snapshot seq', () => {
    expect(editedSince([edit(11)], 10)).toBe(true);
  });

  it('an op at exactly the snapshot seq does not count', () => {
    expect(editedSince([edit(10)], 10)).toBe(false);
  });

  it('an op with no seq has not been applied and does not count', () => {
    expect(editedSince([op(`block/${BLOCK}/order_key`)], 0)).toBe(false);
  });

  it('is false when only excluded families moved after the snapshot', () => {
    const excluded = DOES_NOT_COUNT.map(([, candidate], index) => ({ ...candidate, seq: 100 + index }));
    expect(editedSince(excluded, 10)).toBe(false);
  });

  it('is false for an empty log', () => {
    expect(editedSince([], 0)).toBe(false);
  });
});

describe('Epic 4 QA Q11 editedOnDevice', () => {
  const pulled = (seq: number, path = `block/${BLOCK}/order_key`) => ({ ...op(path), seq });

  it('is false with nothing edited past the snapshot and nothing unsent: the status and system ops of a generation do not count', () => {
    expect(editedOnDevice([pulled(10), pulled(11, 'relatorio/status'), { ...pulled(12), actor_id: 'system:generate' }], [op('relatorio/status', { value: 'emitido' })], 10)).toBe(false);
  });

  it('is true for a pulled edit past the snapshot', () => {
    expect(editedOnDevice([pulled(11)], [], 10)).toBe(true);
  });

  it('is true for an unsent edit of this device, which carries no seq yet', () => {
    expect(editedOnDevice([], [op('relatorio/setup/local')], 10)).toBe(true);
  });
});

describe('E4 retro items 18, Q15: the relatório stream', () => {
  const R1 = ids();
  const R2 = ids();
  const E_R1 = ids();
  const E_R2 = ids();
  const stream = { relatorioId: R1, equipmentIds: new Set([E_R1]) };
  const projectOp = (path: string, seq?: number): StreamCandidate => ({ ...op(path), scope: 'project', relatorio_id: null, ...(seq === undefined ? {} : { seq }) });
  const relatorioOp = (relatorioId: string, path: string, seq?: number): StreamCandidate => ({
    ...op(path),
    scope: 'relatorio',
    relatorio_id: relatorioId,
    ...(seq === undefined ? {} : { seq }),
  });

  it('referencedEquipmentIds reads the live blocks only, and skips a block with no equipment', () => {
    const referenced = referencedEquipmentIds([
      { equipment_id: E_R1, removed_at: null },
      { equipment_id: E_R2, removed_at: '2026-09-24T10:00:00.000Z' },
      { equipment_id: null, removed_at: null },
    ]);
    expect([...referenced]).toEqual([E_R1]);
  });

  it('holds the relatório own ops and the ops of the equipment it references, nothing else', () => {
    expect(inRelatorioStream(relatorioOp(R1, `block/${BLOCK}/order_key`, 1), stream)).toBe(true);
    expect(inRelatorioStream(relatorioOp(R2, `block/${BLOCK}/order_key`, 1), stream)).toBe(false);
    expect(inRelatorioStream(projectOp(`equipment/${E_R1}/tag`, 1), stream)).toBe(true);
    expect(inRelatorioStream(projectOp(`equipment/${E_R2}`, 1), stream)).toBe(false);
    expect(inRelatorioStream(projectOp(`equipment/${E_R2}/tag`, 1), stream)).toBe(false);
  });

  it('item 18: another relatório of the obra adding an equipment and a block does not edit R1', () => {
    const log = [projectOp(`equipment/${E_R2}`, 11), relatorioOp(R2, `block/${BLOCK}`, 12)];
    expect(relatorioEditedSince(log, 10, stream)).toBe(false);
    expect(editedOnDevice(log, [], 10, stream)).toBe(false);
  });

  it('Q15: a rename of an equipment R1 references edits R1, pulled or unsent', () => {
    expect(relatorioEditedSince([projectOp(`equipment/${E_R1}/tag`, 11)], 10, stream)).toBe(true);
    expect(editedOnDevice([], [projectOp(`equipment/${E_R1}/tag`)], 10, stream)).toBe(true);
  });

  it('an unsent edit of another relatório does not edit this one', () => {
    expect(editedOnDevice([], [relatorioOp(R2, 'relatorio/setup/local')], 10, stream)).toBe(false);
  });
});

describe('2026-10-10 decision 3: countsAsFieldContent, per path family and kind', () => {
  const A = '019966b0-0001-7000-8000-0000000000a1';
  const user = '019966b0-0001-7000-8000-0000000000a2';
  const op = (path: string, kind: 'create' | 'put' | 'remove' = 'put', value: unknown = 'x') => ({ path, actor_id: user, kind, value });

  it('content: sheet values, a sheet concluded or not tested, a cabine\'s data, a photo, a point', () => {
    const content = [
      op(`sheet/${A}/nameplate/n_serie`),
      op(`sheet/${A}/checklist/item_1/result`),
      op(`sheet/${A}/checklist/item_1/observation`),
      op(`sheet/${A}/test/isolacao/instrument`),
      op(`sheet/${A}/test/isolacao/cell/0/0`),
      op(`sheet/${A}/conclusion/result`),
      op(`sheet/${A}/observations`),
      op(`block/${A}/not_tested`),
      op(`block/${A}/concluded_by`),
      op(`location/${A}/se/primary_kv`),
      op(`location/${A}/env/humidity_pct`),
      op(`file/${A}`, 'create', { kind: 'photo' }),
      op(`file/${A}/caption`),
      op(`file/${A}/block_id`),
      op(`point/${A}`, 'create', {}),
      op(`point/${A}/text`),
      op(`point/${A}/priority`),
      // Story 14.3: a site item's answer and observation, its photo and the point created from it.
      op(`location/${A}/checklist/epi_disponivel/result`),
      op(`location/${A}/checklist/epi_disponivel/observation`),
      op(`file/${A}`, 'create', { kind: 'photo', block_id: null, location_id: A, item_key: 'epi_disponivel' }),
      op(`file/${A}/location_id`),
      op(`point/${A}`, 'create', { location_id: A, equipment_id: null }),
      op(`point/${A}/location_id`),
    ];
    for (const candidate of content) {
      expect(countsAsFieldContent(candidate), `${candidate.kind} ${candidate.path}`).toBe(true);
      expect(countsAsEdit(candidate), `${candidate.kind} ${candidate.path}`).toBe(true);
    }
  });

  it('structure: create, remove, restore, reorder, move, rename and config of locations, blocks, equipment and sections', () => {
    const structure = [
      op(`location/${A}`, 'create', {}),
      op(`location/${A}/name`),
      op(`location/${A}/parent_id`),
      op(`location/${A}/order_key`),
      op(`location/${A}/removed_at`),
      op(`location/${A}/agrupar_por_tipo`),
      op(`block/${A}`, 'create', {}),
      op(`block/${A}/location_id`),
      op(`block/${A}/order_key`),
      op(`block/${A}/removed_at`),
      op(`block/${A}/config`),
      op(`block/${A}/feeds_block_id`),
      op(`equipment/${A}`, 'create', {}),
      op(`equipment/${A}/tag`),
      op(`equipment/${A}/removed_at`),
      op(`point/${A}/order_key`),
      op(`point/${A}/removed_at`),
      op(`file/${A}/removed_at`),
    ];
    for (const candidate of structure) {
      expect(countsAsFieldContent(candidate), `${candidate.kind} ${candidate.path}`).toBe(false);
      // Each still counts as an edit of an issued relatório (AD-15, unchanged).
      expect(countsAsEdit(candidate), `${candidate.kind} ${candidate.path}`).toBe(true);
    }
  });

  it('never content: relatorio/setup, a remove, a non-photo file, a system op, a family outside editedSince', () => {
    expect(countsAsFieldContent(op('relatorio/setup/local'))).toBe(false);
    expect(countsAsFieldContent(op(`point/${A}`, 'remove', null))).toBe(false);
    expect(countsAsFieldContent(op(`file/${A}`, 'create', { kind: 'certificate' }))).toBe(false);
    expect(countsAsFieldContent({ ...op(`sheet/${A}/observations`), actor_id: 'system:reading' })).toBe(false);
    expect(countsAsFieldContent(op(`suggestion/${A}/status`))).toBe(false);
    expect(countsAsFieldContent(op('relatorio/status'))).toBe(false);
    expect(countsAsFieldContent(op('not/a/path'))).toBe(false);
  });
});

describe('P9: every editedSince family is decided as content or structure', () => {
  /**
   * The decision per family, written out. A family added to `EDITED_SINCE_FAMILIES` fails this
   * test until someone lists it here, so it can never keep (or leave) Rascunho by the
   * predicate's `default` alone. `mixed` families decide per field; one path of each side is given.
   */
  const A = '019966b0-0001-7000-8000-0000000000b1';
  const DECIDED: Record<string, { content: string[]; structure: string[] }> = {
    'relatorio/setup': { content: [], structure: ['relatorio/setup/local'] },
    location: { content: [], structure: [`location/${A}`] },
    // Story 14.2: a painel's rename, reorder and remove are these same paths.
    'location/field': { content: [], structure: [`location/${A}/name`, `location/${A}/order_key`, `location/${A}/removed_at`, `location/${A}/parent_id`] },
    'location/se': { content: [`location/${A}/se/primary_kv`], structure: [] },
    'location/env': { content: [`location/${A}/env/temperature_c`], structure: [] },
    'location/agrupar_por_tipo': { content: [], structure: [`location/${A}/agrupar_por_tipo`] },
    'location/funcao': { content: [], structure: [`location/${A}/funcao`] },
    // Story 14.3: a site item's result and observation are filled on site.
    'location/checklist': { content: [`location/${A}/checklist/ventilacao/result`, `location/${A}/checklist/ventilacao/observation`], structure: [] },
    block: { content: [], structure: [`block/${A}`] },
    'block/field': { content: [`block/${A}/not_tested`, `block/${A}/concluded_by`], structure: [`block/${A}/config`, `block/${A}/order_key`] },
    'sheet/nameplate': { content: [`sheet/${A}/nameplate/n_serie`], structure: [] },
    'sheet/checklist': { content: [`sheet/${A}/checklist/item_1/result`], structure: [] },
    'sheet/test': { content: [`sheet/${A}/test/isolacao/instrument`], structure: [] },
    'sheet/test/cell': { content: [`sheet/${A}/test/isolacao/cell/0/0`], structure: [] },
    'sheet/conclusion': { content: [`sheet/${A}/conclusion/result`], structure: [] },
    'sheet/observations': { content: [`sheet/${A}/observations`], structure: [] },
    file: { content: [`file/${A}`], structure: [] },
    'file/field': { content: [`file/${A}/caption`, `file/${A}/location_id`], structure: [`file/${A}/removed_at`] },
    point: { content: [`point/${A}`], structure: [] },
    'point/field': { content: [`point/${A}/text`, `point/${A}/location_id`], structure: [`point/${A}/order_key`] },
    equipment: { content: [], structure: [`equipment/${A}`] },
    'equipment/field': { content: [], structure: [`equipment/${A}/tag`] },
  };
  const CREATES = new Set(['location', 'block', 'file', 'point', 'equipment']);
  const candidate = (family: string, path: string) => ({ path, actor_id: 'u', kind: CREATES.has(family) ? ('create' as const) : ('put' as const), value: family === 'file' ? { kind: 'photo' } : 'x' });

  it('the table lists exactly the families of EDITED_SINCE_FAMILIES', () => {
    expect(Object.keys(DECIDED).sort()).toEqual([...EDITED_SINCE_FAMILIES].sort());
  });

  it('each family answers as the table says, with at least one path', () => {
    for (const [family, { content, structure }] of Object.entries(DECIDED)) {
      expect(content.length + structure.length, family).toBeGreaterThan(0);
      for (const path of content) expect(countsAsFieldContent(candidate(family, path)), path).toBe(true);
      for (const path of structure) expect(countsAsFieldContent(candidate(family, path)), path).toBe(false);
      for (const path of [...content, ...structure]) expect(countsAsEdit(candidate(family, path)), path).toBe(true);
    }
  });
});

describe('Story 14.2: painel ops and a local Função are structure, and an edit', () => {
  const A = '019966b0-0001-7000-8000-0000000000b1';
  const LOCAL = '019966b0-0001-7000-8000-0000000000b2';
  const painel = { id: A, relatorio_id: '019966b0-0001-7000-8000-0000000000b3', parent_id: LOCAL, name: 'Painel 1', order_key: 'a0', removed_at: null, kind: 'painel' };
  const ops = [
    { name: 'painel create', op: { path: `location/${A}`, actor_id: 'u', kind: 'create' as const, value: painel } },
    { name: 'painel rename', op: { path: `location/${A}/name`, actor_id: 'u', kind: 'put' as const, value: 'Painel de média tensão' } },
    { name: 'painel reorder', op: { path: `location/${A}/order_key`, actor_id: 'u', kind: 'put' as const, value: 'a1' } },
    { name: 'painel remove', op: { path: `location/${A}/removed_at`, actor_id: 'u', kind: 'remove' as const, value: null } },
    { name: 'painel restore', op: { path: `location/${A}/removed_at`, actor_id: 'u', kind: 'put' as const, value: null } },
    { name: 'funcao put (a key)', op: { path: `location/${LOCAL}/funcao`, actor_id: 'u', kind: 'put' as const, value: 'primaria' } },
    { name: 'funcao put (typed)', op: { path: `location/${LOCAL}/funcao`, actor_id: 'u', kind: 'put' as const, value: 'Medição' } },
    { name: 'funcao put (none)', op: { path: `location/${LOCAL}/funcao`, actor_id: 'u', kind: 'put' as const, value: null } },
  ];

  it.each(ops)('$name: countsAsEdit (an Emitido relatório reopens) and not countsAsFieldContent (a Rascunho one stays)', ({ op }) => {
    expect(countsAsEdit(op)).toBe(true);
    expect(countsAsFieldContent(op)).toBe(false);
    expect(editedSince([{ ...op, seq: 8 }], 7)).toBe(true);
  });

  it('a system actor never counts, as for every other family', () => {
    expect(countsAsEdit({ path: `location/${LOCAL}/funcao`, actor_id: 'system:identity', kind: 'put', value: 'primaria' })).toBe(false);
  });
});

describe('Story 14.3: a site item, its photo and its point are field content, and an edit', () => {
  const LOCAL = '019966b0-0001-7000-8000-0000000000c1';
  const FILE = '019966b0-0001-7000-8000-0000000000c2';
  const POINT = '019966b0-0001-7000-8000-0000000000c3';
  const RELATORIO = '019966b0-0001-7000-8000-0000000000c4';
  const sitePhoto = { id: FILE, kind: 'photo', relatorio_id: RELATORIO, block_id: null, location_id: LOCAL, item_key: 'iluminacao_normal', reading_kind: null };
  const sitePoint = { id: POINT, relatorio_id: RELATORIO, text: `Luminária queimada [[foto:${FILE}]]`, equipment_id: null, location_id: LOCAL, origin: 'manual', order_key: 'a0', removed_at: null };
  const ops = [
    { name: 'result C', op: { path: `location/${LOCAL}/checklist/iluminacao_normal/result`, actor_id: 'u', kind: 'put' as const, value: 'C' } },
    { name: 'result NC', op: { path: `location/${LOCAL}/checklist/iluminacao_normal/result`, actor_id: 'u', kind: 'put' as const, value: 'NC' } },
    { name: 'result NA', op: { path: `location/${LOCAL}/checklist/bacia_de_contencao_de_oleo/result`, actor_id: 'u', kind: 'put' as const, value: 'NA' } },
    { name: 'result cleared', op: { path: `location/${LOCAL}/checklist/iluminacao_normal/result`, actor_id: 'u', kind: 'put' as const, value: null } },
    { name: 'observation', op: { path: `location/${LOCAL}/checklist/iluminacao_normal/observation`, actor_id: 'u', kind: 'put' as const, value: 'Lâmpadas queimadas' } },
    { name: 'site photo create', op: { path: `file/${FILE}`, actor_id: 'u', kind: 'create' as const, value: sitePhoto } },
    { name: 'site photo location_id put', op: { path: `file/${FILE}/location_id`, actor_id: 'u', kind: 'put' as const, value: LOCAL } },
    { name: 'site photo caption', op: { path: `file/${FILE}/caption`, actor_id: 'u', kind: 'put' as const, value: 'Verificação da iluminação normal do 1° Subsolo' } },
    { name: 'site point create', op: { path: `point/${POINT}`, actor_id: 'u', kind: 'create' as const, value: sitePoint } },
    { name: 'site point location_id put', op: { path: `point/${POINT}/location_id`, actor_id: 'u', kind: 'put' as const, value: LOCAL } },
  ];

  it.each(ops)('$name: countsAsEdit (an Emitido relatório reopens) and countsAsFieldContent (a Rascunho one goes to Em campo)', ({ op }) => {
    expect(countsAsEdit(op)).toBe(true);
    expect(countsAsFieldContent(op)).toBe(true);
    expect(editedSince([{ ...op, seq: 8 }], 7)).toBe(true);
    expect(editedSince([{ ...op, seq: 7 }], 7)).toBe(false);
  });

  it('removing a site photo or a site point is an edit and never content, as for any photo or point', () => {
    for (const path of [`file/${FILE}/removed_at`, `point/${POINT}/removed_at`]) {
      const remove = { path, actor_id: 'u', kind: 'remove' as const, value: null };
      expect(countsAsEdit(remove), path).toBe(true);
      expect(countsAsFieldContent(remove), path).toBe(false);
    }
  });

  it('a system actor never counts, and a key outside the site list is no path at all', () => {
    expect(countsAsEdit({ path: `location/${LOCAL}/checklist/ventilacao/result`, actor_id: 'system:sync', kind: 'put', value: 'C' })).toBe(false);
    expect(countsAsEdit({ path: `location/${LOCAL}/checklist/limpeza/result`, actor_id: 'u', kind: 'put', value: 'C' })).toBe(false);
    expect(countsAsFieldContent({ path: `location/${LOCAL}/checklist/limpeza/result`, actor_id: 'u', kind: 'put', value: 'C' })).toBe(false);
  });
});

describe('Story 14.2, second pass: removing and restoring a painel, a coluna and a local is structure, and an edit', () => {
  const LOCAL = '019966b0-0001-7000-8000-0000000000c1';
  const PAINEL = '019966b0-0001-7000-8000-0000000000c2';
  const COLUNA = '019966b0-0001-7000-8000-0000000000c3';
  const SHEET = '019966b0-0001-7000-8000-0000000000c4';
  const EQUIPMENT_ROW = '019966b0-0001-7000-8000-0000000000c5';
  const remove = (path: string) => ({ path, actor_id: 'u', kind: 'remove' as const, value: null });
  const restore = (path: string) => ({ path, actor_id: 'u', kind: 'put' as const, value: null });
  // The "Desfazer" of a restore puts the removal's timestamp back.
  const undoRestore = (path: string) => ({ path, actor_id: 'u', kind: 'put' as const, value: '2026-10-13T12:00:00.000Z' });
  const rows = [
    { name: 'painel remove', op: remove(`location/${PAINEL}/removed_at`) },
    { name: 'painel restore', op: restore(`location/${PAINEL}/removed_at`) },
    { name: 'painel restore undone', op: undoRestore(`location/${PAINEL}/removed_at`) },
    { name: 'coluna remove', op: remove(`location/${COLUNA}/removed_at`) },
    { name: 'coluna restore', op: restore(`location/${COLUNA}/removed_at`) },
    { name: 'coluna restore undone', op: undoRestore(`location/${COLUNA}/removed_at`) },
    { name: 'local remove', op: remove(`location/${LOCAL}/removed_at`) },
    { name: 'local restore', op: restore(`location/${LOCAL}/removed_at`) },
    { name: 'local restore undone', op: undoRestore(`location/${LOCAL}/removed_at`) },
    { name: 'a sheet leaving with its location', op: remove(`block/${SHEET}/removed_at`) },
    { name: 'a sheet back with its location', op: restore(`block/${SHEET}/removed_at`) },
    { name: 'the equipment the removal frees', op: remove(`equipment/${EQUIPMENT_ROW}/removed_at`) },
    { name: 'the equipment back with its sheet', op: restore(`equipment/${EQUIPMENT_ROW}/removed_at`) },
  ];

  it.each(rows)('$name: countsAsEdit (an Emitido relatório reopens) and not countsAsFieldContent (a Rascunho one stays)', ({ op }) => {
    expect(countsAsEdit(op)).toBe(true);
    expect(countsAsFieldContent(op)).toBe(false);
    expect(editedSince([{ ...op, seq: 8 }], 7)).toBe(true);
    expect(editedSince([{ ...op, seq: 7 }], 7)).toBe(false);
  });

  it('the whole batch of a removal, and of its restore, carries no field content: no status op rides with it on a Rascunho relatório', () => {
    const removal = [
      remove(`location/${LOCAL}/removed_at`),
      remove(`location/${PAINEL}/removed_at`),
      remove(`location/${COLUNA}/removed_at`),
      remove(`block/${SHEET}/removed_at`),
      remove(`equipment/${EQUIPMENT_ROW}/removed_at`),
    ];
    const back = removal.map((op) => restore(op.path));
    for (const batch of [removal, back]) {
      expect(batch.some((op) => countsAsFieldContent(op))).toBe(false);
      expect(batch.every((op) => countsAsEdit(op))).toBe(true);
      expect(editedSince(batch.map((op, i) => ({ ...op, seq: 10 + i })), 9)).toBe(true);
    }
  });
});

describe('2026-10-13: every op path family is decided, an edit or never one', () => {
  /** Every family the op path schema accepts, read from the schema itself. */
  const schemaFamilies = opPathSchema.options.map((option) => option.shape.family.value as PathFamily);
  /** Every family of the runtime table that parses and formats paths. */
  const tableFamilies = FAMILIES.map((def) => def.family);

  it('the schema and the family table name the same families, each once', () => {
    expect(new Set(schemaFamilies).size).toBe(schemaFamilies.length);
    expect(new Set(tableFamilies).size).toBe(tableFamilies.length);
    expect([...schemaFamilies].sort()).toEqual([...tableFamilies].sort());
  });

  it('each family is in exactly one of EDITED_SINCE_FAMILIES and NEVER_EDIT_FAMILIES', () => {
    for (const family of new Set([...schemaFamilies, ...tableFamilies])) {
      const lists = Number(EDITED_SINCE_FAMILIES.has(family)) + Number(NEVER_EDIT_FAMILIES.has(family));
      expect(
        lists,
        `The op path family "${family}" is in ${lists === 0 ? 'neither list' : 'both lists'}. Decide it in FAMILY_DECISIONS ` +
          '(packages/domain/src/status/edited-since.ts): "edit" when an op of this family is a user edit of the relatório\'s ' +
          'own content (AD-15: it then reopens an Emitido relatório and counts for the revision guard, and ' +
          'countsAsFieldContent needs its answer for Rascunho), or never(reason) when it never is. No family is "not an ' +
          'edit" by omission.',
      ).toBe(1);
    }
  });

  it('neither list names a family the op path schema does not have', () => {
    const known = new Set<string>(schemaFamilies);
    for (const family of [...EDITED_SINCE_FAMILIES, ...NEVER_EDIT_FAMILIES.keys()]) expect(known.has(family), family).toBe(true);
    expect(EDITED_SINCE_FAMILIES.size + NEVER_EDIT_FAMILIES.size).toBe(schemaFamilies.length);
  });

  it('every never-edit family says why, and no server-only family is an edit', () => {
    for (const [family, reason] of NEVER_EDIT_FAMILIES) expect(reason.trim().length, family).toBeGreaterThan(10);
    for (const def of FAMILIES) {
      if (def.serverOnly === true) expect(NEVER_EDIT_FAMILIES.has(def.family), def.family).toBe(true);
    }
  });

  it('the classification of 2026-10-10 is unchanged, plus `location/funcao` (Story 14.2) and `location/checklist` (Story 14.3): the twenty-two edit families and the twenty-two that never are', () => {
    expect([...EDITED_SINCE_FAMILIES].sort()).toEqual(
      [
        'block',
        'block/field',
        'equipment',
        'equipment/field',
        'file',
        'file/field',
        'location',
        'location/agrupar_por_tipo',
        'location/checklist',
        'location/env',
        'location/field',
        'location/funcao',
        'location/se',
        'point',
        'point/field',
        'relatorio/setup',
        'sheet/checklist',
        'sheet/conclusion',
        'sheet/nameplate',
        'sheet/observations',
        'sheet/test',
        'sheet/test/cell',
      ].sort(),
    );
    expect([...NEVER_EDIT_FAMILIES.keys()].sort()).toEqual(
      [
        'audit_run',
        'audit_run/field',
        'equipment/last_nameplate',
        'file/server',
        'generation_job',
        'generation_job/field',
        'project',
        'project/field',
        'registry',
        'registry/field',
        'relatorio',
        'relatorio/export/scheme',
        'relatorio/preview_file_id',
        'relatorio/status',
        'revision',
        'suggestion',
        'suggestion/status',
        'template',
        'template/field',
        'template/seed_version',
        'user',
        'user/field',
      ].sort(),
    );
  });
});
