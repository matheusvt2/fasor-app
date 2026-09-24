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

/** A blank string is as good as none, the same convention `print/layout.ts` uses for every printed field. */
function present(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.trim() === '' ? undefined : value;
}

/**
 * The section variables a relatório resolves against, from its own snapshot and the
 * responsible's name (read off the local `user` row the surface already holds).
 *
 * `escopo` resolves from `setup.additional_info` (Epic 4 QA Q3, 2026-09-24). In seed v1
 * the variable appears in one place only: the cover's "Informações adicionais" row
 * (`seed/sections-v1.ts`, cover rows, `{ label: 'Informações adicionais', value: '{escopo}' }`),
 * which FO.SERV-03 fills with the cover text ("Manutenção Preventiva nas Cabines
 * Primárias", `imports/extract-fo-serv-03.md:42`); section 1's own text fixes the scope
 * phrase and carries no `{escopo}`. The field the user types under that label, in the
 * Capa band (Etapa 1, mock `50-relatorio-setup.html:134`), is `additional_info`. The
 * `setup.escopo` key stays in the schema, unread in v1, for a seed v2 in which section 1
 * gains the variable after the R-009 review.
 */
export function sectionVariables(snapshot: RelatorioSnapshot, responsibleName: string | null): Partial<Record<SectionVariable, string>> {
  const setup = snapshot.relatorio.setup;
  const obra = present(setup.local) ?? snapshot.project?.site ?? snapshot.project?.name ?? undefined;
  const datas = dateRangeText(setup.service_start, setup.service_end);
  const escopo = present(setup.additional_info);
  return {
    ...(snapshot.client === null ? {} : { cliente: snapshot.client.name }),
    ...(obra === undefined ? {} : { obra }),
    ...(datas === '' ? {} : { datas }),
    ...(snapshot.empresa === null ? {} : { empresa_executora: snapshot.empresa.name }),
    ...(responsibleName === null ? {} : { responsavel: responsibleName }),
    ...(escopo === undefined ? {} : { escopo }),
  };
}

/**
 * Section 3's own text blocks with the seed's fixed paragraphs and "Exclusões:" line
 * kept, and its own seeded items replaced by `exclusions` when it is not null (the
 * relatório's own override list, AD-21). `null` keeps the seed's items exactly as
 * `sectionText` gives them. Typed blocks, not flattened text, so a caller printing them
 * (e.g. `print/layout.ts`) keeps each item's own kind (a bullet) instead of losing it to
 * the flat text's plain-text ambiguity (`flattenSectionText`'s own limitation).
 */
export function section3Blocks(seedVersion: string, date: string, exclusions: readonly string[] | null): readonly TextBlock[] {
  const blocks = sectionText(seedVersion, 3, date);
  if (exclusions === null) return blocks;
  const kept = blocks.filter((block) => block.kind !== 'item');
  const items: TextBlock[] = exclusions.map((text) => ({ kind: 'item', text }));
  // The seed's items sit after its fixed paragraphs and "Exclusões:" line, so the override
  // items take the same trailing position.
  return [...kept, ...items];
}

/** `section3Blocks`, flattened to one plain text (the section text editor's own shape, FR-13). */
export function section3Text(seedVersion: string, date: string, exclusions: readonly string[] | null): string {
  return flattenSectionText(section3Blocks(seedVersion, date, exclusions));
}

/** The seed's own section-3 exclusion items, for the setup page's initial list and "restore". */
export function defaultExclusions(seedVersion: string, date: string): string[] {
  return sectionText(seedVersion, 3, date)
    .filter((block) => block.kind === 'item')
    .map((block) => block.text);
}
