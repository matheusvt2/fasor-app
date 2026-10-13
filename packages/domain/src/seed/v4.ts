import type { ChecklistItem, ReportSeed, SiteChecklist, SiteItemDef } from './schema.ts';
import { CABINE_PRIMARIA_V3 } from './v3.ts';

/*
 * Seed version 4 (AR-20; Story 14.3): seed v3 as it shipped, plus
 * - `site_checklist`, the 19 items of a local's "Verificações do local" in six groups
 *   (`sprint-change-proposal-2026-10-08.md` § 4.1, labels approved by Bruno on 2026-10-08);
 * - one Disjuntor MT checklist item, NO-BREAK DE COMANDO, appended as the sixteenth (NA when
 *   the breaker has no no-break).
 * Derived from v3 rather than retyped, so the two differ only by what is listed here
 * (`seed.test.ts` pins the difference). FROZEN once merged, like v1 to v3.
 */

const site = (key: SiteItemDef['key'], label: string, nc_phrases: string[]): SiteItemDef => ({ key, label, nc_phrases });

// authored: every NC phrase in this file, pending Bruno's review (the equipment chips'
// precedent, `docs/nc-chip-phrases.md`). The three of "Iluminação de emergência" are the
// chips `61-verificacoes-local.html` draws on item 11 and the three of NO-BREAK DE COMANDO
// the chips `60-ficha.html` draws on item 16; the rest follow their wording.
const SITE_CHECKLIST_V4: SiteChecklist = {
  groups: [
    {
      key: 'seguranca_e_epc_no_local',
      label: 'Segurança e EPC no local',
      items: [
        site('luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido', 'Luvas isolantes compatíveis com a tensão, com ensaio dielétrico válido', [
          'Luvas isolantes ausentes',
          'Ensaio dielétrico das luvas vencido',
          'Classe das luvas incompatível com a tensão',
          'Luvas com furos ou ressecadas',
        ]),
        site('tapete_ou_estrado_isolante', 'Tapete ou estrado isolante', [
          'Tapete isolante ausente',
          'Tapete isolante danificado ou ressecado',
          'Tapete sem identificação da classe de tensão',
        ]),
        site('vara_de_manobra_com_ensaio_dieletrico_valido', 'Vara de manobra com ensaio dielétrico válido', [
          'Vara de manobra ausente',
          'Ensaio dielétrico da vara vencido',
          'Vara de manobra danificada',
        ]),
        site('detector_de_tensao', 'Detector de tensão', [
          'Detector de tensão ausente',
          'Detector de tensão inoperante',
          'Detector incompatível com a classe de tensão',
        ]),
        site('conjunto_de_aterramento_temporario', 'Conjunto de aterramento temporário', [
          'Conjunto de aterramento temporário ausente',
          'Conjunto de aterramento incompleto',
          'Cabos ou grampos danificados',
        ]),
        site('epi_disponivel', 'EPI disponível', ['EPI ausente no local', 'EPI incompleto', 'EPI vencido ou danificado']),
        site('dispositivos_de_bloqueio_e_cartoes_de_impedimento', 'Dispositivos de bloqueio e cartões de impedimento', [
          'Dispositivos de bloqueio ausentes',
          'Cartões de impedimento ausentes',
          'Quantidade insuficiente de cadeados e cartões',
        ]),
      ],
    },
    {
      key: 'combate_a_incendio',
      label: 'Combate a incêndio',
      items: [
        site(
          'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido',
          'Extintor de incêndio carregado, lacrado, dentro da validade, sinalizado e desobstruído',
          ['Extintor ausente', 'Extintor descarregado ou sem lacre', 'Extintor com validade vencida', 'Extintor obstruído ou sem sinalização'],
        ),
        site('bacia_de_contencao_de_oleo', 'Bacia de contenção de óleo', [
          'Bacia de contenção ausente',
          'Bacia de contenção com trincas ou vazamento',
          'Bacia com acúmulo de água ou óleo',
        ]),
      ],
    },
    {
      key: 'iluminacao',
      label: 'Iluminação',
      items: [
        site('iluminacao_normal', 'Iluminação normal', ['Iluminação insuficiente', 'Lâmpadas queimadas', 'Luminárias danificadas']),
        site('iluminacao_de_emergencia_autonomia_minima_de_2_h', 'Iluminação de emergência (autonomia mínima de 2 h)', [
          'Luminária de emergência inoperante',
          'Autonomia abaixo de 2 h',
          'Sem iluminação de emergência',
        ]),
      ],
    },
    {
      key: 'aterramento',
      label: 'Aterramento',
      items: [
        site('portas_telas_e_grades_aterradas', 'Portas, telas e grades aterradas', [
          'Porta sem aterramento',
          'Tela ou grade sem aterramento',
          'Cordoalha de aterramento rompida ou solta',
        ]),
        site('pontos_para_aterramento_temporario', 'Pontos para aterramento temporário', [
          'Sem pontos para aterramento temporário',
          'Pontos de aterramento inacessíveis',
          'Pontos de aterramento oxidados',
        ]),
      ],
    },
    {
      key: 'sinalizacao_e_documentacao',
      label: 'Sinalização e documentação',
      items: [
        site('placas_de_advertencia_na_porta_e_nas_grades', 'Placas de advertência na porta e nas grades', [
          'Sem placa de advertência na porta',
          'Sem placas de advertência nas grades',
          'Placas ilegíveis ou danificadas',
        ]),
        site('diagrama_unifilar_atualizado_no_local', 'Diagrama unifilar atualizado no local', [
          'Diagrama unifilar ausente',
          'Diagrama unifilar desatualizado',
          'Diagrama unifilar ilegível',
        ]),
        site('circuitos_e_equipamentos_identificados', 'Circuitos e equipamentos identificados', [
          'Circuitos sem identificação',
          'Equipamentos sem identificação',
          'Identificação ilegível ou divergente do diagrama',
        ]),
      ],
    },
    {
      key: 'ambiente',
      label: 'Ambiente',
      items: [
        site('porta_abrindo_para_fora_com_fechadura', 'Porta abrindo para fora, com fechadura', [
          'Porta abrindo para dentro',
          'Porta sem fechadura',
          'Fechadura inoperante',
          'Porta obstruída',
        ]),
        site('ventilacao', 'Ventilação', ['Ventilação insuficiente', 'Aberturas de ventilação obstruídas', 'Exaustor inoperante']),
        site('limpeza_e_ausencia_de_infiltracao', 'Limpeza e ausência de infiltração', [
          'Acúmulo de poeira e sujeira',
          'Sinais de infiltração',
          'Materiais estranhos armazenados no local',
        ]),
      ],
    },
  ],
};

/** The sixteenth Disjuntor MT item (`60-ficha.html`, item 16 and its chips); its phrases fall under the authored note above. */
const NO_BREAK_DE_COMANDO: ChecklistItem = {
  key: 'no_break_de_comando',
  label: 'NO-BREAK DE COMANDO',
  nc_phrases: ['No-break inoperante', 'Bateria vencida ou estufada', 'Sem autonomia para o relé'],
};

function cabinePrimariaV4(): ReportSeed {
  const seed = structuredClone(CABINE_PRIMARIA_V3);
  const disjuntor = seed.blocks.disjuntor_mt;
  return {
    ...seed,
    blocks: { ...seed.blocks, disjuntor_mt: { ...disjuntor, checklist: [...(disjuntor.checklist ?? []), NO_BREAK_DE_COMANDO] } },
    site_checklist: SITE_CHECKLIST_V4,
  };
}

export const CABINE_PRIMARIA_V4: ReportSeed = cabinePrimariaV4();
