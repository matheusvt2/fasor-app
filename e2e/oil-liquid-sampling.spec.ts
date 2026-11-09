import { deviceSnapshot, issueAndReadTables, kernelOf, kernelTablesTitled, openStep, outboxValues, plateField, setUpRelatorio, tablesTitled, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';

/*
 * Story 23.17 (seed v13, decision H; Base rev08 TR-OL-07, DJ-07; M-4): the insulating liquid and the
 * oil sampling, as a person records them at 1280 px. On the transformer's plate TIPO DE ISOLAÇÃO
 * offers ÓLEO ISOLANTE; NATUREZA DO LÍQUIDO SILICONE hides TIPO (ANP), MINERAL shows it and asks for
 * it. The sampling applies to the oil unit: "Não coletado" asks for its reason (a chip) and never
 * raises the conclusion. EPÓXI excuses both liquid fields and makes the sampling not applicable. The
 * disjuntor with Óleo as its extinction medium applies its sampling; Vácuo makes it NA. The issued DOCX
 * prints no sampling table and "-" for both liquid fields of the dry unit. Every expected word is the
 * kernel's over the device's own rows. It issues a revision through the api's one queue and
 * LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test('@p0 23.17-E2E-001 the liquid fields follow NATUREZA DO LÍQUIDO, the sampling asks a reason for "Não coletado" without raising the conclusion, a dry unit excuses both and drops the sampling, the disjuntor\'s follows its oil; the DOCX prints neither', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const dj = sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const select = (key: string) => plateField(page, key).locator('select');
  const platePath = (blockId: string, key: string) => `sheet/${blockId}/nameplate/${key}`;
  const choose = async (blockId: string, key: string, value: string) => {
    await select(key).selectOption(value);
    await expect.poll(async () => (await outboxValues(database, page, platePath(blockId, key))).at(-1)).toBe(value);
  };

  // The plate: ÓLEO ISOLANTE (M-4), then the liquid.
  await openStep(page, relatorioId, tf.blockId, 'Placa');
  await expect(select('tipo_de_isolacao').locator('option')).toContainText(['EPÓXI', 'Á SECO', 'ÓLEO ISOLANTE']);
  await choose(tf.blockId, 'tipo_de_isolacao', 'ÓLEO ISOLANTE');
  await expect(plateField(page, 'tipo_anp')).toBeVisible();
  await choose(tf.blockId, 'natureza_liquido', 'SILICONE');
  await expect(plateField(page, 'tipo_anp')).toHaveCount(0);
  await choose(tf.blockId, 'natureza_liquido', 'MINERAL');
  await expect(plateField(page, 'tipo_anp')).toBeVisible();
  await expect(plateField(page, 'tipo_anp').locator('select option')).toContainText(['A', 'B', 'NÃO INFORMADO']);
  await choose(tf.blockId, 'natureza_liquido', 'SILICONE');

  // The sampling applies (silicone included): "Não coletado" asks for its reason.
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  const sampling = testSection(page, 'coleta_oleo');
  await expect(sampling.locator('h2')).toHaveText('Coleta de óleo');
  await expect(sampling.locator('.v13-na-band')).toHaveCount(0);
  const before = (await kernelOf(page, database, relatorioId, tf.blockId)).floorReason;
  await sampling.locator('.v13-choice').getByRole('radio', { name: 'Não coletado' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tf.blockId}/test/coleta_oleo/cell/0/0`)).at(-1)).toEqual({ raw: 'nao_coletado', unit: null, state: 'measured' });
  const asking = await kernelOf(page, database, relatorioId, tf.blockId);
  expect(asking.measurement('coleta_oleo').values.find((value) => value.key === 'motivo')).toMatchObject({ shown: true, missing: true });
  const reason = sampling.locator('.v13-reason');
  await expect(reason).toHaveAttribute('data-missing-field', '');
  await reason.getByRole('button', { name: 'Sem ponto de coleta' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tf.blockId}/test/coleta_oleo/value/motivo`)).at(-1)).toEqual({ raw: 'sem_ponto_de_coleta', unit: null, state: 'measured' });
  await expect(reason.getByRole('button', { name: 'Sem ponto de coleta' })).toHaveAttribute('aria-pressed', 'true');
  // A record, never a judgement: the floor's reason line is the one it was.
  expect((await kernelOf(page, database, relatorioId, tf.blockId)).floorReason).toBe(before);
  // "Coletado" asks for none.
  await sampling.locator('.v13-choice').getByRole('radio', { name: 'Coletado', exact: true }).click();
  await expect(reason).toHaveCount(0);

  // A dry unit: both liquid fields excused, the sampling not applicable with its reason.
  await openStep(page, relatorioId, tf.blockId, 'Placa');
  await choose(tf.blockId, 'tipo_de_isolacao', 'EPÓXI');
  const dry = await kernelOf(page, database, relatorioId, tf.blockId);
  const na = dry.measurement('coleta_oleo').applicability;
  expect(na.state).toBe('na');
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  await expect(sampling.locator('.v13-na-band')).toContainText(na.phrase!);

  // The disjuntor: Óleo applies its sampling, Vácuo makes it NA.
  await openStep(page, relatorioId, dj.blockId, 'Placa');
  await choose(dj.blockId, 'meio_de_extincao', 'Óleo');
  await openStep(page, relatorioId, dj.blockId, 'Ensaios');
  await expect(testSection(page, 'coleta_oleo').locator('.v13-choice')).toBeVisible();
  await openStep(page, relatorioId, dj.blockId, 'Placa');
  await choose(dj.blockId, 'meio_de_extincao', 'Vácuo');
  await openStep(page, relatorioId, dj.blockId, 'Ensaios');
  await expect(testSection(page, 'coleta_oleo').locator('.v13-na-band')).toBeVisible();

  // The DOCX: neither sheet's sampling (both NA; the template's other units print theirs as the kernel lays them out),
  // the dry transformer's liquid fields "-".
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  for (const blockId of [tf.blockId, dj.blockId]) expect(kernelTablesTitled(snapshot, 'COLETA DE ÓLEO', blockId)).toBe(0);
  const others = kernelTablesTitled(snapshot, 'COLETA DE ÓLEO');
  const tables = await issueAndReadTables(page, database, relatorioId);
  expect(tablesTitled(tables, 'COLETA DE ÓLEO')).toHaveLength(others);
  // The template's transformers each print a plate; this one is the dry one (TIPO DE ISOLAÇÃO EPÓXI, its liquid fields "-").
  const nameplate = tables.find((table) => table.some((row) => row.includes('NATUREZA DO LÍQUIDO')) && table.some((row) => row[row.indexOf('TIPO DE ISOLAÇÃO') + 1] === 'EPÓXI'))!;
  expect(nameplate).toBeDefined();
  const valueOf = (label: string) => {
    for (const row of nameplate) {
      const at = row.indexOf(label);
      if (at !== -1) return row[at + 1];
    }
    return undefined;
  };
  expect(valueOf('NATUREZA DO LÍQUIDO')).toBe('-');
  expect(valueOf('TIPO (ANP)')).toBe('-');
  expect(valueOf('TIPO DE ISOLAÇÃO')).toBe('EPÓXI');
});
