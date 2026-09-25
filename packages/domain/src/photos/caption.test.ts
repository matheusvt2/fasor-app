import { describe, expect, it } from 'vitest';
import type { RegistryRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getSeed } from '../seed/definitions.ts';
import { cameraContextText, contextCaption, type ContextCaptionMeta } from './caption.ts';

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
      'Detalhe dos ensaios de resistência de isolação realizados no transformador de força do Oxigênio',
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

describe('6.1-UNIT-002 cameraContextText', () => {
  it('prefixes the caption, and says "foto geral" when there is none', () => {
    expect(cameraContextText('Detalhe da chave seccionadora do Cubículo Enel')).toBe('Contexto: Detalhe da chave seccionadora do Cubículo Enel');
    expect(cameraContextText(null)).toBe('Contexto: foto geral');
  });
});
