import type { TestBaseFile } from '../../src/types/test-base-import.ts';

/*
 * Story 25.23: a synthetic revision B of the synthetic base (`base-ensaios-sintetica.json`, revision A),
 * written for the tests of "Atualizar base de ensaios". Invented text only: nothing of the real base
 * enters a tracked file. Against revision A it changes three texts:
 *
 * - DJ-02's objective (the disjuntor copy's insulation "Como ensaiar", which nobody edits in the
 *   tests: the update replaces it by itself);
 * - DJ-02's recommendation (the text the office edits before the update: listed, kept unless chosen);
 * - TR-SE-03's procedure (the index's own "Como ensaiar" on the TR-SE transformer copy).
 */

export const REVISION_B_NAME = 'sintética 2';
export const REVISION_B_DJ_OBJECTIVE = 'Objetivo sintético DJ-02, revisão 2: verificar o item sintético.';
export const REVISION_B_DJ_RECOMMENDATION = 'Recomendação sintética DJ-02, revisão 2: repetir o item sintético.';
export const REVISION_B_TR_SE_INDEX_PROCEDURE = 'Procedimento sintético TR-SE-03, revisão 2: passo um, passo dois e passo três.';

/** Revision B from revision A (a fresh copy; A is not changed). */
export function syntheticRevisionB(a: TestBaseFile): TestBaseFile {
  const b = structuredClone(a);
  b.versao = REVISION_B_NAME;
  const row = (id: string) => {
    const found = b.ensaios.find((one) => one.id === id);
    if (found === undefined) throw new Error(`the synthetic base has no row ${id}`);
    return found;
  };
  row('DJ-02').objetivo = REVISION_B_DJ_OBJECTIVE;
  row('DJ-02').recomendacao_reprovado = REVISION_B_DJ_RECOMMENDATION;
  row('TR-SE-03').procedimento = REVISION_B_TR_SE_INDEX_PROCEDURE;
  return b;
}
