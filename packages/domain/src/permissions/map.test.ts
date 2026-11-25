import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, MIN_CONTRACT_VERSION } from '../contract/version.ts';
import { errorCodeSchema, opRejectCodeSchema } from '../contract/errors.ts';
import { applyOp, entityKey } from '../ops/apply.ts';
import { FAMILIES, formatPath, isServerOnly, parsePath, roleFieldPath, rolePath, safeParsePath, userFieldPath, userRolePath, userStatusPath } from '../ops/path.ts';
import { ENTITY_SCOPE, registryKindSchema, RELATORIO_SETUP_KEYS, type UserRow } from '../schemas/entities.ts';
import { opFactory } from '../test-support.ts';
import { PERMISSION_KEYS } from './keys.ts';
import { FAMILY_PERMISSION_NEEDS, FICHA_REGISTRY_KINDS, SETUP_CREATE_FIELDS, SETUP_FILL_FIELDS, permissionForPath, permissionForRoute, PERMISSION_ROUTES, relatorioWriteRefusal, reopenNeed, type PermissionNeed } from './map.ts';
import { readOnlyReasonText } from './refusal.ts';
import { ADMIN_ROLE_ID, SYSTEM_ROLE_ROW_IDS, systemRoleRow } from './roles.ts';

const ID = '019966b0-0000-7000-8000-0000000000aa';
const NEEDS = new Set<PermissionNeed>([...PERMISSION_KEYS, 'none']);
const put = (value: unknown = null) => ({ kind: 'put' as const, value: value as never });
const create = { kind: 'create' as const, value: null };
const remove = { kind: 'remove' as const, value: null };

/** One sample path of a family, built from its segment table. */
function samplePath(def: (typeof FAMILIES)[number]): string {
  const value: Record<string, unknown> = { kind: 'client' };
  return def.segments
    .map((seg) => {
      if ('lit' in seg) return seg.lit;
      if ('id' in seg) return ID;
      if ('enum' in seg) return seg.enum[0]!;
      if ('key' in seg) return 'abc';
      if ('int' in seg) return '0';
      if ('registryKind' in seg) return 'client';
      const keys = typeof seg.field === 'function' ? seg.field(value) : seg.field;
      return keys[0]!;
    })
    .join('/');
}

describe('26.2-UNIT-006 the map covers every op path family', () => {
  it('every family of FAMILIES has an entry, and the map names no other family', () => {
    const missing = FAMILIES.map((def) => def.family).filter((family) => FAMILY_PERMISSION_NEEDS[family] === undefined);
    expect(missing, `families with no permission entry in permissions/map.ts: ${missing.join(', ')}`).toEqual([]);
    expect(Object.keys(FAMILY_PERMISSION_NEEDS).sort()).toEqual(FAMILIES.map((def) => def.family).sort());
  });

  it.each(FAMILIES.map((def) => [def.family, def] as const))('%s: a sample path answers one of the twelve keys or none, and never throws', (family, def) => {
    const path = samplePath(def);
    expect(parsePath(path).family).toBe(family);
    for (const op of [create, put(), put('emitido'), remove]) {
      const need = permissionForPath(path, op);
      expect(NEEDS.has(need), `${path} -> ${need}`).toBe(true);
      expect(permissionForPath(parsePath(path), op)).toBe(need);
    }
  });

  it('every server-only family is none or one of the Admin keys (the push refuses it before any key)', () => {
    for (const def of FAMILIES.filter((d) => d.serverOnly === true)) {
      expect(['none', 'users.manage', 'roles.manage'], def.family).toContain(permissionForPath(samplePath(def), put()));
    }
  });
});

