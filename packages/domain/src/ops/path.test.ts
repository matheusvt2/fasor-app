import { describe, expect, it } from 'vitest';
import { opLog } from '../../fixtures/replay-small/op-log.ts';
import { FAMILIES, formatPath, isServerOnly, opPathSchema, parsePath, PathError, targetOf, type OpPath } from './path.ts';
import * as builders from './path.ts';

const ID = '019966b0-0000-7000-8000-0000000000aa';
const BLOCK = '019966b0-0000-7000-8000-0000000000bb';

/** One path per family not exercised by the fixture log, so every family round-trips. */
const EXTRA_PATHS = [
  `project/${ID}/name`,
  `location/${ID}/parent_id`,
  `location/${ID}/env/humidity_pct`,
  `block/${ID}/location_id`,
  `sheet/${BLOCK}/conclusion/text_basis`,
  `equipment/${ID}/removed_at`,
  `file/${ID}/item_key`,
  `point/${ID}/removed_at`,
  `registry/criterion/${ID}`,
  `registry/criterion/${ID}/operator`,
  `registry/manufacturer/${ID}/gender`,
  `template/${ID}/blocks`,
  `user/${ID}/photo_location_enabled`,
  `user/${ID}/council`,
  `user/${ID}/registration_number`,
  `user/${ID}/title`,
  `user/${ID}`,
  `generation_job/${ID}/error`,
  `generation_job/${ID}/result`,
  `template/${ID}/seed_version`,
];

