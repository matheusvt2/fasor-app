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
  const items: TextBlock[] = printedExclusions(exclusions).map((text) => ({ kind: 'item', text }));
  // The seed's items sit after its fixed paragraphs and "Exclusões:" line, so the override
  // items take the same trailing position.
  return [...kept, ...items];
}

/** `section3Blocks`, flattened to one plain text (the section text editor's own shape, FR-13). */
export function section3Text(seedVersion: string, date: string, exclusions: readonly string[] | null): string {
  return flattenSectionText(section3Blocks(seedVersion, date, exclusions));
}

/**
 * Epic 4 retro item 24: the exclusions that print and count. A blank or whitespace-only
 * entry (the empty row "Adicionar exclusão" appends before anything is typed) is dropped
 * here, the one place, so the DOCX, the preview, section 3's text and any count agree.
 */
export function printedExclusions(exclusions: readonly string[]): string[] {
  return exclusions.filter((text) => present(text) !== undefined);
}

/** The setup list without the entry at `index` ("Remover" of an exclusion's overflow menu). */
export function withoutExclusion(exclusions: readonly string[], index: number): string[] {
  return exclusions.filter((_, i) => i !== index);
}

/**
 * Epic 4 retro item 22: a section block's config after the section text editor wrote
 * `text` -- the text itself plus the marker that the relatório's own text was edited, which
 * the Sumário meta reads ("texto editado").
 */
export function editedSectionTextConfig(config: unknown, text: string): Record<string, unknown> {
  return { ...asObject(config), section_text: text, section_text_edited: true };
}

/** A section block's config after "Restaurar texto do template": the seed text in force again, the marker cleared. */
export function restoredSectionTextConfig(config: unknown): Record<string, unknown> {
  return { ...asObject(config), section_text: null, section_text_edited: false };
}

/** True when the relatório's own text of this section block was edited (and not restored since). */
export function sectionTextEdited(config: unknown): boolean {
  return asObject(config).section_text_edited === true;
}

function asObject(config: unknown): Record<string, unknown> {
  return typeof config === 'object' && config !== null && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
}

/** The seed's own section-3 exclusion items, for the setup page's initial list and "restore". */
export function defaultExclusions(seedVersion: string, date: string): string[] {
  return sectionText(seedVersion, 3, date)
    .filter((block) => block.kind === 'item')
    .map((block) => block.text);
}
