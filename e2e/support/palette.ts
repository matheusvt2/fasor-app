import { blockTypeLabel, equipmentTypesOf, paletteTypeGroups } from '@app/domain';
import { expect, type Locator, type Page } from '@playwright/test';
import { readStore } from './outbox.ts';

/**
 * Epic 14 QA Q-1: what a palette or the panel "Outro…" chips list comes from the kernel for
 * the relatório's own seed version (the eight FO.SERV-03 types, then the library types the
 * version ships under their heading), so a later seed with a tenth library type changes no
 * literal in a spec. A spec that needs only one of the eight names it.
 */

/** The relatório's `seed_version` as the device holds it. */
export async function relatorioSeedVersion(page: Page, database: string, relatorioId: string): Promise<string> {
  let seed: string | undefined;
  await expect
    .poll(async () => {
      const records = await readStore<{ entity: string; id: string; row: { seed_version?: string } }>(page, database, 'entities');
      seed = records.find((record) => record.entity === 'relatorio' && record.id === relatorioId)?.row.seed_version;
      return seed;
    })
    .toEqual(expect.any(String));
  return seed!;
}

/**
 * The palette's headings and type rows in drawing order: the "Ou escolha o tipo" heading,
 * one `type` per seeded type, then each later group's heading and its `type` rows.
 */
export function paletteRowOrder(seedVersion: string, chooseHeading: string): string[] {
  return paletteTypeGroups(seedVersion).flatMap((group) => [group.label ?? chooseHeading, ...group.types.map(() => 'type')]);
}

/** The seeded (FO.SERV-03) and the library type keys of a seed version. */
export function paletteTypes(seedVersion: string): { seeded: string[]; library: string[] } {
  const groups = paletteTypeGroups(seedVersion);
  return {
    seeded: groups.filter((group) => group.key === 'seeded').flatMap((group) => group.types),
    library: groups.filter((group) => group.key === 'library').flatMap((group) => group.types),
  };
}

/** Every type label the version ships, in palette order (the panel dialog's expanded chips). */
export function typeLabels(seedVersion: string): string[] {
  return equipmentTypesOf(seedVersion).map((type) => blockTypeLabel(seedVersion, type));
}

/** The field-palette rows of the given types, in document order (`.palette-type[data-block-type]`). */
export function typeRows(palette: Locator, types: readonly string[]): Locator {
  return palette.locator(types.map((type) => `.palette-type[data-block-type="${type}"] .pf-field`).join(', '));
}
