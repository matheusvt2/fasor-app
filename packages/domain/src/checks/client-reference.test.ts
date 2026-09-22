import { describe, expect, it } from 'vitest';
import type { ProjectRow } from '../schemas/entities.ts';
import { isClientReferenced } from './client-reference.ts';

const CLIENT_ID = '019966b0-0004-7000-8000-000000000001';
const OTHER_CLIENT_ID = '019966b0-0004-7000-8000-000000000002';

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: '019966b0-0004-7000-8000-000000000010',
    client_id: CLIENT_ID,
    name: 'Unidade Norte',
    site: null,
    removed_at: null,
    ...overrides,
  };
}

describe('isClientReferenced', () => {
  it('is false with no projects', () => {
    expect(isClientReferenced(CLIENT_ID, [])).toBe(false);
  });

  it('is false when no live project points at this client', () => {
    expect(isClientReferenced(CLIENT_ID, [project({ client_id: OTHER_CLIENT_ID })])).toBe(false);
  });

  it('is true when a live project still points at this client', () => {
    expect(isClientReferenced(CLIENT_ID, [project()])).toBe(true);
  });

  it('ignores a removed project', () => {
    expect(isClientReferenced(CLIENT_ID, [project({ removed_at: '2026-09-22T00:00:00.000Z' })])).toBe(false);
  });
});
