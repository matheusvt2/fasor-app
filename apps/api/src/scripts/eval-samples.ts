import { join, resolve } from 'node:path';
import { getDefinition, PANEL_FIELDS, SEED_VERSION, type FieldDef } from '@app/domain';
import { z } from 'zod';

/*
 * Fix batch e23z (item 6): the paid eval's samples, moved out of `bedrock-eval.ts` (as `eval-group-read.ts` was, e21a
 * R-2) so a test can import them without running the script: the expected file's shape, the synthetic set, the
 * fields a sample is scored on (`fieldsOf`, by its seed version) and the key check. A sample whose expected keys its
 * seed's fields lack is skipped with one logged line (`partitionSamples`), and the others run; it no longer aborts
 * the whole run before any call.
 */

const repoRoot = resolve(import.meta.dirname, '../../../..');

export const expectedFileSchema = z
  .object({
    kind: z.enum(['plate', 'panel']),
    block_type: z.string().min(1).optional(),
    /** Story 23.7: the seed version whose nameplate the plate is scored on (default: the current one). */
    seed_version: z.string().min(1).optional(),
    values: z.record(z.string(), z.string()),
  })
  .refine((file) => file.kind === 'panel' || file.block_type !== undefined, { message: 'a plate names its block_type' });
export type ExpectedFile = z.infer<typeof expectedFileSchema>;

export interface Sample {
  name: string;
  path: string;
  expected: ExpectedFile;
}

/** The synthetic plate's table (`plate-transformador.md`) and the synthetic panel front (fixtures README). */
export const SYNTHETIC: Sample[] = [
  {
    name: 'plate-transformador (synthetic)',
    path: join(repoRoot, 'services/ocr/tests/fixtures/plate-transformador.jpg'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      // Story 23.7: drawn for the v1 to v12 transformer (its text TAP ATUAL, which v13 replaced by TAPS).
      seed_version: 'v12',
      values: {
        identificacao: 'TR-01',
        fabricacao: 'Celtta',
        n_serie: '240815-07',
        tipo: 'TSE-500/15',
        tipo_de_isolacao: 'EPÓXI',
        vol_oleo: '0',
        potencia_nominal: '500',
        tap_atual: '3',
        data_fabricacao: '2024-08',
        tensao_nominal_at: '15',
        tensao_nominal_bt: '380',
        ligacao_secundaria: 'Dyn1',
      },
    },
  },
  {
    name: 'plate-transformador-dyn1 (synthetic, Story 21.2)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-dyn1.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      values: { identificacao: 'TR-02', fabricacao: 'Varnelo', n_serie: 'TF-330918', potencia_nominal: '300', tensao_nominal_at: '13.8', tensao_nominal_bt: '380', ligacao_secundaria: 'Dyn1' },
    },
  },
  {
    name: 'plate-transformador-yyn0 (synthetic, drawn diagram, Story 21.2)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-yyn0.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      values: { identificacao: 'TR-03', fabricacao: 'Varnelo', tensao_nominal_at: '13.8', tensao_nominal_bt: '380', ligacao_secundaria: 'Yyn0' },
    },
  },
  {
    // Story 22.7: a seed v12 oil transformer printing "TIPO TRICAST" and "Tipo óleo isolante B" and no insulation word;
    // the kernel composes TIPO DE ISOLAÇÃO (ÓLEO MINERAL, verify) from TIPO DO ÓLEO, so the model is expected to leave it out.
    name: 'plate-transformador-oleo (synthetic, seed v12, Story 22.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-oleo.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      // Fix batch e23z (item 6): drawn for the v12 transformer (TIPO DO ÓLEO, which v13 replaced by NATUREZA DO LÍQUIDO and TIPO (ANP)).
      seed_version: 'v12',
      values: { identificacao: 'TR-04', fabricacao: 'Varnelo', tipo: 'TRICAST', tipo_do_oleo: 'B', potencia_nominal: '500', tensao_nominal_at: '13.8', tensao_nominal_bt: '220' },
    },
  },
  // Batch e23t (Story 23.17, prompt `bedrock-structuring-7`): a v13 plate printing the ANP class and no insulation or liquid
  // word, whose TIPO DE ISOLAÇÃO (ÓLEO ISOLANTE) and NATUREZA DO LÍQUIDO (MINERAL) the kernel composes, to verify; and a v13
  // plate naming a silicone liquid, which prints no class.
  {
    name: 'plate-transformador-tipo-b-v13 (synthetic, seed v13, Story 23.17)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-tipo-b-v13.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      seed_version: 'v13',
      values: { identificacao: 'TR-06', fabricacao: 'Varnelo', tipo: 'TRICAST', tipo_anp: 'B', potencia_nominal: '500', tensao_nominal_at: '13.8', tensao_nominal_bt: '220' },
    },
  },
  {
    name: 'plate-transformador-silicone-v13 (synthetic, seed v13, Story 23.17)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-silicone-v13.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      seed_version: 'v13',
      values: { identificacao: 'TR-07', fabricacao: 'Varnelo', tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'SILICONE', potencia_nominal: '300', tensao_nominal_at: '13.8', tensao_nominal_bt: '380' },
    },
  },
  // Batch e23e (Story 23.18, prompt `bedrock-structuring-8`): a v13 TC printing FUNÇÃO DO TC and the special class "0,3S",
  // which the kernel lands on its option with the S kept. Not run here: the paid eval is the coordinator's before the deploy.
  {
    name: 'plate-tc-funcao-v13 (synthetic, seed v13, Story 23.18)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-tc-funcao-v13.png'),
    expected: {
      kind: 'plate',
      block_type: 'tc',
      seed_version: 'v13',
      values: { identificacao: 'TC-04', fabricacao: 'Velquor', relacao: '300-5 A', exatidao: '0,3S', funcao_tc: 'FATURAMENTO' },
    },
  },
  // Batch e24s (Story 24.13, prompt `bedrock-structuring-9`): the v14 No-break de comando's plate with part of its battery
  // bank; the batteries' maker, model and date are not printed and must stay empty. Not run here: the paid eval is the coordinator's.
  {
    name: 'plate-no-break-comando (synthetic, seed v14, Story 24.13)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-no-break-comando.png'),
    expected: {
      kind: 'plate',
      block_type: 'no_break_comando',
      seed_version: 'v14',
      values: {
        fabricante: 'Voltrix',
        modelo: 'NBC-3000',
        n_serie: 'NB-220415',
        potencia_nominal: '3000',
        potencia_ativa: '2700',
        tensao_de_entrada: '220',
        tipo_de_entrada: 'Vca',
        tensao_de_saida: '125',
        tipo_de_saida: 'Vcc',
        frequencia: '60',
        autonomia_nominal: '30',
        baterias_tipo: 'VRLA',
        baterias_quantidade: '10',
        baterias_tensao_por_unidade: '12',
        baterias_capacidade: '7',
      },
    },
  },
  // Story 23.7 (seed v13): one plate per type with the fields v13 adds (fixtures README); the list and the √3 as printed.
  {
    name: 'plate-transformador-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-transformador-v13.png'),
    expected: {
      kind: 'plate',
      block_type: 'transformador_forca',
      seed_version: 'v13',
      values: { identificacao: 'TR-05', fabricacao: 'Varnelo', taps: '13,8 / 13,2 / 12,6 / 12 / 11,4', tap_atual_kv: '12.6', impedancia_pct: '4.5', material_enrolamento: 'Cu', tensao_nominal_at: '13.8', tensao_nominal_bt: '380' },
    },
  },
  {
    name: 'plate-disjuntor-mt-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-disjuntor-mt-v13.png'),
    expected: { kind: 'plate', block_type: 'disjuntor_mt', seed_version: 'v13', values: { identificacao: 'DJ-02', tipo_montagem: 'EXTRAÍVEL', tensao_comando_v: '125 Vcc', acionamento: 'MOLA MOTORIZADA', tempo_abertura_fab_ms: '45', tempo_fechamento_fab_ms: '60' } },
  },
  {
    name: 'plate-chave-seccionadora-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-chave-seccionadora-v13.png'),
    expected: { kind: 'plate', block_type: 'chave_seccionadora', seed_version: 'v13', values: { identificacao: 'SEC-03', acionamento: 'MOTORIZADO', tipo_seccionadora: 'SOB CARGA COM FUSÍVEIS', fusivel_corrente_a: '63' } },
  },
  {
    name: 'plate-tp-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-tp-v13.png'),
    expected: { kind: 'plate', block_type: 'tp', seed_version: 'v13', values: { identificacao: 'TP-02', tensao_nominal_at: '13,8/√3 kV', tensao_nominal_bt: '115/√3 V', grupo_ligacao_tp: '2 (FASE-TERRA, SISTEMA ATERRADO)' } },
  },
  {
    name: 'plate-tc-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-tc-v13.png'),
    expected: { kind: 'plate', block_type: 'tc', seed_version: 'v13', values: { identificacao: 'TC-03', relacao: '200-5 A' } },
  },
  {
    name: 'plate-para-raio-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-para-raio-v13.png'),
    expected: { kind: 'plate', block_type: 'para_raio', seed_version: 'v13', values: { mcov_kv: '12.7', involucro: 'POLIMÉRICO' } },
  },
  {
    name: 'plate-cabos-v13 (synthetic, seed v13, Story 23.7)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/plate-cabos-v13.png'),
    expected: { kind: 'plate', block_type: 'cabos_entrada', seed_version: 'v13', values: { classe_cabo: '8,7/15 kV', isolacao_cabo: 'EPR', secao_mm2: '50', tipo_terminacao: 'TERMOCONTRÁTIL' } },
  },
  {
    name: 'panel-seccionadora (synthetic)',
    path: join(repoRoot, 'apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png'),
    expected: { kind: 'panel', values: { block_type: 'chave_seccionadora', column: 'C09' } },
  },
];

