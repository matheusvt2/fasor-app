import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from './ops/apply.ts';
import { makeOp } from './ops/op.ts';
import { userRowSchema, type UserRow } from './schemas/entities.ts';
import {
  artOrTrtLabel,
  artTrtEchoText,
  avatarInitial,
  registrationOfUserRow,
  registrationPuts,
  userProfileSchema,
  councilLabel,
  defaultResponsibleId,
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

describe('4.2-UNIT artOrTrtLabel / artTrtEchoText', () => {
  it('relabels ART/TRT by council', () => {
    expect(artOrTrtLabel('crea')).toBe('ART');
    expect(artOrTrtLabel('crt')).toBe('TRT');
  });

  it('is null until both the label and the number exist', () => {
    expect(artTrtEchoText(null, '2620262602583')).toBeNull();
    expect(artTrtEchoText('ART', null)).toBeNull();
    expect(artTrtEchoText('ART', '')).toBeNull();
  });

  it('echoes the seção 10 sentence once both exist', () => {
    expect(artTrtEchoText('ART', '2620262602583')).toBe(
      'Na seção 10: "Este relatório tem validade apenas acompanhada da ART 2620262602583"',
    );
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

describe('registration as user ops (retro A2)', () => {
  const USER = '019966b0-0000-7000-8000-0000000000a1';
  const COMPANY = '019966b0-0000-7000-8000-0000000000a2';
  const row: UserRow = userRowSchema.parse({
    id: USER,
    name: 'Ana Alves',
    email: 'a@teste.local',
    council: 'crea',
    registration_number: 'SP 1',
    title: 'Eng. Eletricista',
    photo_location_enabled: false,
  });

  it('writes one user/{id}/{field} put per registration field, as the user about their own row', () => {
    const puts = registrationPuts({
      userId: USER,
      companyId: COMPANY,
      registration: { council: 'crt', registrationNumber: 'SP 7777', title: 'Técnico(a) em Eletrotécnica' },
    });
    expect(puts.map((p) => [p.path, p.value])).toEqual([
      [`user/${USER}/council`, 'crt'],
      [`user/${USER}/registration_number`, 'SP 7777'],
      [`user/${USER}/title`, 'Técnico(a) em Eletrotécnica'],
    ]);
    for (const put of puts) {
      expect(put).toMatchObject({ kind: 'put', scope: 'company', company_id: COMPANY, actor_id: USER });
      expect('device_id' in put).toBe(false);
    }
  });

  it('writes only the fields that differ from what the device shows, and nothing for an unchanged save', () => {
    const registration = { council: 'crea' as const, registrationNumber: 'SP 2', title: 'Eng. Eletricista' };
    const changed = registrationPuts({ userId: USER, companyId: COMPANY, registration, current: registrationOfUserRow(row) });
    expect(changed.map((p) => p.path)).toEqual([`user/${USER}/registration_number`]);
    const same = registrationPuts({
      userId: USER,
      companyId: COMPANY,
      registration: { council: 'crea', registrationNumber: 'SP 1', title: 'Eng. Eletricista' },
      current: registrationOfUserRow(row),
    });
    expect(same).toEqual([]);
  });

  it('round-trips through applyOp into the kernel user row, and reads back as the row text source', () => {
    let state: EntityState = new Map([[entityKey('user', USER), row]]);
    let n = 0;
    const newId = () => `019966b0-0001-7000-8000-${String(++n).padStart(12, '0')}`;
    const puts = registrationPuts({
      userId: USER,
      companyId: COMPANY,
      registration: { council: 'crt', registrationNumber: 'SP 7777', title: 'Téc.' },
    });
    for (const put of puts) {
      state = applyOp(state, makeOp({ ...put, device_id: 'tablet-a' }, { newId, now: new Date('2026-09-22T12:00:00Z') }));
    }
    const next = state.get(entityKey('user', USER)) as UserRow;
    expect(registrationOfUserRow(next)).toEqual({ council: 'crt', registrationNumber: 'SP 7777', title: 'Téc.' });
    expect(registrationRowText(registrationOfUserRow(next))).toBe('CRT SP 7777 · Téc.');
  });

  it('carries uuidv7 identity ids on the profile', () => {
    const profile = {
      id: USER,
      name: 'Ana Alves',
      email: 'a@teste.local',
      companyId: COMPANY,
      companyName: 'Empresa A',
      council: null,
      registrationNumber: null,
      title: null,
    };
    expect(userProfileSchema.safeParse(profile).success).toBe(true);
    expect(userProfileSchema.safeParse({ ...profile, id: 'seed-user-a-teste-local' }).success).toBe(false);
  });
});

describe('avatarInitial', () => {
  it('is the first letter of the name', () => {
    expect(avatarInitial('Bruno Matsui')).toBe('B');
    expect(avatarInitial('  ')).toBe('?');
  });
});

describe('Epic 4 QA Q2 defaultResponsibleId', () => {
  const id = '019966b0-0003-7000-8000-000000000002';
  it('is the signed-in user when they carry a council and a number', () => {
    expect(defaultResponsibleId({ id, council: 'crea', registrationNumber: 'SP 5069912345' })).toBe(id);
  });
  it('is nobody without a council or with a blank number', () => {
    expect(defaultResponsibleId({ id, council: null, registrationNumber: 'SP 1' })).toBeNull();
    expect(defaultResponsibleId({ id, council: 'crt', registrationNumber: '  ' })).toBeNull();
    expect(defaultResponsibleId({ id, council: 'crt', registrationNumber: null })).toBeNull();
  });
});