describe('1.4-UNIT-001 path round trip', () => {
  const paths = [...new Set([...opLog.map((op) => op.path), ...EXTRA_PATHS])];

  it.each(paths)('formatPath(parsePath(p)) === p for %s', (path) => {
    const parsed = parsePath(path);
    expect(formatPath(parsed)).toBe(path);
    expect(typeof parsed.family).toBe('string');
  });

  it('covers every family of the AD-3 list', () => {
    const seen = new Set(paths.map((p) => parsePath(p).family));
    const missing = FAMILIES.map((f) => f.family).filter((f) => !seen.has(f));
    expect(missing).toEqual([]);
    expect(FAMILIES.length).toBe(40);
  });

  it('returns typed segments', () => {
    expect(parsePath(`sheet/${BLOCK}/test/isolamento/cell/10/2`)).toEqual({
      family: 'sheet/test/cell',
      block_id: BLOCK,
      test_key: 'isolamento',
      row: 10,
      col: 2,
    });
    expect(parsePath(`registry/instrument/${ID}/code`)).toEqual({
      family: 'registry/field',
      kind: 'instrument',
      id: ID,
      field: 'code',
    });
    expect(parsePath('relatorio/setup/service_start')).toEqual({ family: 'relatorio/setup', field: 'service_start' });
  });

  it('rejects an unknown family naming the family segment', () => {
    expect(() => parsePath(`sheets/${BLOCK}/nameplate/x`)).toThrow(PathError);
    expect(() => parsePath(`sheets/${BLOCK}/nameplate/x`)).toThrow(/unknown family "sheets"/);
  });

  it('rejects an unknown field naming entity and field', () => {
    expect(() => parsePath(`location/${ID}/colour`)).toThrow(/unknown field "colour" for location/);
    expect(() => parsePath(`project/${ID}/id`)).toThrow(/unknown field "id" for project/);
    expect(() => parsePath(`registry/client/${ID}/serial`)).toThrow(/unknown field "serial" for registry client/);
    expect(() => parsePath(`relatorio/setup/colour`)).toThrow(/unknown field "colour" for relatorio/);
    expect(() => parsePath(`location/${ID}/se/colour`)).toThrow(/unknown field "colour" for location/);
    expect(() => parsePath(`block/${ID}/created_by`)).toThrow(/unknown field "created_by" for block/);
  });

  it('rejects identity and derived keys as put fields', () => {
    expect(() => parsePath(`user/${ID}/email`)).toThrow(/unknown field "email" for user/);
    expect(() => parsePath(`user/${ID}/professional_registration`)).toThrow(/unknown field "professional_registration" for user/);
    expect(() => parsePath(`point/${ID}/origin`)).toThrow(/unknown field "origin" for point/);
    // D-4: `version` is mutable since 2026-09-23 (the reducer bumps it on content edits).
    expect(parsePath(`template/${ID}/version`)).toEqual({ family: 'template/field', id: ID, field: 'version' });
    // E12-Q4: a template's seed version is no `template/field`; only its server-only family names it.
    expect(parsePath(`template/${ID}/seed_version`)).toEqual({ family: 'template/seed_version', id: ID, field: 'seed_version' });
    expect(isServerOnly(`template/${ID}/seed_version`)).toBe(true);
  });

  it('rejects malformed segments', () => {
    expect(() => parsePath('location/not-a-uuid/name')).toThrow(/not a uuidv7/);
    expect(() => parsePath(`sheet/${BLOCK}/nameplate/Fabricante`)).toThrow(/not a seed key/);
    expect(() => parsePath(`sheet/${BLOCK}/test/isolamento/cell/01/2`)).toThrow(/not an index/);
    expect(() => parsePath(`sheet/${BLOCK}/test/isolamento/cell/99999999999999999999/2`)).toThrow(PathError);
    expect(() => parsePath(`registry/vendor/${ID}`)).toThrow(/unknown registry kind "vendor"/);
    expect(() => parsePath('relatorio')).toThrow(PathError);
    expect(() => parsePath(`block/${ID}/order_key/extra`)).toThrow(PathError);
  });

  it('never accepts a wildcard', () => {
    expect(() => parsePath(`sheet/${BLOCK}/nameplate/*`)).toThrow(PathError);
    expect(() => parsePath(`block/*/order_key`)).toThrow(PathError);
  });

  it('tells server-only families apart', () => {
    for (const p of [
      `file/${ID}/uploaded_at`,
      `file/${ID}/variants`,
      `file/${ID}/reading_status`,
      `suggestion/${ID}`,
      `equipment/${ID}/last_nameplate`,
      `generation_job/${ID}`,
      `generation_job/${ID}/status`,
      `revision/${ID}`,
      'relatorio/preview_file_id',
      `user/${ID}`,
      `template/${ID}/seed_version`,
    ]) {
      expect(isServerOnly(p)).toBe(true);
    }
    for (const p of [
      `file/${ID}/caption`,
      `suggestion/${ID}/status`,
      `equipment/${ID}/tag`,
      'relatorio/status',
      `user/${ID}/title`,
    ]) {
      expect(isServerOnly(p)).toBe(false);
    }
  });

  it('names the target row', () => {
    expect(targetOf(parsePath(`sheet/${BLOCK}/observations`))).toEqual({ entity: 'block', id: BLOCK });
    expect(targetOf(parsePath(`registry/client/${ID}/name`))).toEqual({ entity: 'registry', id: ID });
    expect(targetOf(parsePath('relatorio/status'))).toEqual({ entity: 'relatorio', id: null });
  });

  it('rejects a hand-built registry/field path whose field is not a key of that kind', () => {
    const bogus = { family: 'registry/field', kind: 'client', id: ID, field: 'serial' } as const;
    const parsed = opPathSchema.safeParse(bogus);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(['field']);
    expect(() => parsePath(formatPath(bogus as unknown as OpPath))).toThrow(/unknown field "serial" for registry client/);
    expect(opPathSchema.safeParse({ ...bogus, field: 'name' }).success).toBe(true);
    expect(opPathSchema.safeParse({ ...bogus, field: 'id' }).success).toBe(false);
  });
});

describe('2.3-UNIT-005 field immutability is per entity, not global', () => {
  const EMPRESA = '019966b0-0000-7000-8000-000000000004';

  it('accepts the Empresa contact e-mail as a field, and still refuses the user one', () => {
    expect(parsePath(`registry/empresa/${EMPRESA}/email`)).toEqual({
      family: 'registry/field',
      kind: 'empresa',
      id: EMPRESA,
      field: 'email',
    });
    expect(parsePath(`registry/empresa/${EMPRESA}/phone`).family).toBe('registry/field');
    expect(parsePath(`registry/empresa/${EMPRESA}/form_code`).family).toBe('registry/field');
    // `user.email` is identity-owned and stays unwritable by any op (AD-9).
    expect(() => parsePath(`user/${EMPRESA}/email`)).toThrow(PathError);
  });

  it('still refuses identity and ownership keys everywhere', () => {
    expect(() => parsePath(`registry/empresa/${EMPRESA}/id`)).toThrow(PathError);
    expect(() => parsePath(`registry/empresa/${EMPRESA}/kind`)).toThrow(PathError);
  });
});

