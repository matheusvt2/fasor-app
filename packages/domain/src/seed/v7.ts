import type { BlockDefinition, CriterionBands, FieldDef, OilRule, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V6 } from './v6.ts';

/*
 * Seed version 7 (AR-20; Story 14.14, contract 22): seed v6 as it shipped in v0.2.3, plus, from
 * Bruno's answers of 2026-10-21 relayed by Matheus,
 *
 * - answer 4: the Disjuntor MT's MEIO DE EXTINÇÃO becomes the fixed list "Ar", "Gás SF6",
 *   "Vácuo", "Óleo", "Outro" (no value typed by hand), with the v6 spellings as aliases so a
 *   value copied or read from an older plate maps onto it; its oil rule names "Óleo" as the oil
 *   value and "Outro" as a value that shows the oil items in full;
 * - answer 1: a help text on the Quadro elétrico's "Circuito SELV/PELV" and the 50 V ceiling of
 *   the SELV notice;
 * - answer 3: each NBR 5410 band names its test voltage (250 V, 500 V, 1000 V).
 *
 * Derived from v6 rather than retyped, so the two differ only by these (`seed.test.ts` pins the
 * difference). The seccionadora keeps AR and SF6 and no oil rule (open question 2, default).
 */

const v6 = CABINE_PRIMARIA_V6;

// --- answer 4: the extinction media ----------------------------------------------------------

// authored: the list as Bruno gave it (2026-10-21 answer 4), stored and printed as spelled (open question 1, default).
/** The Disjuntor MT's MEIO DE EXTINÇÃO on v7. */
const MEIO_DE_EXTINCAO_DISJUNTOR = ['Ar', 'Gás SF6', 'Vácuo', 'Óleo', 'Outro'];

/** The v6 (and v1 to v5) spellings and the v7 option each reads as. */
const MEIO_DE_EXTINCAO_ALIASES: Record<string, string> = {
  AR: 'Ar',
  SF6: 'Gás SF6',
  VÁCUO: 'Vácuo',
  'ÓLEO (PVO)': 'Óleo',
  'ÓLEO (GVO)': 'Óleo',
};

function disjuntorV7(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.map((field): FieldDef =>
    field.key === 'meio_de_extincao' ? { ...field, options: MEIO_DE_EXTINCAO_DISJUNTOR, option_aliases: MEIO_DE_EXTINCAO_ALIASES } : field,
  );
  const oil_rule: OilRule = { ...definition.oil_rule!, oil_values: ['Óleo'], full_values: ['Outro'] };
  return { ...definition, nameplate, oil_rule };
}

// --- answers 1 and 3: the Quadro elétrico ----------------------------------------------------

// authored: Bruno 2026-10-21 answer 1, as he wrote it.
/** The help under "Circuito SELV/PELV": on the sheet only, never printed. */
const SELV_HELP = 'SELV e PELV: tensão até 120 V em corrente contínua ou 50 V em corrente alternada, conforme a NBR 5410';

/** The TENSÃO NOMINAL above which a SIM mark disagrees with the plate (NBR 5410, a.c.). */
const SELV_MAX_VOLTAGE = 50;

/** NBR 5410's test voltage of each band, in V (Bruno 2026-10-21 answer 3). */
const SELV_TEST_VOLTAGE = 250;

function quadroV7(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.map((field): FieldDef => (field.key === 'circuito_selv_pelv' ? { ...field, help: SELV_HELP } : field));
  const tests = definition.tests.map((test) => {
    const bands = test.criterion_bands;
    if (bands === undefined) return test;
    const criterion_bands: CriterionBands = {
      ...bands,
      selv_max_voltage: SELV_MAX_VOLTAGE,
      selv: { ...bands.selv!, test_voltage: SELV_TEST_VOLTAGE },
      // The band up to 500 V tests at 500 V, the band up to 1000 V at 1000 V.
      bands: bands.bands.map((band) => ({ ...band, test_voltage: band.up_to })),
    };
    return { ...test, criterion_bands };
  });
  return { ...definition, nameplate, tests };
}

function cabinePrimariaV7(): ReportSeed {
  const seed = structuredClone(v6);
  const blocks = seed.blocks;
  return {
    ...seed,
    blocks: {
      ...blocks,
      disjuntor_mt: disjuntorV7(blocks.disjuntor_mt),
      quadro_eletrico: quadroV7(blocks.quadro_eletrico!),
    },
  };
}

export const CABINE_PRIMARIA_V7: ReportSeed = cabinePrimariaV7();
