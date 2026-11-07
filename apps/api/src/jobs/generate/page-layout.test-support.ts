import {
  EMPTY_DEFINITION_CONTEXT,
  instantiateTemplate,
  standardTemplate,
  type BlockRow,
  type DocumentLayout,
  type LayoutSectionSheets,
  type PrintPhoto,
  type PrintRow,
  type PrintSheet,
  type PrintSheetSubsection,
  type PrintTable,
  type RelatorioSnapshot,
  type SheetPart,
} from '@app/domain';

/*
 * Test support (Stories 20.5 and 20.6): hand-built section 9 parts for the renderer tests,
 * so a test places a table or a ficha exactly where it needs it (after so many filler lines,
 * with so many rows) without a relatório behind it. `docx.test.ts` reads the XML they render
 * into; `page-placement.integration.test.ts` reads the PDF LibreOffice makes of them.
 */

export const bandRow = (text: string, span: number): PrintRow => ({ band: true, cells: [{ text, span, bold: true, shade: true, align: 'center' }] });

export const headerRow = (labels: readonly string[]): PrintRow => ({ header: true, cells: labels.map((text) => ({ text, bold: true, shade: true, align: 'center' as const })) });

export const groupRow = (text: string, span: number): PrintRow => ({ group: true, cells: [{ text, span, bold: true, align: 'left' }] });

export const bodyRow = (texts: readonly string[]): PrintRow => ({ cells: texts.map((text) => ({ text, align: 'left' as const })) });

const CHECK_COLUMNS = ['ITEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES'] as const;
const CHECK_WIDTHS = [5, 0.6, 0.6, 0.6, 3.4];

/** A checklist shaped as VERIFICAÇÕES GERAIS prints it: its band, the column header, then "k. ITEM DE TESTE k" rows (`label` in place of "ITEM DE TESTE"). */
export function checklistTable(title: string, items: number, options: { keepWhole?: boolean; observation?: (k: number) => string; groups?: number; label?: string } = {}): PrintTable {
  const rows: PrintRow[] = [bandRow(title, CHECK_COLUMNS.length), headerRow(CHECK_COLUMNS)];
  const perGroup = options.groups === undefined ? items : Math.ceil(items / options.groups);
  for (let k = 1; k <= items; k += 1) {
    if (options.groups !== undefined && (k - 1) % perGroup === 0) rows.push(groupRow(`GRUPO ${Math.floor((k - 1) / perGroup) + 1}`, CHECK_COLUMNS.length));
    rows.push(bodyRow([`${k}. ${options.label ?? 'ITEM DE TESTE'} ${k}`, k % 3 === 0 ? 'X' : '', k % 3 === 1 ? 'X' : '', k % 3 === 2 ? 'X' : '', options.observation?.(k) ?? '']));
  }
  return { columns: CHECK_WIDTHS, rows, ...(options.keepWhole === false ? {} : { keepWhole: true as const }) };
}

/** A nameplate shaped as DADOS DO EQUIPAMENTO prints it: its band, then three label/value pairs a row. */
export function nameplateTable(pairs: number): PrintTable {
  const rows: PrintRow[] = [bandRow('DADOS DO EQUIPAMENTO', 6)];
  for (let i = 0; i < pairs; i += 3) {
    const cells: string[] = [];
    for (let j = i; j < Math.min(i + 3, pairs); j += 1) cells.push(`CAMPO ${j + 1}`, `Valor ${j + 1}`);
    while (cells.length < 6) cells.push('');
    rows.push(bodyRow(cells));
  }
  return { columns: [1.6, 1.7, 1.6, 1.7, 1.6, 1.7], rows, keepWhole: true };
}

/** A table the kernel does not keep whole (a measurement table): its band, its header, n value rows. */
export function measurementTable(title: string, rows: number): PrintTable {
  return {
    columns: [1, 1, 1],
    rows: [bandRow(title, 3), headerRow(['FASE', 'VALOR', 'UNIDADE']), ...Array.from({ length: rows }, (_, i) => bodyRow([`F${i + 1}`, String(100 + i), 'MΩ']))],
  };
}

export const tablePart = (table: PrintTable): SheetPart => ({ kind: 'table', table });

/** `lines` one-line paragraph parts ("Linha de enchimento k"), to push what follows down the page. */
export const fillerParts = (lines: number, prefix = 'Linha de enchimento'): SheetPart[] => Array.from({ length: lines }, (_, i) => ({ kind: 'paragraph', text: `${prefix} ${i + 1}` }));

export const photosPart = (photos: PrintPhoto[]): SheetPart => ({ kind: 'photos', photos });

export const sheet = (title: string, parts: SheetPart[], blockId = title): PrintSheet => ({ blockId, title, parts });

/** Story 22.3: a table part as the kernel marks the tables of a ficha up to CONCLUSÃO (`keepRows` unless kept whole), kept with the next part when `withNext`. */
export const keptPart = (table: PrintTable, withNext = false): SheetPart => {
  const kept: PrintTable = table.keepWhole === true ? table : { ...table, keepRows: true };
  return withNext ? { kind: 'table', table: kept, keepWithNext: true } : { kind: 'table', table: kept };
};

/**
 * Story 20.3: `base` with the eleven section blocks a relatório created today carries
 * (`instantiateTemplate`: the tests section before the points section) in place of its own.
 */
export function withNewSectionOrder(base: RelatorioSnapshot): RelatorioSnapshot {
  let n = 0;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0200-7000-8000-000000000001' }),
    { id: base.relatorio.project_id },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: () => `019966c1-0201-7000-8000-${(++n).toString(16).padStart(12, '0')}`, actorId: '019966c1-0202-7000-8000-000000000001', companyId: '019966c1-0202-7000-8000-000000000002' },
  );
  const sections = drafts
    .filter((draft) => draft.path.startsWith('block/'))
    .map((draft) => draft.value as unknown as BlockRow)
    .filter((block) => block.location_id === null)
    .map((block) => ({ ...block, relatorio_id: base.relatorio.id }));
  return { ...base, blocks: [...base.blocks.filter((block) => block.location_id !== null), ...sections] };
}

/** The layout with its sheets section replaced by these subsections (the section keeps its number and title). */
export function withSheetsSection(layout: DocumentLayout, subsections: PrintSheetSubsection[]): DocumentLayout {
  let found = false;
  const sections = layout.sections.map((section) => {
    if (section.kind !== 'sheets') return section;
    found = true;
    const replaced: LayoutSectionSheets = { ...section, subsections, warnings: [] };
    return replaced;
  });
  if (!found) throw new Error('the layout has no sheets section to replace');
  return { ...layout, sections };
}
