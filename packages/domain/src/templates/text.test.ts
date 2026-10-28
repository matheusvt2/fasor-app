import { describe, expect, it } from 'vitest';
import { getDefinition, siteItems } from '../seed/definitions.ts';
import { standardTemplate, templateTotals, zeroTotals } from '../seed/template.ts';
import { addCabine, addColuna, addPainel, composerView, findComposerNode, setAgruparPorTipo, setQuantity } from './compose.ts';
import { emptyTemplate } from './list.ts';
import {
  defaultCabineName,
  defaultColunaName,
  defaultPainelName,
  colunaInLocalText,
  colunaInPainelText,
  localSubText,
  painelInLocalText,
  paletteTargetText,
  moveAnnouncement,
  naDefaultsCountText,
  nodeSummaryText,
  quantityLabel,
  removedText,
  restoredText,
  sectionsHeading,
  skeletonHeading,
  subBlockSummaryText,
  templateSummaryText,
  totalsText,
} from './text.ts';

const standard = standardTemplate({ id: '019966b0-0035-7000-8000-000000000001' });

describe('3.3-UNIT templateSummaryText', () => {
  it('reads the seed, the sections and the skeleton counts of the standard template', () => {
    expect(templateSummaryText(standard, 0)).toBe('Semente v10 · 9 seções · 6 locais · 17 colunas · 94 blocos de equipamento');
  });

  it('adds the use at one and at many, and omits every zero part except the sections', () => {
    expect(templateSummaryText(standard, 1)).toMatch(/ · usado em 1 relatório$/);
    expect(templateSummaryText(standard, 3)).toMatch(/ · usado em 3 relatórios$/);
    expect(templateSummaryText(emptyTemplate('019966b0-0035-7000-8000-000000000002', 'v1'), 0)).toBe('Semente v1 · 0 seções');
    const one = { ...emptyTemplate('019966b0-0035-7000-8000-000000000002', 'v1'), skeleton: addCabine([], 'c', 'C') };
    const withBlock = { ...one, blocks: setQuantity(one, 'c', 'tp', 1) };
    expect(templateSummaryText(withBlock, 0)).toBe('Semente v1 · 0 seções · 1 local · 1 bloco de equipamento');
  });
});

describe('3.4-UNIT totalsText and quantityLabel', () => {
  it('reads the mock line for the reference job, in the mock order', () => {
    expect(totalsText(templateTotals(standard))).toBe(
      '25 seccionadoras · 21 disjuntores · 11 TP · 11 TC · 8 trafos · 4 cabos de entrada · 9 cabos de saída · 5 para-raios',
    );
  });

  it('omits zeros, uses the singular at one, and names an empty composition', () => {
    expect(totalsText({ ...zeroTotals(), chave_seccionadora: 1, transformador_forca: 1, para_raio: 1, cabos_entrada: 1 })).toBe(
      '1 seccionadora · 1 trafo · 1 cabo de entrada · 1 para-raio',
    );
    expect(totalsText(zeroTotals())).toBe('Nenhum equipamento');
  });

  it('reads every type in the singular at one and the plural at two', () => {
    const expected: Record<string, [string, string]> = {
      chave_seccionadora: ['1 seccionadora', '2 seccionadoras'],
      disjuntor_mt: ['1 disjuntor', '2 disjuntores'],
      tp: ['1 TP', '2 TP'],
      tc: ['1 TC', '2 TC'],
      transformador_forca: ['1 trafo', '2 trafos'],
      cabos_entrada: ['1 cabo de entrada', '2 cabos de entrada'],
      cabos_saida: ['1 cabo de saída', '2 cabos de saída'],
      para_raio: ['1 para-raio', '2 para-raios'],
    };
    for (const [type, [one, two]] of Object.entries(expected)) {
      expect(totalsText({ ...zeroTotals(), [type]: 1 })).toBe(one);
      expect(totalsText({ ...zeroTotals(), [type]: 2 })).toBe(two);
    }
  });

  it('names the stepper "Seccionadoras, 25"', () => {
    expect(quantityLabel('chave_seccionadora', 25)).toBe('Seccionadoras, 25');
    expect(quantityLabel('tp', 0)).toBe('TP, 0');
    expect(quantityLabel('transformador_forca', 1)).toBe('Transformadores, 1');
  });
});

