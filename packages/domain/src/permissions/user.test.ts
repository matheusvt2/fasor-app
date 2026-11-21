import { describe, expect, it } from 'vitest';
import { userRowSchema } from '../schemas/entities.ts';
import { isAdminRole, type RoleLike } from './can.ts';
import { lastAdminVerdict, type LastAdminUser } from './last-admin.ts';
import { systemRoleRow } from './roles.ts';
import { activeUser, USER_STATUSES, userStatusLabel, userStatusOf } from './user.ts';

const A = '019966b0-0000-7000-8000-0000000000a1';
const B = '019966b0-0000-7000-8000-0000000000a2';
const C = '019966b0-0000-7000-8000-0000000000a3';
const admin = systemRoleRow('admin');
const campo = systemRoleRow('engenheiro_de_campo');
const custom: RoleLike = { id: '019966b0-0000-7000-8000-0000000000c1', name: 'Admin', permissions: [] } as RoleLike;

describe('26.2-UNIT-004 the user status and its words', () => {
  it('four statuses, each with its pt-BR word', () => {
    expect(USER_STATUSES).toEqual(['active', 'invited', 'paused', 'removed']);
    expect(USER_STATUSES.map(userStatusLabel)).toEqual(['Ativo', 'Convidado', 'Pausado', 'Removido']);
  });

  it('only an active user acts; an absent status counts as active', () => {
    expect(activeUser({})).toBe(true);
    expect(activeUser({ status: null })).toBe(true);
    expect(userStatusOf({})).toBe('active');
    expect(USER_STATUSES.filter((status) => activeUser({ status }))).toEqual(['active']);
  });

  it('the user row takes role_id and status, both optional: a row born before contract 55 parses to the same bytes', () => {
    const before = { id: A, name: 'Ana', email: 'ana@x.dev', council: null, registration_number: null, title: null, photo_location_enabled: false };
    expect(userRowSchema.parse(before)).toEqual(before);
    expect(Object.keys(userRowSchema.parse(before))).toEqual(Object.keys(before));
    const after = { ...before, role_id: admin.id, status: 'paused' as const };
    expect(userRowSchema.parse(after)).toEqual(after);
    expect(userRowSchema.safeParse({ ...before, status: 'blocked' }).success).toBe(false);
    expect(userRowSchema.safeParse({ ...before, role_id: 'admin' }).success).toBe(false);
  });
});

describe('26.2-UNIT-005 the last active Admin', () => {
  const one: LastAdminUser[] = [
    { id: A, status: 'active', role: admin },
    { id: B, status: 'active', role: campo },
  ];
  const two: LastAdminUser[] = [...one, { id: C, role: admin }];

  it.each([
    ['pause', { user_id: A, status: 'paused' as const }],
    ['remove', { user_id: A, status: 'removed' as const }],
    ['another role', { user_id: A, role: campo }],
    ['a custom role named Admin', { user_id: A, role: custom }],
    ['no role', { user_id: A, role: null }],
  ])('one active Admin: %s is refused, and allowed with a second active Admin', (_name, change) => {
    expect(lastAdminVerdict(one, change)).toEqual({ ok: false, reason: 'last_admin' });
    expect(lastAdminVerdict(two, change)).toEqual({ ok: true });
  });

  it('a second Admin who is not active does not count', () => {
    const pausedSecond: LastAdminUser[] = [...one, { id: C, status: 'paused', role: admin }];
    expect(lastAdminVerdict(pausedSecond, { user_id: A, status: 'paused' })).toEqual({ ok: false, reason: 'last_admin' });
  });

  it('a change to another user, or one that keeps the Admin active, is allowed', () => {
    expect(lastAdminVerdict(one, { user_id: B, status: 'paused' })).toEqual({ ok: true });
    expect(lastAdminVerdict(one, { user_id: B, role: admin })).toEqual({ ok: true });
    expect(lastAdminVerdict(one, { user_id: A, status: 'active' })).toEqual({ ok: true });
    expect(lastAdminVerdict(one, { user_id: A, role: admin })).toEqual({ ok: true });
  });

  it('reactivating an Admin is allowed even where no active Admin exists yet', () => {
    const none: LastAdminUser[] = [{ id: A, status: 'paused', role: admin }];
    expect(lastAdminVerdict(none, { user_id: A, status: 'active' })).toEqual({ ok: true });
    expect(isAdminRole(custom)).toBe(false);
  });
});