describe('26.2-UNIT-007 the coordinator readings of Story 26.2', () => {
  it('relatorio/status: Emitido issues, Em revisão and every other move fill', () => {
    expect(permissionForPath('relatorio/status', put('emitido'))).toBe('relatorio.issue');
    expect(permissionForPath('relatorio/status', put('em_revisao'))).toBe('relatorio.fill');
    expect(permissionForPath('relatorio/status', put('rascunho'))).toBe('relatorio.fill');
    expect(permissionForPath('relatorio/status', put('em_campo'))).toBe('relatorio.fill');
  });

  it('the obra, the relatório create and its setup create; the tombstone deletes; the export scheme issues', () => {
    expect(permissionForPath(`project/${ID}`, create)).toBe('relatorio.create');
    expect(permissionForPath(`project/${ID}/name`, put('x'))).toBe('relatorio.create');
    expect(permissionForPath(`relatorio/${ID}`, create)).toBe('relatorio.create');
    expect(permissionForPath('relatorio/setup/service_start', put())).toBe('relatorio.create');
    expect(permissionForPath('relatorio/removed_at', remove)).toBe('relatorio.delete');
    expect(permissionForPath('relatorio/removed_at', put())).toBe('relatorio.delete');
    expect(permissionForPath('relatorio/export/scheme', put('by_location'))).toBe('relatorio.issue');
  });

  it('relatorio/setup: every key is in exactly one group, the creation form creates and the field fills', () => {
    for (const key of RELATORIO_SETUP_KEYS) {
      const groups = Number(SETUP_CREATE_FIELDS.includes(key)) + Number(SETUP_FILL_FIELDS.includes(key));
      expect(groups, `relatorio/setup/${key} must be in exactly one of SETUP_CREATE_FIELDS and SETUP_FILL_FIELDS (permissions/map.ts)`).toBe(1);
    }
    expect([...SETUP_CREATE_FIELDS, ...SETUP_FILL_FIELDS].sort()).toEqual([...RELATORIO_SETUP_KEYS].sort());
    expect([...SETUP_CREATE_FIELDS]).toEqual(['service_start', 'service_end', 'atividade', 'local', 'responsible_user_id', 'cover_photo_file_id', 'escopo', 'exclusions', 'additional_info', 'art_trt_number']);
    // Batch e28c (Story 28.9, contract 59): the relatório's additional items, written in Etapa 6, fill.
    expect([...SETUP_FILL_FIELDS]).toEqual(['parecer', 'site_altitude_m', 'site_altitude_na', 'site_altitude_confirmed', 'next_intervention_date', 'next_intervention_justification', 'instrument_ids', 'additional_items']);
    for (const key of SETUP_CREATE_FIELDS) expect(permissionForPath(`relatorio/setup/${key}`, put()), key).toBe('relatorio.create');
    for (const key of SETUP_FILL_FIELDS) expect(permissionForPath(`relatorio/setup/${key}`, put()), key).toBe('relatorio.fill');
  });

  it('the field: locals, blocks, sheets, equipment, files, points and suggestions fill', () => {
    for (const path of [
      `location/${ID}`,
      `location/${ID}/name`,
      `location/${ID}/funcao`,
      `location/${ID}/checklist/epi_disponivel/result`,
      `block/${ID}`,
      `sheet/${ID}/nameplate/fabricante`,
      `sheet/${ID}/test/continuidade/cell/0/0`,
      `equipment/${ID}`,
      `equipment/${ID}/tag`,
      `file/${ID}`,
      `file/${ID}/caption`,
      `point/${ID}`,
      `suggestion/${ID}/status`,
    ]) {
      expect(permissionForPath(path, put()), path).toBe('relatorio.fill');
    }
  });

  it('registry edits need registry.edit, except the create of a kind the ficha writes', () => {
    expect([...FICHA_REGISTRY_KINDS]).toEqual(['manufacturer', 'voltage_class']);
    for (const kind of registryKindSchema.options) {
      const expected = FICHA_REGISTRY_KINDS.includes(kind) ? 'relatorio.fill' : 'registry.edit';
      expect(permissionForPath(`registry/${kind}/${ID}`, create), kind).toBe(expected);
    }
    expect(permissionForPath(`registry/manufacturer/${ID}/name`, put('x'))).toBe('registry.edit');
    expect(permissionForPath(`registry/client/${ID}/name`, put('x'))).toBe('registry.edit');
  });

  it('templates, equipment types, the profile and the Admin families', () => {
    expect(permissionForPath(`template/${ID}`, create)).toBe('template.edit');
    expect(permissionForPath(`template/${ID}/blocks`, put([]))).toBe('template.edit');
    expect(permissionForPath(`equipment_type/${ID}`, create)).toBe('equipment_type.edit');
    expect(permissionForPath(`equipment_type/${ID}/draft`, put())).toBe('equipment_type.edit');
    expect(permissionForPath(`equipment_type_version/${ID}`, create)).toBe('equipment_type.edit');
    expect(permissionForPath(userFieldPath(ID, 'title'), put('Eng.'))).toBe('none');
    expect(permissionForPath(userRolePath(ID), put(ADMIN_ROLE_ID))).toBe('users.manage');
    expect(permissionForPath(userStatusPath(ID), put('paused'))).toBe('users.manage');
    expect(permissionForPath(rolePath(ID), create)).toBe('roles.manage');
    expect(permissionForPath(roleFieldPath(ID, 'permissions'), put([]))).toBe('roles.manage');
    expect(permissionForPath(`user/${ID}`, create)).toBe('none');
    expect(permissionForPath(`generation_job/${ID}`, create)).toBe('none');
  });

  it('the routes that are not ops', () => {
    expect(Object.fromEntries(PERMISSION_ROUTES.map((route) => [route, permissionForRoute(route)]))).toEqual({
      'relatorio.generate': 'relatorio.issue',
      'relatorio.preview': 'relatorio.issue',
      'relatorio.preview_pdf': 'relatorio.issue',
      'relatorio.audit': 'relatorio.issue',
      'reading.reread': 'relatorio.issue',
      'revision.docx': 'export.download',
      'revision.pdf': 'export.download',
      'file.upload': 'relatorio.fill',
      'file.read': 'relatorio.view',
      'sync.push': 'none',
      'sync.pull': 'none',
      'account.read': 'none',
      telemetry: 'none',
      // Story 26.8: appended.
      'admin.users': 'users.manage',
      // Story 26.10: appended.
      'admin.roles': 'roles.manage',
    });
  });
});

