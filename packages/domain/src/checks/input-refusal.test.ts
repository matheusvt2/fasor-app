import { describe, expect, it } from 'vitest';
import { INPUT_REFUSAL_KINDS } from '../contract/telemetry.ts';
import {
  cnpjInputRefusal,
  refusedFieldInputKind,
  refusedMeasurementKind,
  refusedNumberKind,
  refusedPlateDateKind,
  refusedReadingKind,
  voltageClassInputRefusal,
} from './input-refusal.ts';

/*
 * Story 18.4: why a typed value was refused, as the closed `kind` of an `input_refused`. The
 * kernel already decides each refusal; these name it, and never return the text.
 */

const INSULATION = { units: ['MΩ', 'GΩ', 'TΩ'] };
const POSITIVE = { units: ['MΩ', 'GΩ', 'TΩ'], positiveOnlyText: 'Leitura deve ser maior que zero.' };

describe('input refusal kinds (Story 18.4)', () => {
  it('a sheet number: an N/A where none is taken, else not a number', () => {
    expect(refusedNumberKind('abc')).toBe('not_a_number');
    expect(refusedNumberKind('1,2,3')).toBe('not_a_number');
    expect(refusedNumberKind('N/A')).toBe('not_applicable');
    expect(refusedNumberKind(' n.a ')).toBe('not_applicable');
  });

  it('a measurement cell: at or below zero on a positive-only cell, an N/A, else not a number', () => {
    expect(refusedMeasurementKind('abc', INSULATION, 'MΩ')).toBe('not_a_number');
    expect(refusedMeasurementKind('0', POSITIVE, 'MΩ')).toBe('not_positive');
    expect(refusedMeasurementKind('-5', POSITIVE, 'MΩ')).toBe('not_positive');
    expect(refusedMeasurementKind('-5', INSULATION, 'MΩ')).toBe('not_a_number');
    expect(refusedMeasurementKind('N/A', INSULATION, 'MΩ')).toBe('not_applicable');
  });

  it('a reading over a suggestion: a negative number is not positive, an N/A, else not a number', () => {
    expect(refusedReadingKind('-3')).toBe('not_positive');
    expect(refusedReadingKind('- 3,5')).toBe('not_positive');
    expect(refusedReadingKind('NA')).toBe('not_applicable');
    expect(refusedReadingKind('x12')).toBe('not_a_number');
    expect(refusedReadingKind('-x')).toBe('not_a_number');
  });

  it('a plate date: unreadable is not a date, readable but outside 1900 .. next year is out of range', () => {
    expect(refusedPlateDateKind('31/02/20')).toBe('not_a_date');
    expect(refusedPlateDateKind('ontem')).toBe('not_a_date');
    expect(refusedPlateDateKind('20/02/0001')).toBe('out_of_range');
    expect(refusedPlateDateKind('1850')).toBe('out_of_range');
  });

  it('a suggested field by its kind', () => {
    expect(refusedFieldInputKind({ kind: 'number' }, 'abc')).toBe('not_a_number');
    expect(refusedFieldInputKind({ kind: 'date' }, '1850')).toBe('out_of_range');
    expect(refusedFieldInputKind({ kind: 'date' }, 'abc')).toBe('not_a_date');
    expect(refusedFieldInputKind({ kind: 'voltage_class' }, 'abc')).toBe('not_a_number');
    expect(refusedFieldInputKind({ kind: 'select' }, 'Outro')).toBe('bad_format');
  });

  it('a CNPJ and a voltage class: null when accepted (blank included), else the kind', () => {
    expect(cnpjInputRefusal('')).toBeNull();
    expect(cnpjInputRefusal('  ')).toBeNull();
    expect(cnpjInputRefusal('12.345.678/0001-90')).toBeNull();
    expect(cnpjInputRefusal('123')).toBe('bad_format');
    expect(voltageClassInputRefusal('')).toBeNull();
    expect(voltageClassInputRefusal('17,5 kV')).toBeNull();
    expect(voltageClassInputRefusal('quinze')).toBe('not_a_number');
  });

  it('answers only kernel kinds', () => {
    const answers = [refusedNumberKind('x'), refusedMeasurementKind('x', INSULATION, null), refusedReadingKind('x'), refusedPlateDateKind('x'), refusedFieldInputKind({ kind: 'select' }, 'x'), cnpjInputRefusal('1'), voltageClassInputRefusal('x')];
    for (const kind of answers) expect(INPUT_REFUSAL_KINDS).toContain(kind);
  });
});
