import { describe, expect, it } from 'vitest';
import type { RegistryRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getSeed } from '../seed/definitions.ts';
import {
  captionChipOptions,
  captionWordFor,
  composeCaption,
  contextCaption,
  contextCaptionParts,
  equipmentChipOptions,
  type ContextCaptionMeta,
} from './caption.ts';

/*
 * 6.5-UNIT: the composer's grammar is the context caption's (`composeCaption`), its prefill
 * (`contextCaptionParts`), the agreement of a picked or typed word and the chip rows.
 * `caption.test.ts` keeps the 6.1 cases unchanged.
 */

const RELATORIO = '019966b0-0000-7000-8000-000000000101';
const CABINE = '019966b0-0000-7000-8000-000000000102';
const CHAVE = '019966b0-0000-7000-8000-000000000104';
const TRAFO = '019966b0-0000-7000-8000-000000000105';

function block(id: string, blockType: string, locationId: string | null, orderKey: string) {
  return {
    id,
    relatorio_id: RELATORIO,
    location_id: locationId,
    block_type: blockType,
    seed_version: 'v2',
    order_key: orderKey,
    removed_at: null,
    equipment_id: null,
    not_tested: null,
    config: null,
    sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
  };
}

function snapshotWith(cabineName: string): RelatorioSnapshot {
  return {
    locations: [{ id: CABINE, relatorio_id: RELATORIO, parent_id: null, name: cabineName, kind: 'cabine', order_key: 'a0', removed_at: null }],
    blocks: [block(CHAVE, 'chave_seccionadora', CABINE, 'a0'), block(TRAFO, 'transformador_forca', CABINE, 'a1')],
    equipment: [],
  } as unknown as RelatorioSnapshot;
}

const seed = getSeed('v2', 'cabine_primaria');

function meta(): ContextCaptionMeta {
  return { step: null, testKey: null, words: { atividades: seed.atividades, locais: seed.locais }, registry: [] };
}

describe('6.5-UNIT-001 composeCaption and the composer parts', () => {
  it('contextCaptionParts is the prefill, and composeCaption of it is the context caption', () => {
    const snapshot = snapshotWith('Cubículo Enel');
    const parts = contextCaptionParts({ block_id: CHAVE, item_key: 'contatos' }, snapshot, meta());
    expect(parts).toEqual({
      atividade: { name: 'verificação de contatos', gender: 'f', number: 'singular' },
      equipamento: { name: 'chave seccionadora', gender: 'f', number: 'singular' },
      local: { name: 'Cubículo Enel', gender: 'm', number: 'singular' },
    });
    expect(composeCaption(parts)).toBe(contextCaption({ block_id: CHAVE, item_key: 'contatos' }, snapshot, meta()));
    expect(contextCaptionParts({ block_id: null, item_key: null }, snapshot, meta())).toEqual({ atividade: null, equipamento: null, local: null });
  });

  it('a chip change rebuilds with agreement; a blank part is left out; none at all is null', () => {
    const limpeza = captionWordFor('limpeza e reaperto', 'atividade', seed.atividades, [])!;
    expect(limpeza).toEqual({ name: 'limpeza e reaperto', gender: 'f', number: 'singular' });
    const cabos = captionWordFor('cabos de entrada', 'equipamento', [], [])!;
    expect(cabos).toMatchObject({ gender: 'm', number: 'plural' });
    expect(composeCaption({ atividade: limpeza, equipamento: cabos, local: { name: 'Oxigênio', gender: 'm', number: 'singular' } })).toBe(
      'Detalhe da limpeza e reaperto realizada nos cabos de entrada do Oxigênio',
    );
    expect(composeCaption({ atividade: { name: '  ', gender: 'm', number: 'singular' }, equipamento: null, local: null })).toBeNull();
    expect(composeCaption({ atividade: null, equipamento: null, local: null })).toBeNull();
  });

  it('a typed word: the registry row, then the seed, else masculine singular; blank is null', () => {
    const registry = [
      { id: '019966b0-0000-7000-8000-00000000010b', kind: 'atividade', name: 'Termografia', gender: 'f', number: 'singular', removed_at: null },
    ] as RegistryRow[];
    expect(captionWordFor('termografia', 'atividade', seed.atividades, registry)).toEqual({ name: 'termografia', gender: 'f', number: 'singular' });
    expect(captionWordFor('Cobertura lado B', 'local', seed.locais, [])).toMatchObject({ gender: 'f' });
    expect(captionWordFor('inspeção visual', 'atividade', seed.atividades, [])).toEqual({ name: 'inspeção visual', gender: 'm', number: 'singular' });
    expect(captionWordFor('   ', 'local', seed.locais, [])).toBeNull();
  });

  it('chip options: prefill, five recents, then the seed, deduplicated case-insensitively', () => {
    const recents = ['limpeza e reaperto', 'a', 'b', 'c', 'd', 'e'];
    expect(captionChipOptions('Limpeza e reaperto', recents, ['LIMPEZA E REAPERTO', 'f'])).toEqual(['Limpeza e reaperto', 'a', 'b', 'c', 'd', 'f']);
    expect(captionChipOptions(null, [], ['x', 'X', ' '])).toEqual(['x']);
  });

  it('equipment options: the photo sheet first, then the relatório types in block order, each once', () => {
    const words = equipmentChipOptions(snapshotWith('Cubículo Enel'), TRAFO).map((word) => word.name);
    expect(words).toEqual(['transformador de força', 'chave seccionadora']);
  });
});
