import { describe, expect, it } from 'vitest';
import {
  avatarInitial,
  councilLabel,
  defaultTitleForCouncil,
  registrationNumberLabel,
  registrationRowText,
  registrationSchema,
} from './registration.ts';

describe('defaultTitleForCouncil', () => {
  it('follows the council', () => {
    expect(defaultTitleForCouncil('crea')).toBe('Eng. Eletricista');
    expect(defaultTitleForCouncil('crt')).toBe('Técnico(a) em Eletrotécnica');
  });

  it('labels the council and its number field', () => {
    expect(councilLabel('crea')).toBe('CREA');
    expect(councilLabel('crt')).toBe('CRT');
    expect(registrationNumberLabel('crea')).toBe('Número CREA');
    expect(registrationNumberLabel('crt')).toBe('Número CRT');
  });
});

describe('registrationRowText', () => {
  it('reads council, number and title', () => {
    expect(
      registrationRowText({
        council: 'crea',
        registrationNumber: 'SP 5069912345',
        title: 'Eng. Eletricista',
      }),
    ).toBe('CREA SP 5069912345 · Eng. Eletricista');
  });

  it('reads the CRT equivalent', () => {
    expect(
      registrationRowText({
        council: 'crt',
        registrationNumber: 'SP 5069912345',
        title: 'Técnico(a) em Eletrotécnica',
      }),
    ).toBe('CRT SP 5069912345 · Técnico(a) em Eletrotécnica');
  });

  it('falls back to the council default title when none was typed', () => {
    expect(registrationRowText({ council: 'crt', registrationNumber: '123', title: null })).toBe(
      'CRT 123 · Técnico(a) em Eletrotécnica',
    );
  });

  it('reads "Não informado" without a council', () => {
    expect(registrationRowText({ council: null, registrationNumber: null, title: null })).toBe(
      'Não informado',
    );
  });

  it('keeps the council alone when the number is missing', () => {
    expect(registrationRowText({ council: 'crea', registrationNumber: '  ', title: 'Eng. Eletricista' })).toBe(
      'CREA · Eng. Eletricista',
    );
  });
});

describe('registrationSchema', () => {
  it('trims and accepts a complete registration', () => {
    expect(
      registrationSchema.parse({ council: 'crea', registrationNumber: ' SP 1 ', title: ' Eng. ' }),
    ).toEqual({ council: 'crea', registrationNumber: 'SP 1', title: 'Eng.' });
  });

  it('rejects an unknown council and an empty number', () => {
    expect(registrationSchema.safeParse({ council: 'cau', registrationNumber: '1', title: 'x' }).success).toBe(false);
    expect(registrationSchema.safeParse({ council: 'crea', registrationNumber: '  ', title: 'x' }).success).toBe(false);
  });
});

describe('avatarInitial', () => {
  it('is the first letter of the name', () => {
    expect(avatarInitial('Bruno Matsui')).toBe('B');
    expect(avatarInitial('  ')).toBe('?');
  });
});