describe('26.2-UNIT-008 roles and a user role and status are server-only families', () => {
  it.each([
    ['a role create', rolePath(ID), 'role'],
    ['a role field', roleFieldPath(ID, 'name'), 'role/field'],
    ['a role key set', `role/${ID}/permissions`, 'role/field'],
    ['a role tombstone', `role/${ID}/removed_at`, 'role/field'],
    ['a user role', `user/${ID}/role_id`, 'user/role_id'],
    ['a user status', `user/${ID}/status`, 'user/status'],
  ])('%s parses to a server-only family', (_name, path, family) => {
    const parsed = parsePath(path);
    expect(parsed.family).toBe(family);
    expect(isServerOnly(parsed)).toBe(true);
    expect(formatPath(parsed)).toBe(path);
  });

  it('a role field never parses as a profile field, and a profile field stays one', () => {
    expect(parsePath(`user/${ID}/role_id`).family).not.toBe('user/field');
    expect(parsePath(`user/${ID}/status`).family).not.toBe('user/field');
    expect(isServerOnly(`user/${ID}/title`)).toBe(false);
    expect(safeParsePath(`role/${ID}/system`)).toBeNull();
    expect(safeParsePath(`role/${ID}/id`)).toBeNull();
    expect(ENTITY_SCOPE.role).toEqual(['company']);
  });

  it('the fold: a role create, a key set put, and a user role and status put materialize', () => {
    const f = opFactory();
    const company = { scope: 'company' as const, relatorio_id: null, actor_id: 'system:admin', device_id: 'server' };
    const role = systemRoleRow('consulta');
    let state = applyOp(new Map(), f.op({ ...company, kind: 'create', path: rolePath(role.id), value: role }));
    expect(state.get(entityKey('role', role.id))).toEqual(role);
    state = applyOp(state, f.op({ ...company, path: roleFieldPath(role.id, 'permissions'), value: ['relatorio.view'] }));
    expect(state.get(entityKey('role', role.id))).toEqual({ ...role, permissions: ['relatorio.view'] });
    expect(() => applyOp(state, f.op({ ...company, path: roleFieldPath(role.id, 'permissions'), value: ['relatorio.read'] }))).toThrow();

    const user = { id: ID, name: 'Ana', email: 'ana@x.dev', council: null, registration_number: null, title: null, photo_location_enabled: false };
    state = applyOp(state, f.op({ ...company, actor_id: 'system:identity', kind: 'create', path: `user/${ID}`, value: user }));
    state = applyOp(state, f.op({ ...company, path: userRolePath(ID), value: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo }));
    state = applyOp(state, f.op({ ...company, path: userStatusPath(ID), value: 'paused' }));
    expect(state.get(entityKey('user', ID)) as UserRow).toEqual({ ...user, role_id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo, status: 'paused' });
    expect(() => applyOp(state, f.op({ ...company, path: userStatusPath(ID), value: 'blocked' }))).toThrow();
  });
});

describe('26.2-UNIT-009 contract 55 and the new codes', () => {
  // e27a (Stories 27.1 and 27.2, 2026-11-21): the number moved on to 56; a 55 bundle is refused too.
  // Fix batch e27a-review (R8): the exact numbers, and the refusal of 55 and 54 asserted, as the title says.
  // Batch e27b (Story 27.8, seed v17, 2026-11-22): the number moved on to 57; 55 and 54 stay refused.
  // Batch e28a (Stories 28.2 to 28.4, seed v18, 2026-11-23): the number moved on to 58; 55 and 54 stay refused.
  // Batch e28c (Story 28.9, the setup key `additional_items`, 2026-11-23): the number moved on to 59; 55 and 54 stay refused.
  // Batch e30b (Story 30.3, seed v19, 2026-11-24): the number moved on to 60; 55 and 54 stay refused.
  it('speaks 60 with a minimum of 60: a 55 bundle is refused, and so is a 54 one (it cannot parse the role families)', () => {
    expect(CONTRACT_VERSION).toBe(60);
    expect(MIN_CONTRACT_VERSION).toBe(60);
    // A bundle is refused (426 contract_outdated) below MIN_CONTRACT_VERSION.
    expect(55 < MIN_CONTRACT_VERSION).toBe(true);
    expect(54 < MIN_CONTRACT_VERSION).toBe(true);
    expect(CONTRACT_VERSION < MIN_CONTRACT_VERSION).toBe(false);
  });

  it('routes answer forbidden and an inactive user user_inactive; ops reuse op_forbidden', () => {
    expect(errorCodeSchema.options).toContain('forbidden');
    expect(errorCodeSchema.options).toContain('user_inactive');
    expect(opRejectCodeSchema.options).toContain('op_forbidden');
    expect(opRejectCodeSchema.options).not.toContain('forbidden');
  });
});

