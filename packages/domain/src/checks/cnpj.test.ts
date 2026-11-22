import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpjFormat } from './cnpj.ts';

describe('isValidCnpjFormat', () => {
  // Story 27.2: a valid CNPJ also passes its two check digits (modulo 11).
  it('accepts 14 raw digits', () => {
    expect(isValidCnpjFormat('11222333000181')).toBe(true);
  });

  it('accepts 14 digits with the usual punctuation', () => {
    expect(isValidCnpjFormat('11.222.333/0001-81')).toBe(true);
  });

  it('Story 27.2: rejects 14 digits whose check digits do not match', () => {
    expect(isValidCnpjFormat('00.000.000/0001-00')).toBe(false);
    expect(isValidCnpjFormat('11.111.111/1111-11')).toBe(false);
  });

  it('rejects fewer than 14 digits', () => {
    expect(isValidCnpjFormat('0000000000010')).toBe(false);
  });

  it('rejects more than 14 digits', () => {
    expect(isValidCnpjFormat('000000000001000')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidCnpjFormat('')).toBe(false);
  });
});

describe('formatCnpj', () => {
  it('canonicalizes 14 raw digits to the standard punctuated form', () => {
    expect(formatCnpj('00000000000100')).toBe('00.000.000/0001-00');
  });

  it('canonicalizes an already-punctuated value to the same standard form', () => {
    expect(formatCnpj('00.000.000/0001-00')).toBe('00.000.000/0001-00');
  });

  it('leaves a value that is not exactly 14 digits unchanged', () => {
    expect(formatCnpj('0000000000010')).toBe('0000000000010');
  });
});
