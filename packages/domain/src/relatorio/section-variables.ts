import { dateRangeText } from '../format/datetime.ts';
import { flattenSectionText } from '../templates/section-text.ts';
import { sectionText, type SectionVariable } from '../seed/definitions.ts';
import type { TextBlock } from '../seed/schema.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 4.2/4.7: the one place the section 1/3 variables and the section 3 exclusion
 * override resolve, so `section-text-surface.tsx` (this batch) and batch D's renderer
 * (Story 4.8) never re-derive the `obra`/`escopo`/exclusions mapping independently.
 */

/**
 * The section variables a relatório resolves against, from its own snapshot and the
 * responsible's name (read off the local `user` row the surface already holds).
 */
export function sectionVariables(snapshot: RelatorioSnapshot, responsibleName: string | null): Partial<Record<SectionVariable, string>> {
  const setup = snapshot.relatorio.setup;
  const obra = setup.local ?? snapshot.project?.site ?? snapshot.project?.name ?? undefined;
  const datas = dateRangeText(setup.service_start, setup.service_end);
  return {
    ...(snapshot.client === null ? {} : { cliente: snapshot.client.name }),
    ...(obra === undefined ? {} : { obra }),
    ...(datas === '' ? {} : { datas }),
    ...(snapshot.empresa === null ? {} : { empresa_executora: snapshot.empresa.name }),
    ...(responsibleName === null ? {} : { responsavel: responsibleName }),
    ...(setup.escopo === null ? {} : { escopo: setup.escopo }),
  };
}

/**
 * Section 3's text with its seed's fixed paragraphs and "Exclusões:" line kept, and its
 * own seeded items replaced by `exclusions` when it is not null (the relatório's own
 * override list, AD-21). `null` keeps the seed's items exactly as `sectionText` gives them.
 */
export function section3Text(seedVersion: string, date: string, exclusions: readonly string[] | null): string {
  const blocks = sectionText(seedVersion, 3, date);
  if (exclusions === null) return flattenSectionText(blocks);
  const kept = blocks.filter((block) => block.kind !== 'item');
  const items: TextBlock[] = exclusions.map((text) => ({ kind: 'item', text }));
  // The seed's items sit after its fixed paragraphs and "Exclusões:" line, so the override
  // items take the same trailing position.
  return flattenSectionText([...kept, ...items]);
}

/** The seed's own section-3 exclusion items, for the setup page's initial list and "restore". */
export function defaultExclusions(seedVersion: string, date: string): string[] {
  return sectionText(seedVersion, 3, date)
    .filter((block) => block.kind === 'item')
    .map((block) => block.text);
}