describe('3.4-UNIT composer headings and node summaries', () => {
  it('heads the skeleton with its counts, zeros omitted', () => {
    expect(skeletonHeading(composerView(standard))).toBe('Esqueleto de locais · 6 locais · 17 colunas · 94 blocos');
    expect(skeletonHeading(composerView({ blocks: [], skeleton: [] }))).toBe('Esqueleto de locais');
    expect(sectionsHeading(9)).toBe('Blocos · 9 seções');
    expect(sectionsHeading(1)).toBe('Blocos · 1 seção');
  });

  it('summarizes a cabine with its colunas and blocks, and a coluna with its own', () => {
    const view = composerView(standard);
    // Story 14.2: a local nothing hangs under says so, as the mock's masonry room does.
    expect(nodeSummaryText(view.cabines[0]!)).toEqual({
      flag: 'sem painéis · 9 blocos',
      sum: '2 seccionadoras · 1 disjuntor · 1 TP · 1 TC · 1 cabo de entrada · 1 cabo de saída · 2 para-raios',
    });
    expect(nodeSummaryText(view.cabines[1]!).flag).toBe('17 colunas · 49 blocos');
    expect(nodeSummaryText(view.cabines[1]!.colunas[3]!)).toEqual({ flag: '3 blocos', sum: '1 disjuntor · 1 TP · 1 TC' });
    const lone = composerView({ blocks: [], skeleton: addColuna(addCabine([], 'c', 'C'), 'c', 'k', 'Coluna 1') });
    expect(nodeSummaryText(lone.cabines[0]!)).toEqual({ flag: '1 coluna · 0 blocos', sum: 'Nenhum equipamento' });
  });

  it('announces a move and names new nodes', () => {
    expect(moveAnnouncement('coluna', 'Coluna 5', 3, 17)).toBe('Coluna 5 movida para a posição 3 de 17');
    expect(moveAnnouncement('coluna', 'Entrada', 1, 2)).toBe('Coluna Entrada movida para a posição 1 de 2');
    expect(moveAnnouncement('cabine', 'Cubículo Enel', 1, 6)).toBe('Local Cubículo Enel movido para a posição 1 de 6');
    expect(moveAnnouncement('cabine', 'Cabine 2', 1, 6)).toBe('Cabine 2 movida para a posição 1 de 6');
    expect(moveAnnouncement('section', '2', 1, 9)).toBe('Seção 2 movida para a posição 1 de 9');
    expect(removedText('coluna', 'Coluna 3')).toBe('Coluna 3 removida');
    expect(removedText('cabine', 'Geradores')).toBe('Local Geradores removido');
    expect(removedText('painel', 'Painel 2')).toBe('Painel 2 removido');
    expect(defaultPainelName(2)).toBe('Painel 2');
    expect(removedText('section', '8')).toBe('Seção 8 removida');
    expect(defaultCabineName(1)).toBe('Cabine 1');
    expect(defaultColunaName(3)).toBe('Coluna 3');
  });
});

describe('3.5-UNIT naDefaultsCountText', () => {
  it('reads the NA pre-marks of a subtype, singular at one and a sentence of its own at zero', () => {
    expect(naDefaultsCountText(2)).toBe('2 itens marcados NA por padrão');
    expect(naDefaultsCountText(8)).toBe('8 itens marcados NA por padrão');
    expect(naDefaultsCountText(1)).toBe('1 item marcado NA por padrão');
    expect(naDefaultsCountText(0)).toBe('Nenhum item marcado NA por padrão');
  });
});

