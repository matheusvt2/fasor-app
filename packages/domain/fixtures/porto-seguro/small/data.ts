/*
 * Story 3.7 TC-8: the small Porto Seguro-shaped fixture -- one cabine, three blocks
 * (chave_seccionadora, disjuntor_mt, transformador_forca, the same triad `replay-small` uses
 * for its own three blocks), for tests that don't need the full 94-block fixture. Values here
 * are synthetic (spec: "real-data-optional"), so no client-material waiver applies to this
 * subfolder beyond staying under `packages/domain/fixtures/porto-seguro/`.
 */

export const CABINE_NAME = 'Cabine de Testes';

export const CHAVE_DATA = {
  np: {
    identificacao: 'CABINE DE TESTES',
    fabricacao: 'SCHNEIDER',
    n_serie: 'TEST-0001',
    tipo: 'MANUAL',
    meio_de_extincao: 'SF6',
    tensao_de_placa: '17.5',
    corrente_nominal: '630',
    acionamento: 'MANUAL/PUNHO',
    data_de_fabricacao: '2020',
  },
  tag: 'SEC-TEST',
  contact: ['10', '11', '12'] as const,
  rc: ['150', '160', '170'] as const,
};

export const DISJUNTOR_DATA = {
  np: {
    identificacao: 'CABINE DE TESTES',
    fabricacao: 'SCHNEIDER',
    n_serie: 'TEST-0002',
    tipo: 'SF1',
    meio_de_extincao: 'SF6',
    corrente_nominal: '630',
    capacidade_interruptor: '20',
    tensao_nominal: '17.5',
  },
  tag: 'DJ-TEST',
};

export const TRANSFORMADOR_DATA = {
  np: {
    identificacao: 'SUBSTAÇÃO DE TESTES',
    fabricacao: 'SCHNEIDER',
    n_serie: 'TEST-0003',
    tipo: 'TRH',
    tipo_de_isolacao: 'Á SECO',
    tap_atual: '13200',
    data_fabricacao: '2020',
    tensao_nominal_at: '13.8',
    tensao_nominal_bt: '380/220',
    ligacao_secundaria: 'DYN1',
    potencia_nominal: '1000',
  },
  tag: 'TR-TEST',
  isoRows: ['1000', '900', '150'] as const,
  ratio: { p: '13200', s: '380/220', cap: ['60.1', '60.2', '60.3'] as const },
};