describe('E5-A5 typed path builders round-trip through parsePath', () => {
  const cases: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    [builders.projectPath(ID), { family: 'project', id: ID }],
    [builders.projectFieldPath(ID, 'name'), { family: 'project/field', id: ID, field: 'name' }],
    [builders.relatorioPath(ID), { family: 'relatorio', id: ID }],
    [builders.relatorioSetupPath('exclusions'), { family: 'relatorio/setup', field: 'exclusions' }],
    [builders.relatorioStatusPath(), { family: 'relatorio/status' }],
    [builders.relatorioExportSchemePath(), { family: 'relatorio/export/scheme' }],
    [builders.locationPath(ID), { family: 'location', id: ID }],
    [builders.locationFieldPath(ID, 'order_key'), { family: 'location/field', id: ID, field: 'order_key' }],
    [builders.locationSePath(ID, 'type'), { family: 'location/se', id: ID, field: 'type' }],
    [builders.locationEnvPath(ID, 'humidity_pct'), { family: 'location/env', id: ID, field: 'humidity_pct' }],
    [builders.locationAgruparPath(ID), { family: 'location/agrupar_por_tipo', id: ID }],
    [builders.blockPath(ID), { family: 'block', id: ID }],
    [builders.blockFieldPath(ID, 'not_tested'), { family: 'block/field', id: ID, field: 'not_tested' }],
    [builders.sheetNameplatePath(BLOCK, 'fabricante'), { family: 'sheet/nameplate', block_id: BLOCK, field_key: 'fabricante' }],
    [
      builders.sheetChecklistPath(BLOCK, 'item_1', 'observation'),
      { family: 'sheet/checklist', block_id: BLOCK, item_key: 'item_1', field: 'observation' },
    ],
    [
      builders.sheetTestPath(BLOCK, 'insulation', 'criterion_override'),
      { family: 'sheet/test', block_id: BLOCK, test_key: 'insulation', field: 'criterion_override' },
    ],
    [
      builders.sheetTestCellPath(BLOCK, 'insulation', 3, 1),
      { family: 'sheet/test/cell', block_id: BLOCK, test_key: 'insulation', row: 3, col: 1 },
    ],
    [builders.sheetConclusionPath(BLOCK, 'text_basis'), { family: 'sheet/conclusion', block_id: BLOCK, field: 'text_basis' }],
    [builders.sheetObservationsPath(BLOCK), { family: 'sheet/observations', block_id: BLOCK }],
    [builders.equipmentPath(ID), { family: 'equipment', id: ID }],
    [builders.equipmentFieldPath(ID, 'tag'), { family: 'equipment/field', id: ID, field: 'tag' }],
    [builders.filePath(ID), { family: 'file', id: ID }],
    [builders.fileFieldPath(ID, 'caption'), { family: 'file/field', id: ID, field: 'caption' }],
    [builders.pointPath(ID), { family: 'point', id: ID }],
    [builders.pointFieldPath(ID, 'text'), { family: 'point/field', id: ID, field: 'text' }],
    [builders.suggestionStatusPath(ID), { family: 'suggestion/status', id: ID }],
    [builders.registryPath('client', ID), { family: 'registry', kind: 'client', id: ID }],
    [
      builders.registryFieldPath('instrument', ID, 'certificate_file_id'),
      { family: 'registry/field', kind: 'instrument', id: ID, field: 'certificate_file_id' },
    ],
    [builders.templatePath(ID), { family: 'template', id: ID }],
    [builders.templateFieldPath(ID, 'archived_at'), { family: 'template/field', id: ID, field: 'archived_at' }],
    [builders.userFieldPath(ID, 'council'), { family: 'user/field', id: ID, field: 'council' }],
  ];

  it.each(cases)('%s parses back to its family and segments', (path, expected) => {
    expect(parsePath(path)).toEqual(expected);
    expect(formatPath(parsePath(path))).toBe(path);
  });

  it('covers every family a device writes, and no server-only one', () => {
    const built = new Set(cases.map(([path]) => parsePath(path).family));
    const deviceFamilies = FAMILIES.filter((def) => def.serverOnly !== true).map((def) => def.family);
    expect([...built].sort()).toEqual([...deviceFamilies].sort());
  });
});