describe('E3-A9 subBlockSummaryText', () => {
  const secc = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
  const tp = getDefinition('v1', 'cabine_primaria', 'tp');

  it('counts the nameplate fields and the checklist items', () => {
    expect(subBlockSummaryText(secc, 'nameplate')).toBe(`${secc.nameplate.length} campos`);
    expect(subBlockSummaryText(secc, 'checklist')).toBe(`${secc.checklist!.length} itens C · NC · NA`);
  });

  it('reads a test as its rows × captured columns, then the criterion with its source', () => {
    expect(subBlockSummaryText(secc, 'isolacao')).toBe('T1 · T3 · T5 · Fase A · Fase B · Fase C × Valor · >400 MΩ (aceitável na ficha)');
    expect(subBlockSummaryText(secc, 'resistencia_contato')).toBe('T1-T2 · T3-T4 · T5-T6 × Valor · <250 µΩ (aceitável na ficha)');
    expect(subBlockSummaryText(tp, 'isolacao')).toBe('Fase R · Fase S · Fase T × 1 minuto · >400 MΩ (aceitável na ficha)');
    expect(subBlockSummaryText(tp, 'relacao_transformacao')).toBe('Fase R · Fase S · Fase T × H1-H2 / X1-X2 · ±0,5 % (aceitável na ficha)');
  });

  it('is null for a sub-block with nothing to count', () => {
    expect(subBlockSummaryText(secc, 'observations')).toBeNull();
    expect(subBlockSummaryText(secc, 'conclusion')).toBeNull();
  });
});

