import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { blockingRows, cabineSemEquipamentoText, preIssue, preIssueRowsFor } from './pre-issue.ts';

const TEMPLATE_ID = '019966b0-0051-7000-8000-000000000001';

/** A fresh relatório from the standard template, no setup, no client, no empresa. */
function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0052-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0053-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

describe('4.3-UNIT preIssue', () => {
  it('names each missing setup field on the cover, "0 de 94" on section 9, nothing blocking', () => {
    const rows = preIssue(fresh());
    expect(preIssueRowsFor(rows, 'capa').map((r) => [r.kind, r.text, r.severity])).toEqual([
      ['setup_missing', 'Cliente em branco', 'pending'],
      ['setup_missing', 'Início da parada em branco', 'pending'],
      ['setup_missing', 'Fim da parada em branco', 'pending'],
      ['setup_missing', 'Responsável técnico em branco', 'pending'],
      ['company', 'Razão social não cadastrada', 'info'],
      ['company', 'Logo da empresa não cadastrado', 'info'],
    ]);
    expect(preIssueRowsFor(rows, 'section_9').map((r) => [r.kind, r.text])).toEqual([['sheets', '0 de 94']]);
    expect(blockingRows(rows)).toEqual([]);
    expect(rows.every((r) => r.id !== '')).toBe(true);
  });

  it('flags a cabine that holds no equipment, on section 9', () => {
    const snapshot = fresh();
    const geradores = snapshot.locations.find((l) => l.name === 'Geradores')!;
    const without = { ...snapshot, blocks: snapshot.blocks.filter((b) => b.location_id !== geradores.id) };
    const rows = preIssue(without);
    expect(preIssueRowsFor(rows, 'section_9').map((r) => r.text)).toEqual(['0 de 75', cabineSemEquipamentoText('Geradores')]);
    expect(rows.find((r) => r.kind === 'cabine_sem_equipamento')).toMatchObject({ id: `cabine_sem_equipamento:${geradores.id}`, severity: 'pending' });
  });

  it('Q9: never says "Cabine" twice, whatever the case or accents of the name', () => {
    expect(cabineSemEquipamentoText('Geradores')).toBe('Cabine Geradores sem equipamento');
    expect(cabineSemEquipamentoText('1° Subsolo')).toBe('Cabine 1° Subsolo sem equipamento');
    expect(cabineSemEquipamentoText('Cabine QA')).toBe('Cabine QA sem equipamento');
    expect(cabineSemEquipamentoText('Cabine 7')).toBe('Cabine 7 sem equipamento');
    expect(cabineSemEquipamentoText('CABINE norte')).toBe('CABINE norte sem equipamento');
    expect(cabineSemEquipamentoText('Cabíne A')).toBe('Cabíne A sem equipamento');
    expect(cabineSemEquipamentoText('Cabine-7')).toBe('Cabine-7 sem equipamento');
    expect(cabineSemEquipamentoText('Cabine7')).toBe('Cabine7 sem equipamento');
    expect(cabineSemEquipamentoText('  Geradores ')).toBe('Cabine Geradores sem equipamento');
    // A word that only starts with the letters is not the prefix.
    expect(cabineSemEquipamentoText('Cabinet')).toBe('Cabine Cabinet sem equipamento');
  });

  it('over the Porto Seguro fixture: the client has no warning beyond its CNPJ, sheets and not-tested rows on section 9', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const rows = preIssue(snapshot);
    expect(preIssueRowsFor(rows, 'capa').map((r) => r.text)).toEqual(['Logo da empresa não cadastrado']);
    expect(preIssueRowsFor(rows, 'controle').map((r) => r.text)).toEqual(snapshot.client?.cnpj === null ? ['CNPJ do contratante em branco'] : []);
    expect(preIssueRowsFor(rows, 'section_9').map((r) => r.text)).toEqual(['3 de 94', '3 não ensaiadas']);
  });
});
