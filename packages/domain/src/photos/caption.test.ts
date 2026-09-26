import { describe, expect, it } from 'vitest';
import type { RegistryRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getSeed } from '../seed/definitions.ts';
import { cameraContextText, captionWordFor, composeCaption, contextCaption, contextCaptionParts, type ContextCaptionMeta } from './caption.ts';

/*
 * 6.1-UNIT: the context caption, row by row of the spec's I/O matrix.
 */

const RELATORIO = '019966b0-0000-7000-8000-000000000101';
const CABINE = '019966b0-0000-7000-8000-000000000102';
const COLUNA = '019966b0-0000-7000-8000-000000000103';
const CHAVE = '019966b0-0000-7000-8000-000000000104';
const TRAFO = '019966b0-0000-7000-8000-000000000105';
const CABOS = '019966b0-0000-7000-8000-000000000106';

function block(id: string, blockType: string, locationId: string | null) {
  return { id, relatorio_id: RELATORIO, location_id: locationId, block_type: blockType, seed_version: 'v2' };
}

function snapshotWith(cabineName: string): RelatorioSnapshot {
  return {
    locations: [
      { id: CABINE, relatorio_id: RELATORIO, parent_id: null, name: cabineName, kind: 'cabine' },
      { id: COLUNA, relatorio_id: RELATORIO, parent_id: CABINE, name: 'Coluna 5', kind: 'coluna' },
    ],
    blocks: [block(CHAVE, 'chave_seccionadora', CABINE), block(TRAFO, 'transformador_forca', COLUNA), block(CABOS, 'cabos_saida', null)],
  } as unknown as RelatorioSnapshot;
}

const seed = getSeed('v2', 'cabine_primaria');

function meta(overrides: Partial<ContextCaptionMeta> = {}): ContextCaptionMeta {
  return { step: null, testKey: null, words: { atividades: seed.atividades, locais: seed.locais }, registry: [], ...overrides };
}

describe('6.1-UNIT-001 contextCaption', () => {
  it('an NC row: "verificação de ⟨item⟩" (f sg), the equipment and the cabine', () => {
    expect(contextCaption({ block_id: CHAVE, item_key: 'contatos' }, snapshotWith('Cubículo Enel'), meta({ step: 'verificacoes' }))).toBe(
      'Detalhe da verificação de contatos realizada na chave seccionadora do Cubículo Enel',
    );
  });

  it('the ensaios step: the seed atividade of the test on screen, plural agreement', () => {
    expect(contextCaption({ block_id: TRAFO, item_key: null }, snapshotWith('Oxigênio'), meta({ step: 'ensaios', testKey: 'isolacao' }))).toBe(
      'Detalhe dos ensaios de resistência de isolação realizados no transformador de força da Coluna 5 do Oxigênio',
    );
    expect(
      contextCaption({ block_id: CHAVE, item_key: null }, snapshotWith('Cubículo Enel'), meta({ step: 'ensaios', testKey: 'resistencia_contato' })),
    ).toBe('Detalhe dos ensaios de resistência de contato realizados na chave seccionadora do Cubículo Enel');
  });

  it('the ensaios step with no table on screen takes the block first test', () => {
    expect(contextCaption({ block_id: CHAVE, item_key: null }, snapshotWith('Cubículo Enel'), meta({ step: 'ensaios' }))).toBe(
      'Detalhe dos ensaios de resistência de isolação realizados na chave seccionadora do Cubículo Enel',
    );
  });

  it('a feminine cabine from the seed locais, matched case-insensitively', () => {
    expect(contextCaption({ block_id: CHAVE, item_key: 'contatos' }, snapshotWith('Cobertura lado B'), meta())).toBe(
      'Detalhe da verificação de contatos realizada na chave seccionadora da Cobertura lado B',
    );
  });

  it('a local registry row wins over the seed word and the default', () => {
    const registry = [
      { id: '019966b0-0000-7000-8000-000000000109', kind: 'local', name: 'cubículos de geração', gender: 'm', number: 'plural', removed_at: null },
      { id: '019966b0-0000-7000-8000-00000000010a', kind: 'local', name: 'Casa de Máquinas', gender: 'f', number: 'singular', removed_at: null },
    ] as RegistryRow[];
    expect(contextCaption({ block_id: CHAVE, item_key: null }, snapshotWith('Casa de máquinas'), meta({ registry }))).toBe(
      'Detalhe da chave seccionadora da Casa de máquinas',
    );
    expect(contextCaption({ block_id: CHAVE, item_key: null }, snapshotWith('Cubículos de Geração'), meta({ registry }))).toBe(
      'Detalhe da chave seccionadora dos Cubículos de Geração',
    );
  });

  it('no activity (placa or conclusão step): "Detalhe d⟨o/a⟩ ⟨equipamento⟩ d⟨o/a⟩ ⟨local⟩"', () => {
    for (const step of ['placa', 'conclusao'] as const) {
      expect(contextCaption({ block_id: CHAVE, item_key: null }, snapshotWith('Cubículo Enel'), meta({ step }))).toBe(
        'Detalhe da chave seccionadora do Cubículo Enel',
      );
    }
  });

  it('a missing part is left out, never invented', () => {
    // No cabine above the block: the equipment alone, plural agreement.
    expect(contextCaption({ block_id: CABOS, item_key: null }, snapshotWith('Cubículo Enel'), meta())).toBe('Detalhe dos cabos de saída');
    // An item key the seed does not know: no activity.
    expect(contextCaption({ block_id: CHAVE, item_key: 'nao_existe' }, snapshotWith('Cubículo Enel'), meta())).toBe(
      'Detalhe da chave seccionadora do Cubículo Enel',
    );
  });

  it('all parts unknown: null', () => {
    expect(contextCaption({ block_id: null, item_key: null }, snapshotWith('Cubículo Enel'), meta())).toBeNull();
    expect(contextCaption({ block_id: '019966b0-0000-7000-8000-0000000001ff', item_key: null }, snapshotWith('Cubículo Enel'), meta())).toBeNull();
  });

  it('composes no trailing period', () => {
    const caption = contextCaption({ block_id: CHAVE, item_key: 'contatos' }, snapshotWith('Cubículo Enel'), meta())!;
    expect(caption.endsWith('.')).toBe(false);
  });
});