describe('14.2-UNIT composer texts: Local › Painel › Coluna', () => {
  function composed() {
    let skeleton = addCabine([], 'loc', 'Cabine primária — 1° Subsolo', 'primaria');
    skeleton = addPainel(skeleton, 'loc', 'P1', 'Painel de média tensão');
    skeleton = addColuna(skeleton, 'P1', 'c5', 'Coluna 5');
    skeleton = addColuna(skeleton, 'P1', 'c6', 'Coluna 6');
    skeleton = addPainel(skeleton, 'loc', 'P2', 'Painel 2');
    skeleton = addCabine(skeleton, 'trafo', 'Cabine de transformação', 'Medição');
    skeleton = addCabine(skeleton, 'velho', '1° Subsolo');
    skeleton = addColuna(skeleton, 'velho', 'v1', 'Coluna 1');
    skeleton = setAgruparPorTipo(skeleton, 'loc', true);
    const base = { ...emptyTemplate('019966b0-0035-7000-8000-000000000009', 'v3'), skeleton };
    let blocks = setQuantity(base, 'c5', 'chave_seccionadora', 1);
    blocks = setQuantity({ ...base, blocks }, 'c6', 'disjuntor_mt', 2);
    blocks = setQuantity({ ...base, blocks }, 'trafo', 'transformador_forca', 2);
    return { ...base, blocks };
  }
  const view = composerView(composed());

  it('heads the skeleton and the Templates row with the three counts, the painéis part only when there is one', () => {
    expect(skeletonHeading(view)).toBe('Esqueleto de locais · 3 locais · 2 painéis · 3 colunas · 5 blocos');
    expect(templateSummaryText(composed(), 0)).toBe('Semente v3 · 0 seções · 3 locais · 2 painéis · 3 colunas · 5 blocos de equipamento');
    const one = { ...emptyTemplate('019966b0-0035-7000-8000-00000000000a', 'v3'), skeleton: addPainel(addCabine([], 'a', 'A'), 'a', 'p', 'Painel 1') };
    expect(skeletonHeading(composerView(one))).toBe('Esqueleto de locais · 1 local · 1 painel');
  });

  it('summarizes a local (painéis, colunas, blocks), a painel (colunas, blocks), an empty painel and a local with none', () => {
    expect(nodeSummaryText(view.cabines[0]!)).toEqual({ flag: '2 painéis · 2 colunas · 3 blocos', sum: '1 seccionadora · 2 disjuntores' });
    expect(nodeSummaryText(view.cabines[0]!.paineis[0]!)).toEqual({ flag: '2 colunas · 3 blocos', sum: '1 seccionadora · 2 disjuntores' });
    expect(nodeSummaryText(view.cabines[0]!.paineis[1]!)).toEqual({ flag: 'sem colunas · 0 blocos', sum: 'Nenhum equipamento' });
    expect(nodeSummaryText(view.cabines[1]!)).toEqual({ flag: 'sem painéis · 2 blocos', sum: '2 trafos' });
    // A local from before the painel level keeps its line.
    expect(nodeSummaryText(view.cabines[2]!).flag).toBe('1 coluna · 0 blocos');
    expect(nodeSummaryText(view.cabines[0]!.paineis[0]!.colunas[1]!)).toEqual({ flag: '2 blocos', sum: '2 disjuntores' });
  });

  it('writes the local sub-line: the Função in lower case when there is one, the site checklist, then Agrupar por tipo', () => {
    // A seed without the site checklist (v1-v3) has no Verificações part.
    expect(siteItems('v3')).toHaveLength(0);
    expect(localSubText(view.cabines[0]!, 'v3')).toBe('Função: primária · Agrupar por tipo: ativado');
    expect(localSubText(view.cabines[1]!, 'v1')).toBe('Função: medição · Agrupar por tipo: desativado');
    expect(localSubText(view.cabines[2]!, 'v2')).toBe('Agrupar por tipo: desativado');
    expect(localSubText({ funcao: 'transformacao', agrupar_por_tipo: false }, 'v3')).toBe('Função: transformação · Agrupar por tipo: desativado');
    // Seed v9 carries the site checklist: the count reads from the kernel, between Função and Agrupar.
    const n = siteItems('v9').length;
    expect(n).toBeGreaterThan(1);
    const verificacoes = `Verificações do local: ${n} itens, respondidos uma vez neste local`;
    expect(localSubText(view.cabines[0]!, 'v9')).toBe(`Função: primária · ${verificacoes} · Agrupar por tipo: ativado`);
    expect(localSubText(view.cabines[2]!, 'v9')).toBe(`${verificacoes} · Agrupar por tipo: desativado`);
  });

  it('names the palette target: a coluna with its painel (or its local), a local "direto no local"', () => {
    expect(paletteTargetText(view, findComposerNode(view, 'c5')!)).toBe('Coluna 5 · Painel de média tensão');
    expect(paletteTargetText(view, findComposerNode(view, 'v1')!)).toBe('Coluna 1 · 1° Subsolo');
    expect(paletteTargetText(view, findComposerNode(view, 'trafo')!)).toBe('Cabine de transformação, direto no local');
    // Coordinator review 2026-10-13: a painel's controls name it with its local (mock 42: "Mais opções de Painel de entrada em Cubículo Enel").
    expect(painelInLocalText('Painel 1', 'Cubículo Enel')).toBe('Painel 1 em Cubículo Enel');
  });

  it('second pass (rule 9): a coluna\'s controls name it with its painel and its local, a coluna directly under a local with that local', () => {
    expect(colunaInPainelText('Coluna 1', 'Painel de média tensão', 'Cabine primária')).toBe('Coluna 1 em Painel de média tensão em Cabine primária');
    expect(colunaInLocalText('Coluna 5', '1° Subsolo')).toBe('Coluna 5 em 1° Subsolo');
    // The default "Painel 1 › Coluna 1" of two locals, and the "Coluna 1" of two painéis of one local, read apart.
    const names = [
      colunaInPainelText('Coluna 1', 'Painel 1', 'Cubículo Enel'),
      colunaInPainelText('Coluna 1', 'Painel 1', 'Geradores'),
      colunaInPainelText('Coluna 1', 'Painel 2', 'Cubículo Enel'),
      colunaInLocalText('Coluna 1', 'Cubículo Enel'),
    ];
    expect(names).toEqual(['Coluna 1 em Painel 1 em Cubículo Enel', 'Coluna 1 em Painel 1 em Geradores', 'Coluna 1 em Painel 2 em Cubículo Enel', 'Coluna 1 em Cubículo Enel']);
    expect(new Set(names).size).toBe(4);
  });

  it('second pass: a location back in the relatório reads as its removal does, the participle agreeing with its kind', () => {
    expect(restoredText('coluna', 'Coluna 3')).toBe('Coluna 3 restaurada');
    expect(restoredText('painel', 'Painel 2')).toBe('Painel 2 restaurado');
    expect(restoredText('cabine', 'Geradores')).toBe('Local Geradores restaurado');
    expect(restoredText('cabine', 'Cabine de transformação')).toBe('Cabine de transformação restaurada');
  });
});
