import { describe, expect, it } from 'vitest';
import { defaultEmpresaRow, empresaRegistered } from './empresa.ts';

describe('F-15 empresaRegistered', () => {
  it('is false with no row or a row with no razão social, true once it has one', () => {
    expect(empresaRegistered(null)).toBe(false);
    expect(empresaRegistered(defaultEmpresaRow('019966b0-0000-7000-8000-000000000001'))).toBe(false);
    expect(empresaRegistered({ ...defaultEmpresaRow('019966b0-0000-7000-8000-000000000001'), name: '  ' })).toBe(false);
    expect(empresaRegistered({ ...defaultEmpresaRow('019966b0-0000-7000-8000-000000000001'), name: 'Empresa B' })).toBe(true);
  });
});
