import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpjFormat } from './cnpj.ts';

describe('isValidCnpjFormat', () => {
  it('accepts 14 raw digits', () => {
    expect(isValidCnpjFormat('00000000000100')).toBe(true);
  });

  it('accepts 14 digits with the usual punctuation', () => {
    expect(isValidCnpjFormat('00.000.000/0001-00')).toBe(true);
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
