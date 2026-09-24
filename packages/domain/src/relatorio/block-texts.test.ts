import { describe, expect, it } from 'vitest';
import type { EquipmentRow } from '../schemas/entities.ts';
import { addedText, moveAnnouncement, renamedText } from '../templates/text.ts';
import {
  agruparToggledText,
  blockCreatedText,
  blockMovedText,
  duplicateTagText,
  removeBlockTitle,
  tagRenamedText,
  tagTakenText,
  tagVerdict,
} from './block-texts.ts';

const row = (id: string, tag: string, removed_at: string | null = null): EquipmentRow => ({
  id,
  project_id: '019966b0-0003-7000-8000-000000000004',
  tag,
  type: 'chave_seccionadora',
  last_nameplate: null,
  removed_at,
});

describe('4.5-UNIT block texts', () => {
  it('writes the move, creation, TAG and remove sentences', () => {
    expect(blockMovedText('SEC-C09', 3, 5)).toBe('SEC-C09 movido para a posição 3 de 5');
    expect(blockCreatedText('SEC-C09', 'Coluna 9')).toBe('SEC-C09 criada na Coluna 9');
    expect(tagTakenText('SEC-C05', '1° Subsolo › Coluna 5')).toBe('TAG já existe nesta obra — SEC-C05 em 1° Subsolo › Coluna 5');
    expect(tagTakenText('SEC-C05', null)).toBe('TAG já existe nesta obra — SEC-C05');
    expect(duplicateTagText('SEC-C05')).toBe('TAG SEC-C05 duplicada');
    expect(tagRenamedText('SEC-C05A')).toBe('TAG alterada para SEC-C05A');
    expect(agruparToggledText('1° Subsolo', true)).toBe('Agrupar por tipo ativado em 1° Subsolo');
    expect(agruparToggledText('1° Subsolo', false)).toBe('Agrupar por tipo desativado em 1° Subsolo');
    expect(removeBlockTitle('SEC-C05')).toBe('Remover ficha SEC-C05?');
  });

  it('names location moves, additions and renames (moveAnnouncement is the composer one)', () => {
    expect(moveAnnouncement('coluna', 'Coluna 5', 1, 17)).toBe('Coluna 5 movida para a posição 1 de 17');
    expect(moveAnnouncement('cabine', 'Geradores', 2, 6)).toBe('Cabine Geradores movida para a posição 2 de 6');
    expect(addedText('coluna', 'Coluna 18')).toBe('Coluna 18 adicionada');
    expect(addedText('cabine', 'Cabine 7')).toBe('Cabine 7 adicionada');
    expect(renamedText('coluna', 'Entrada')).toBe('Coluna Entrada renomeada');
  });

  it('tagVerdict: empty, taken by another live row (trimmed, any case), never by the row itself or a removed one', () => {
    const equipment = [row('a', 'SEC-C05'), row('b', 'DJ-C05'), row('c', 'TP-C05', '2026-09-07T10:00:00.000Z')];
    expect(tagVerdict('  ', equipment)).toEqual({ reason: 'empty' });
    expect(tagVerdict('sec-c05 ', equipment)).toEqual({ reason: 'taken', holder: { id: 'a', tag: 'SEC-C05' } });
    expect(tagVerdict('SEC-C05', equipment, 'a')).toBeNull();
    expect(tagVerdict('TP-C05', equipment)).toBeNull();
    expect(tagVerdict('SEC-C09', equipment)).toBeNull();
  });
});
