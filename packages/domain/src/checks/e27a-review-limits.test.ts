import { describe, expect, it } from 'vitest';
import { locationEnvPath, relatorioSetupPath } from '../ops/path.ts';
import { pointCardFields, pointMissingFields } from '../points/checks.ts';
import { cabineEnvCopy } from '../relatorio/ficha.ts';
import { confirmSuggestionOps, suggestionConfirmRefusal, suggestionCorrection } from '../relatorio/suggestion-ops.ts';
import type { PointRow, SuggestionRow } from '../schemas/entities.ts';
import { getSeed } from '../seed/definitions.ts';
import { numberRangeRefusal } from './input-refusal.ts';
import { numberValueRefusal, siteAltitudeRefusal } from './value-remarks.ts';

/*
 * Fix batch e27a-review, R2 and R7 (wave 1 review of PR #345, Story 27.2). R2: the three device paths that
 * still queued an impossible humidity (Confirmar of the thermo-hygrometer suggestion, a correction typed over
 * it, "Copiar do local anterior") ask the one kernel check the typed field asks (`numberValueRefusal`, over
 * `numberRangeOf` and `outsideRange`), so none writes an op the push route refuses. R7: the altitude's range
 * and the card's listed point fields are the kernel's. Every value is invented.
 */

const CABINE = '019966b0-0e27-7004-8000-000000000001';
const PREVIOUS = '019966b0-0e27-7004-8000-000000000002';
const RELATORIO = '019966b0-0e27-7004-8000-000000000003';
const humidityPath = locationEnvPath(CABINE, 'humidity_pct');
const temperaturePath = locationEnvPath(CABINE, 'temperature_c');
const n = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
const REFUSAL = 'Fora da faixa: 0 a 100 %';
const AUTHOR = { id: 'user-e27a', companyId: 'company-e27a' };
const humidityField = getSeed('v16', 'cabine_primaria').cabine.env.find((field) => field.key === 'humidity_pct')!;

function suggestion(targetPath: string, value: SuggestionRow['value']): Pick<SuggestionRow, 'id' | 'relatorio_id' | 'target_path' | 'value'> {
  return { id: '019966b0-0e27-7004-8000-0000000000aa', relatorio_id: RELATORIO, target_path: targetPath, value };
}