export function fieldsOf(expected: ExpectedFile): FieldDef[] {
  return expected.kind === 'panel' ? [...PANEL_FIELDS] : [...getDefinition(expected.seed_version ?? SEED_VERSION, 'cabine_primaria', expected.block_type!).nameplate];
}

/** The expected keys of a sample its fields do not have (a typo, or a field its seed version does not ship). */
export function unknownKeys(sample: Sample): string[] {
  const fields = fieldsOf(sample.expected);
  return Object.keys(sample.expected.values).filter((key) => !fields.some((field) => field.key === key));
}

/** The samples that run, and one line for each one skipped because an expected key is not among its fields. */
export function partitionSamples(samples: readonly Sample[]): { runnable: Sample[]; skipped: string[] } {
  const runnable: Sample[] = [];
  const skipped: string[] = [];
  for (const sample of samples) {
    let fields: FieldDef[];
    try {
      fields = fieldsOf(sample.expected);
    } catch (error) {
      // A block type or seed version the kernel does not ship.
      skipped.push(`skipped ${sample.name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const unknown = unknownKeys(sample);
    if (unknown.length === 0) {
      runnable.push(sample);
      continue;
    }
    const of = sample.expected.kind === 'panel' ? 'the panel fields' : `the ${sample.expected.block_type} nameplate of seed ${sample.expected.seed_version ?? SEED_VERSION}`;
    skipped.push(`skipped ${sample.name}: expected key(s) ${unknown.join(', ')} not in ${of} (${fields.map((field) => field.key).join(', ')})`);
  }
  return { runnable, skipped };
}