describe('E6-Q5 the TAG and the column in the context caption', () => {
  const SUBSOLO = '019966b0-0000-7000-8000-000000000111';
  const COLUNA_1 = '019966b0-0000-7000-8000-000000000112';
  const ENEL = '019966b0-0000-7000-8000-000000000113';
  const SEC_C01 = '019966b0-0000-7000-8000-000000000114';
  const SEC_ENEL = '019966b0-0000-7000-8000-000000000115';
  const SEC_ENEL_2 = '019966b0-0000-7000-8000-000000000116';
  const BLANK = '019966b0-0000-7000-8000-000000000117';
  const EQ = (n: number) => `019966b0-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`;
  const withEquipment = (id: string, blockType: string, locationId: string, equipmentId: string) => ({ ...block(id, blockType, locationId), equipment_id: equipmentId });
  // Porto Seguro's shapes: a cabine with colunas, and Cubículo Enel holding its blocks directly.
  const snapshot = {
    locations: [
      { id: SUBSOLO, relatorio_id: RELATORIO, parent_id: null, name: '1° Subsolo', kind: 'cabine' },
      { id: COLUNA_1, relatorio_id: RELATORIO, parent_id: SUBSOLO, name: 'Coluna 1', kind: 'coluna' },
      { id: ENEL, relatorio_id: RELATORIO, parent_id: null, name: 'Cubículo Enel', kind: 'cabine' },
    ],
    blocks: [
      withEquipment(SEC_C01, 'chave_seccionadora', COLUNA_1, EQ(1)),
      withEquipment(SEC_ENEL, 'chave_seccionadora', ENEL, EQ(2)),
      withEquipment(SEC_ENEL_2, 'chave_seccionadora', ENEL, EQ(3)),
      withEquipment(BLANK, 'disjuntor_mt', COLUNA_1, EQ(4)),
    ],
    equipment: [
      { id: EQ(1), tag: 'SEC-C01' },
      { id: EQ(2), tag: 'SEC-ENEL' },
      { id: EQ(3), tag: 'SEC-ENEL-2' },
      { id: EQ(4), tag: '  ' },
    ],
  } as unknown as RelatorioSnapshot;

  it('a block under a coluna: the TAG after the equipment, then the coluna and its cabine', () => {
    expect(contextCaption({ block_id: SEC_C01, item_key: null }, snapshot, meta())).toBe('Detalhe da chave seccionadora SEC-C01 da Coluna 1 do 1° Subsolo');
    // The mock's sentence: the composer's activity chip on the same parts.
    const parts = contextCaptionParts({ block_id: SEC_C01, item_key: null }, snapshot, meta());
    expect(parts.equipamento).toEqual({ name: 'chave seccionadora SEC-C01', gender: 'f', number: 'singular' });
    expect(parts.local).toEqual({ name: 'Coluna 1 do 1° Subsolo', gender: 'f', number: 'singular' });
    const limpeza = captionWordFor('limpeza e reaperto', 'atividade', seed.atividades, []);
    expect(composeCaption({ ...parts, atividade: limpeza })).toBe('Detalhe da limpeza e reaperto realizada na chave seccionadora SEC-C01 da Coluna 1 do 1° Subsolo');
  });

  it('a recent equipment or local picked again agrees with its head word', () => {
    expect(captionWordFor('chave seccionadora SEC-C01', 'equipamento', [], [])).toEqual({ name: 'chave seccionadora SEC-C01', gender: 'f', number: 'singular' });
    expect(captionWordFor('cabos de saída CS-01', 'equipamento', [], [])).toMatchObject({ gender: 'm', number: 'plural' });
    expect(captionWordFor('Coluna 1 do 1° Subsolo', 'local', seed.locais, [])).toMatchObject({ gender: 'f', number: 'singular' });
  });

  it('a block directly in the cabine: the TAG, then the cabine; two seccionadoras differ by TAG', () => {
    const one = contextCaption({ block_id: SEC_ENEL, item_key: null }, snapshot, meta());
    const two = contextCaption({ block_id: SEC_ENEL_2, item_key: null }, snapshot, meta());
    expect(one).toBe('Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel');
    expect(two).toBe('Detalhe da chave seccionadora SEC-ENEL-2 do Cubículo Enel');
    expect(one).not.toBe(two);
  });

  it('an NC row keeps the activity before them', () => {
    expect(contextCaption({ block_id: SEC_C01, item_key: 'contatos' }, snapshot, meta({ step: 'verificacoes' }))).toBe(
      'Detalhe da verificação de contatos realizada na chave seccionadora SEC-C01 da Coluna 1 do 1° Subsolo',
    );
  });

  it('a blank TAG is left out', () => {
    expect(contextCaption({ block_id: BLANK, item_key: null }, snapshot, meta())).toBe('Detalhe do disjuntor de média tensão da Coluna 1 do 1° Subsolo');
  });
});

describe('6.1-UNIT-002 cameraContextText', () => {
  it('prefixes the caption, and says "foto geral" when there is none', () => {
    expect(cameraContextText('Detalhe da chave seccionadora do Cubículo Enel')).toBe('Contexto: Detalhe da chave seccionadora do Cubículo Enel');
    expect(cameraContextText(null)).toBe('Contexto: foto geral');
  });
});