describe('e27a-review R2: one range rule on every device path', () => {
  it('numberValueRefusal judges a number value by its path\'s range, as the typed field does', () => {
    expect(numberValueRefusal(humidityPath, n('150', '%'))).toBe(REFUSAL);
    expect(numberValueRefusal(humidityPath, n('100.1', '%'))).toBe(REFUSAL);
    expect(numberValueRefusal(humidityPath, n('-0.1', '%'))).toBe(REFUSAL);
    expect(numberValueRefusal(humidityPath, n('0', '%'))).toBeNull();
    expect(numberValueRefusal(humidityPath, n('100', '%'))).toBeNull();
    // The typed field's message is the same one.
    expect(numberValueRefusal(humidityPath, n('150', '%'))).toBe(numberRangeRefusal('150', '%', { min: 0, max: 100 }));
    // A path with no range, an empty value and a raw that is no plain decimal are not judged.
    expect(numberValueRefusal(temperaturePath, n('999', '°C'))).toBeNull();
    expect(numberValueRefusal(humidityPath, null)).toBeNull();
    expect(numberValueRefusal(humidityPath, { raw: '', unit: '%', state: 'empty' })).toBeNull();
  });

  it('Confirmar: a suggestion whose value is refused writes no op at all (never "confirmed" with no value) and says why', () => {
    const refused = suggestion(humidityPath, n('150', '%'));
    expect(suggestionConfirmRefusal(refused)).toBe(REFUSAL);
    expect(confirmSuggestionOps(AUTHOR, refused)).toEqual([]);
    expect(confirmSuggestionOps(AUTHOR, refused, { auto: true })).toEqual([]);
    const accepted = suggestion(humidityPath, n('65', '%'));
    expect(suggestionConfirmRefusal(accepted)).toBeNull();
    const ops = confirmSuggestionOps(AUTHOR, accepted);
    expect(ops.map((op) => [op.path, op.value])).toEqual([
      [`suggestion/${accepted.id}/status`, 'confirmed'],
      [humidityPath, n('65', '%')],
    ]);
    // The value a caller passes in place of the suggestion's is the one judged.
    expect(confirmSuggestionOps(AUTHOR, accepted, { value: n('150', '%') })).toEqual([]);
    // A suggestion on a path with no range is confirmed as before.
    expect(confirmSuggestionOps(AUTHOR, suggestion(temperaturePath, n('999', '°C')))).toHaveLength(2);
  });

  it('a correction typed over the suggestion: refused with the range\'s message, the field\'s own refusal for no number, the value otherwise', () => {
    expect(suggestionCorrection(humidityField, '150', humidityPath)).toEqual({ ok: false, refusal: REFUSAL });
    expect(suggestionCorrection(humidityField, '100,1', humidityPath)).toEqual({ ok: false, refusal: REFUSAL });
    expect(suggestionCorrection(humidityField, 'abc', humidityPath)).toEqual({ ok: false, refusal: null });
    expect(suggestionCorrection(humidityField, '65', humidityPath)).toEqual({ ok: true, value: n('65', '%') });
    expect(suggestionCorrection(humidityField, '', humidityPath)).toEqual({ ok: true, value: null });
  });

  it('"Copiar do local anterior": a refused value stored before the range is skipped and named; the other is copied', () => {
    const old = cabineEnvCopy({ cabineId: PREVIOUS, name: 'Cabine 1', temperature_c: n('25', '°C'), humidity_pct: n('150', '%') }, CABINE, 'v16');
    expect(old.values).toEqual([{ key: 'temperature_c', value: n('25', '°C') }]);
    expect(old.skippedText).toBe(`Umidade relativa do ar não copiada: ${REFUSAL}`);
    const fine = cabineEnvCopy({ cabineId: PREVIOUS, name: 'Cabine 1', temperature_c: n('999', '°C'), humidity_pct: n('65', '%') }, CABINE, 'v16');
    expect(fine.values).toEqual([
      { key: 'temperature_c', value: n('999', '°C') },
      { key: 'humidity_pct', value: n('65', '%') },
    ]);
    expect(fine.skippedText).toBeNull();
  });
});

describe('e27a-review R7: the rules the screens rendered on their own are the kernel\'s', () => {
  it('siteAltitudeRefusal: whole metres outside -500 to 9000 m, on the site altitude\'s own path', () => {
    expect(numberValueRefusal(relatorioSetupPath('site_altitude_m'), 99999, 'm')).toBe('Fora da faixa: -500 a 9000 m');
    expect(siteAltitudeRefusal('99999')).toBe('Fora da faixa: -500 a 9000 m');
    expect(siteAltitudeRefusal('-501')).toBe('Fora da faixa: -500 a 9000 m');
    expect(siteAltitudeRefusal('9000')).toBeNull();
    expect(siteAltitudeRefusal('9000.4')).toBeNull();
    expect(siteAltitudeRefusal('-500')).toBeNull();
    expect(siteAltitudeRefusal('')).toBeNull();
    expect(siteAltitudeRefusal('abc')).toBeNull();
  });

  it('pointCardFields: the fields a card lists are those the point does not lack; none when it lacks all four', () => {
    const point = (fields: Partial<Pick<PointRow, 'action' | 'deadline' | 'priority' | 'owner' | 'origin'>>) => ({
      action: null,
      deadline: null,
      priority: null,
      owner: null,
      origin: 'manual',
      ...fields,
    }) as Pick<PointRow, 'action' | 'deadline' | 'priority' | 'owner' | 'origin'>;
    expect(pointCardFields(point({}))).toEqual([]);
    expect(pointCardFields(point({ action: 'Trocar', owner: 'Cliente' }))).toEqual(['acao', 'responsavel']);
    expect(pointCardFields(point({ action: 'Trocar', deadline: '2026-12-01', priority: 'P1', owner: 'Cliente' }))).toEqual(['acao', 'prazo', 'prioridade', 'responsavel']);
    // A point from an untested sheet is never asked for an action: its row stays, the other three missing.
    const notTested = point({ origin: 'not_tested' });
    expect(pointMissingFields(notTested)).toEqual(['prazo', 'prioridade', 'responsavel']);
    expect(pointCardFields(notTested)).toEqual(['acao']);
  });
});