describe('e26r-UNIT-002 leaving Emitido needs relatorio.issue (2026-11-22, Matheus "sim nos dois")', () => {
  const USER = '019966b0-0000-7000-8000-0000000000bb';
  const edit = (path: string, value: unknown = 'x', kind: 'put' | 'create' | 'remove' = 'put') => ({ path, kind, value, actor_id: USER });

  it('a status put on a relatório the server holds as Emitido issues, whatever its target; elsewhere the old reading holds', () => {
    for (const to of ['em_revisao', 'em_campo', 'rascunho', 'emitido']) {
      expect(permissionForPath('relatorio/status', put(to), { relatorioStatus: 'emitido' })).toBe('relatorio.issue');
    }
    for (const server of ['rascunho', 'em_campo', 'em_revisao', null, undefined] as const) {
      expect(permissionForPath('relatorio/status', put('em_revisao'), { relatorioStatus: server })).toBe('relatorio.fill');
      expect(permissionForPath('relatorio/status', put('emitido'), { relatorioStatus: server })).toBe('relatorio.issue');
    }
  });

  it('reopenNeed: on Emitido every op that would reopen (a status move, an edit AD-22 counts) needs relatorio.issue; nothing else does', () => {
    const reopening = [
      edit('relatorio/status', 'em_revisao'),
      edit(`sheet/${ID}/nameplate/fabricacao`),
      edit(`sheet/${ID}/observations`),
      edit(`sheet/${ID}/conclusion/result`),
      edit(`file/${ID}`, { kind: 'photo' }, 'create'),
      edit(`file/${ID}/caption`),
      edit(`point/${ID}`, {}, 'create'),
      edit('relatorio/setup/parecer'),
      edit(`block/${ID}`, {}, 'create'),
      edit(`location/${ID}/name`),
    ].filter((op) => safeParsePath(op.path) !== null);
    expect(reopening.length).toBeGreaterThanOrEqual(8);
    for (const op of reopening) expect(reopenNeed(op, 'emitido'), op.path).toBe('relatorio.issue');
    for (const status of ['rascunho', 'em_campo', 'em_revisao', null, undefined] as const) for (const op of reopening) expect(reopenNeed(op, status)).toBe('none');
    // Never an edit: a suggestion confirmed (its value lands as a sheet op, which counts), a non-photo file, a server op.
    expect(reopenNeed(edit(`suggestion/${ID}/status`, 'confirmed'), 'emitido')).toBe('none');
    expect(reopenNeed(edit(`file/${ID}`, { kind: 'certificate' }, 'create'), 'emitido')).toBe('none');
    expect(reopenNeed({ ...edit(`sheet/${ID}/observations`), actor_id: 'system:files' }, 'emitido')).toBe('none');
  });

  it('relatorioWriteRefusal: no fill refuses everywhere; on Emitido a role that fills and does not issue is refused by issue; Admin and Responsável Técnico write', () => {
    expect(relatorioWriteRefusal(systemRoleRow('consulta'), 'rascunho')).toBe('relatorio.fill');
    expect(relatorioWriteRefusal(systemRoleRow('consulta'), 'emitido')).toBe('relatorio.fill');
    expect(relatorioWriteRefusal(systemRoleRow('engenheiro_de_campo'), 'em_revisao')).toBeNull();
    expect(relatorioWriteRefusal(systemRoleRow('engenheiro_de_campo'), 'emitido')).toBe('relatorio.issue');
    expect(relatorioWriteRefusal(systemRoleRow('gestor_do_projeto'), 'emitido')).toBe('relatorio.issue');
    expect(relatorioWriteRefusal(systemRoleRow('responsavel_tecnico'), 'emitido')).toBeNull();
    expect(relatorioWriteRefusal(systemRoleRow('admin'), 'emitido')).toBeNull();
    expect(relatorioWriteRefusal(null, 'emitido')).toBe('relatorio.fill');
    expect(readOnlyReasonText('relatorio.issue')).toBe('Seu papel não permite alterar um relatório emitido.');
    expect(readOnlyReasonText('relatorio.fill')).toBe('Seu papel não permite preencher fichas, fotos e pontos.');
  });
});
