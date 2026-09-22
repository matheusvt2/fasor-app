import { describe, expect, it } from 'vitest';
import { asCompanyId } from './company-id.ts';

describe('asCompanyId (AD-4, AD-10)', () => {
  it('brands a uuidv7', () => {
    const id = '0a000000-0000-7000-8000-00000000000a';
    expect(asCompanyId(id)).toBe(id);
  });

  it('refuses a v4 uuid, which no op could ever carry', () => {
    expect(() => asCompanyId('8f3a2c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b')).toThrow(/uuidv7/);
  });

  it('refuses anything that is not a uuid', () => {
    expect(() => asCompanyId('seed-company-a')).toThrow(/uuidv7/);
    expect(() => asCompanyId('')).toThrow(/uuidv7/);
  });
});
