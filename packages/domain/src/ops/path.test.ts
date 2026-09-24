import { describe, expect, it } from 'vitest';
import { opLog } from '../../fixtures/replay-small/op-log.ts';
import { FAMILIES, formatPath, isServerOnly, opPathSchema, parsePath, PathError, targetOf, type OpPath } from './path.ts';

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
    expect(FAMILIES.length).toBe(39);
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
    expect(() => parsePath(`template/${ID}/seed_version`)).toThrow(/unknown field "seed_version" for template/);
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
