import {
  buildSnapshot,
  entityKey,
  layoutSpec,
  newEquipmentBlock,
  newPointRow,
  photoToken,
  replay,
  type EntityState,
  type EquipmentBlockType,
  type FileRow,
  type LocationRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { describe, expect, it } from 'vitest';
import { buildDocx, TOC_PLACEHOLDER } from './docx.ts';
import { extractStructure, paragraphText, readZipEntries } from './docx-structure.test-support.ts';
import { GROUP_ROW_FILL } from './sections/section-9.ts';
import { placeholderPages } from './toc.ts';

/*
 * Story 14.4: VERIFICAÇÕES DO LOCAL in the DOCX. Each test builds a relatório on seed v4
 * through `buildSnapshot` (the Porto Seguro fixture's relatório row, sections, empresa and
 * client; its tree replaced), renders it and reads the document from its own headings: the
 * site table once per local right after AMBIENTE DE ENSAIO under both schemes with the flag
 * on and off, a local with no equipment, the painel titles, a removed local, the upper-case
 * labels, an unanswered row, the item photos after the table, and the site photo and the
 * site point in sections 7 and 8. The Porto Seguro golden (seed v1) is `docx.test.ts`'s and
 * stays untouched.
 */

const ISSUED_AT = '2026-09-23T12:00:00.000Z';
const SECTION_9 = '9 RELATÓRIOS DOS ENSAIOS';
const SITE_TITLE = 'VERIFICAÇÕES DO LOCAL';
const id = (n: number) => `019966b0-0144-7000-8000-${n.toString(16).padStart(12, '0')}`;
const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
let opCounter = 0;
const cell = (value: unknown) => ({ value: value as never, source_suggestion_id: null, op_id: id(50_000 + ++opCounter) });

const LOCAL = id(1);
const ENEL = id(5);
const PHOTO = id(3001);
const ENEL_PHOTO = id(3002);
const POINT = id(4001);
const ENEL_POINT = id(4002);
const EMERGENCIA = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
const PHOTO_CAPTION = 'Verificação de iluminação de emergência (autonomia mínima de 2 h) da Cabine primária';

type Scheme = 'ordem_de_campo' | 'por_local_e_tipo';

interface Options {
  agrupar?: boolean;
  scheme?: Scheme;
  seedVersion?: string;
  /** Keep the two transformers placed directly on the local. */
  direct?: boolean;
  /** Remove the second local, Cubículo Enel (which holds a site photo and a site point). */
  enelRemoved?: boolean;
  /** Give Cubículo Enel a site photo and a site point of its own. */
  enelContent?: boolean;
  /** Order Cubículo Enel (no equipment) before Cabine primária. */
  enelFirst?: boolean;
}

/**
 * A relatório on `seedVersion` (v4 by default): "Cabine primária" with three answered site
 * items (1 C with an observation, 9 NA with one, 11 NC with one), a photo on item 11 and a
 * point created from it, two transformers directly on it and two painéis each holding a
 * seccionadora; then "Cubículo Enel" with no equipment and nothing answered.
 */
function snapshotOf(options: Options = {}): RelatorioSnapshot {
  const { agrupar = false, scheme = 'por_local_e_tipo', seedVersion = 'v4', direct = true, enelRemoved = false, enelContent = false, enelFirst = false } = options;
  const base = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  const relatorioId = base.relatorio.id;
  const rows = new Map<string, unknown>();
  const put = <R extends { id: string }>(entity: Parameters<typeof entityKey>[0], row: R) => rows.set(entityKey(entity, row.id), row);

  put('relatorio', { ...base.relatorio, seed_version: seedVersion, export: { scheme } });
  if (base.project !== null) put('project', base.project);
  if (base.empresa !== null) put('registry', base.empresa);
  if (base.client !== null) put('registry', base.client);
  // The section blocks stay, so the document keeps its eleven sections.
  for (const block of base.blocks.filter((row) => row.location_id === null)) put('block', block);

  const cabine = (rowId: string, name: string, orderKey: string, over: Partial<Extract<LocationRow, { kind: 'cabine' }>> = {}): LocationRow => ({
    id: rowId,
    relatorio_id: relatorioId,
    parent_id: null,
    kind: 'cabine',
    name,
    order_key: orderKey,
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: agrupar,
    ...over,
  });
  const under = (rowId: string, kind: 'painel' | 'coluna', name: string, parent: string, orderKey: string): LocationRow => ({ id: rowId, relatorio_id: relatorioId, parent_id: parent, kind, name, order_key: orderKey, removed_at: null });
  const locations: LocationRow[] = [
    cabine(LOCAL, 'Cabine primária', enelFirst ? 'a2' : 'a0', {
      funcao: 'primaria',
      se: { type: 'ALVENARIA - CONVENCIONAL', primary_kv: measured('13.8', 'kV'), secondary_kv: null, installed_kva: measured('1500', 'kVA') },
      env: { altitude_m: null, temperature_c: measured('21', '°C'), humidity_pct: measured('62', '%') },
      checklist: {
        luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido: { result: cell('C'), observation: cell('Classe 2, ensaio válido até 11/2026') },
        bacia_de_contencao_de_oleo: { result: cell('NA'), observation: cell('Sem equipamento a óleo no local') },
        [EMERGENCIA]: { result: cell('NC'), observation: cell('Duas luminárias de emergência sem carga') },
      },
    }),
    under(id(2), 'painel', 'Painel de entrada', LOCAL, 'a0'),
    under(id(11), 'coluna', 'Coluna 1', id(2), 'a0'),
    under(id(3), 'painel', 'Painel de saída', LOCAL, 'a1'),
    under(id(21), 'coluna', 'Coluna 1', id(3), 'a0'),
    cabine(ENEL, 'Cubículo Enel', 'a1', enelRemoved ? { removed_at: '2026-09-22T12:00:00.000Z' } : {}),
  ];
  for (const location of locations) put('location', location);

  const sheet = (n: number, location: string, type: EquipmentBlockType, tag: string) =>
    newEquipmentBlock({ blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId, projectId: base.relatorio.project_id, locationId: location, type, tag, seedVersion, orderKey: `a${n}` });
  const sheets = [
    ...(direct ? [sheet(1, LOCAL, 'transformador_forca', 'TR-1'), sheet(2, LOCAL, 'transformador_forca', 'TR-2')] : []),
    sheet(3, id(11), 'chave_seccionadora', 'SEC-C01'),
    sheet(4, id(21), 'chave_seccionadora', 'SEC-C02'),
  ];
  for (const built of sheets) {
    put('block', built.block);
    put('equipment', built.equipment);
  }

  const photo = (rowId: string, location: string, caption: string | null, capturedAt: string, localSeq: number): FileRow => ({
    id: rowId,
    company_id: id(9000),
    relatorio_id: relatorioId,
    kind: 'photo',
    sha256: 'c'.repeat(64),
    mime: 'image/jpeg',
    size: 10,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: capturedAt,
    tz_offset: -180,
    coords: null,
    local_seq: localSeq,
    block_id: null,
    item_key: EMERGENCIA,
    caption,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
    location_id: location,
  });
  put('file', photo(PHOTO, LOCAL, PHOTO_CAPTION, '2026-09-06T13:00:00.000Z', 1));
  const point = newPointRow(
    { id: POINT, relatorioId, text: `Luminária de emergência inoperante ${photoToken(PHOTO)}`, equipmentId: null, origin: 'manual', action: 'Substituir as baterias', locationId: LOCAL },
    [],
  );
  put('point', point);
  if (enelContent) {
    put('file', photo(ENEL_PHOTO, ENEL, null, '2026-09-06T14:00:00.000Z', 2));
    put('point', newPointRow({ id: ENEL_POINT, relatorioId, text: 'Sem iluminação de emergência no cubículo', equipmentId: null, origin: 'manual', action: null, locationId: ENEL }, [point]));
  }
  return buildSnapshot(rows as EntityState, relatorioId);
}

async function render(snapshot: RelatorioSnapshot) {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
  const structure = extractStructure(docx);
  const document = readZipEntries(docx).get('word/document.xml')!.toString('utf8');
  /** The body XML between section `n`'s Heading 1 and the next Heading 1 (E7-A6: read from the heading, never by position). */
  const sectionXml = (n: number): string => {
    const headings = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].filter((m) => m[0].includes('w:val="Heading1"'));
    const at = headings.findIndex((m) => paragraphText(m[0]).startsWith(`${n} `));
    expect(at).toBeGreaterThanOrEqual(0);
    return document.slice(headings[at]!.index!, headings[at + 1]?.index ?? document.length);
  };
  const paragraphsOf = (xml: string): string[] => [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g)].map((m) => paragraphText(m[0]));
  const tablesOf = (xml: string): string[][][] =>
    [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((table) =>
      [...table[1]!.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((row) => [...row[1]!.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((c) => paragraphsOf(c[1]!).join('\n'))),
    );
  const nine = sectionXml(9);
  const paragraphXml = (text: string) => [...nine.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]).filter((xml) => paragraphText(xml) === text);
  return { structure, document, sectionXml, paragraphsOf, tablesOf, section: paragraphsOf(nine), siteTables: tablesOf(nine).filter((table) => table[0]![0] === SITE_TITLE), paragraphXml, nine };
}

const ascending = (section: readonly string[], texts: readonly string[]): boolean => {
  let from = 0;
  for (const text of texts) {
    const at = section.indexOf(text, from);
    if (at === -1) return false;
    from = at + 1;
  }
  return true;
};
const count = (section: readonly string[], text: string) => section.filter((p) => p === text).length;
const PHOTO_LINE = `Imagem 1: ${PHOTO_CAPTION}.`;
const LOCAL_BLOCK = ['CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', SITE_TITLE, 'SEGURANÇA E EPC NO LOCAL', '19. LIMPEZA E AUSÊNCIA DE INFILTRAÇÃO'];

describe('14.4 VERIFICAÇÕES DO LOCAL in the DOCX: once per local, right after AMBIENTE DE ENSAIO', () => {
  it.each([
    ['ordem_de_campo', false],
    ['ordem_de_campo', true],
    ['por_local_e_tipo', false],
  ] as const)('%s, flag %s: under the local Heading 2, SE, AMBIENTE, the table and its photo, then the first sheet; the painel bands carry none; the local with no equipment prints its own', async (scheme, agrupar) => {
    const { structure, section, siteTables, paragraphXml } = await render(snapshotOf({ scheme, agrupar }));
    expect(
      ascending(section, [
        SECTION_9,
        '9.1 Cabine primária',
        ...LOCAL_BLOCK,
        PHOTO_LINE,
        'TRANSFORMADOR DE FORÇA TR-1',
        'TRANSFORMADOR DE FORÇA TR-2',
        'PAINEL DE ENTRADA',
        'CHAVE SECCIONADORA SEC-C01',
        'PAINEL DE SAÍDA',
        'CHAVE SECCIONADORA SEC-C02',
        '9.2 Cubículo Enel',
        ...LOCAL_BLOCK,
      ]),
    ).toBe(true);
    // Exactly once per local: two locals, two tables, two pairs of cabine tables, and no sheet repeats them.
    expect(siteTables).toHaveLength(2);
    expect(count(section, SITE_TITLE)).toBe(2);
    expect(count(section, 'CARACTERÍSTICAS DA SE')).toBe(2);
    expect(count(section, 'AMBIENTE DE ENSAIO')).toBe(2);
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(['9.1 Cabine primária', '9.2 Cubículo Enel']);
    // The local with no equipment is a line of the ÍNDICE and starts its own page.
    expect(structure.paragraphs).toContain(`9.2 Cubículo Enel\t${TOC_PLACEHOLDER}`);
    expect(paragraphXml('9.2 Cubículo Enel')[0]).toContain('<w:pageBreakBefore/>');
    // The first sheet follows the local's parts on the same page.
    expect(paragraphXml('TRANSFORMADOR DE FORÇA TR-1')[0]).not.toContain('<w:pageBreakBefore/>');
    expect(paragraphXml('TRANSFORMADOR DE FORÇA TR-2')[0]).toContain('<w:pageBreakBefore/>');
  }, 60_000);

  it('por_local_e_tipo, flag on: the first type group of the local carries the table; the groups under the two painéis name their coluna and painel (Story 14.10 part 8)', async () => {
    const { structure, section, siteTables } = await render(snapshotOf({ scheme: 'por_local_e_tipo', agrupar: true }));
    const headings = [
      '9.1 Transformadores e Cabos de Alimentação da Cabine primária',
      '9.2 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de entrada — Cabine primária',
      '9.3 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de saída — Cabine primária',
      '9.4 Cubículo Enel',
    ];
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(headings);
    expect(structure.paragraphs.filter((p) => p.startsWith('9.') && p.endsWith(`\t${TOC_PLACEHOLDER}`))).toEqual(headings.map((text) => `${text}\t${TOC_PLACEHOLDER}`));
    expect(
      ascending(section, [
        headings[0]!,
        ...LOCAL_BLOCK,
        PHOTO_LINE,
        'TRANSFORMADOR DE FORÇA TR-1',
        'PAINEL DE ENTRADA',
        headings[1]!,
        'CHAVE SECCIONADORA SEC-C01',
        'PAINEL DE SAÍDA',
        headings[2]!,
        'CHAVE SECCIONADORA SEC-C02',
        headings[3]!,
        ...LOCAL_BLOCK,
      ]),
    ).toBe(true);
    expect(siteTables).toHaveLength(2);
    expect(count(section, 'CARACTERÍSTICAS DA SE')).toBe(2);
  }, 60_000);

  it('flag on with no equipment directly on the local: its own numbered heading comes first with the table, then the first painel band on the same page', async () => {
    const { structure, section, siteTables, paragraphXml } = await render(snapshotOf({ scheme: 'por_local_e_tipo', agrupar: true, direct: false }));
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual([
      '9.1 Cabine primária',
      '9.2 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de entrada — Cabine primária',
      '9.3 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel de saída — Cabine primária',
      '9.4 Cubículo Enel',
    ]);
    expect(ascending(section, ['9.1 Cabine primária', ...LOCAL_BLOCK, PHOTO_LINE, 'PAINEL DE ENTRADA', 'CHAVE SECCIONADORA SEC-C01', 'PAINEL DE SAÍDA', '9.4 Cubículo Enel', ...LOCAL_BLOCK])).toBe(true);
    expect(siteTables).toHaveLength(2);
    // The band follows the local's own parts; the next local starts a page.
    expect(paragraphXml('PAINEL DE ENTRADA')[0]).not.toContain('<w:pageBreakBefore/>');
    expect(paragraphXml('9.4 Cubículo Enel')[0]).toContain('<w:pageBreakBefore/>');
    // The first sheet of the painel carries no cabine table: the local printed them.
    expect(count(section, 'CARACTERÍSTICAS DA SE')).toBe(2);
  }, 60_000);

  it('a local with no equipment followed by another local: the next local starts a new page, though the one before it drew no sheet', async () => {
    const { structure, section, paragraphXml } = await render(snapshotOf({ scheme: 'ordem_de_campo', enelFirst: true }));
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(['9.1 Cubículo Enel', '9.2 Cabine primária']);
    expect(ascending(section, ['9.1 Cubículo Enel', ...LOCAL_BLOCK, '9.2 Cabine primária', ...LOCAL_BLOCK, PHOTO_LINE, 'TRANSFORMADOR DE FORÇA TR-1'])).toBe(true);
    expect(paragraphXml('9.1 Cubículo Enel')[0]).not.toContain('<w:pageBreakBefore/>');
    expect(paragraphXml('9.2 Cabine primária')[0]).toContain('<w:pageBreakBefore/>');
  }, 60_000);

  it('a relatório whose locals hold no equipment at all still prints section 9: each local heading with its table, and no empty-section note', async () => {
    const snapshot = snapshotOf({ scheme: 'por_local_e_tipo', agrupar: true });
    const noSheets: RelatorioSnapshot = { ...snapshot, blocks: snapshot.blocks.filter((block) => block.location_id === null), equipment: [] };
    const { structure, section, siteTables } = await render(noSheets);
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(['9.1 Cabine primária', '9.2 Cubículo Enel']);
    expect(siteTables).toHaveLength(2);
    expect(section).not.toContain('(sem conteúdo nesta revisão)');
    expect(section.some((p) => p.startsWith('PAINEL'))).toBe(false);
  }, 60_000);

  it('draws the table as the print mock: title band, ÍTEM · C · NC · NA · OBSERVAÇÕES, a shaded group row across the five columns before each group, upper-case labels numbered 1 to 19, the X and the observation; an unanswered row with no mark', async () => {
    const { siteTables, nine } = await render(snapshotOf());
    const [table, empty] = siteTables;
    expect(table).toHaveLength(27);
    expect(table![0]).toEqual([SITE_TITLE]);
    expect(table![1]).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    const groups = ['SEGURANÇA E EPC NO LOCAL', 'COMBATE A INCÊNDIO', 'ILUMINAÇÃO', 'ATERRAMENTO', 'SINALIZAÇÃO E DOCUMENTAÇÃO', 'AMBIENTE'];
    expect(table!.filter((row) => row.length === 1).map((row) => row[0])).toEqual([SITE_TITLE, ...groups]);
    const items = table!.filter((row) => row.length === 5).slice(1);
    expect(items).toHaveLength(19);
    expect(items.map((row) => row[0]!.split('.')[0])).toEqual(Array.from({ length: 19 }, (_, i) => String(i + 1)));
    expect(items.every((row) => row[0] === row[0]!.toLocaleUpperCase('pt-BR'))).toBe(true);
    expect(items[0]).toEqual(['1. LUVAS ISOLANTES COMPATÍVEIS COM A TENSÃO, COM ENSAIO DIELÉTRICO VÁLIDO', 'X', '', '', 'Classe 2, ensaio válido até 11/2026']);
    expect(items[8]).toEqual(['9. BACIA DE CONTENÇÃO DE ÓLEO', '', '', 'X', 'Sem equipamento a óleo no local']);
    expect(items[10]).toEqual(['11. ILUMINAÇÃO DE EMERGÊNCIA (AUTONOMIA MÍNIMA DE 2 H)', '', 'X', '', 'Duas luminárias de emergência sem carga']);
    // Unanswered: its label and four empty cells.
    expect(items[5]).toEqual(['6. EPI DISPONÍVEL', '', '', '', '']);
    expect(empty!.filter((row) => row.length === 5).slice(1).every((row) => row.slice(1).every((text) => text === ''))).toBe(true);
    // The group rows: one cell across the five columns, bold, on the mock's fill, kept with the row under.
    expect(GROUP_ROW_FILL).toBe('F0F0F0');
    const rows = [...nine.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((m) => m[1]!);
    const groupRows = rows.filter((row) => groups.includes(paragraphText(row)));
    expect(groupRows).toHaveLength(12);
    for (const row of groupRows) {
      expect(row).toContain('<w:gridSpan w:val="5"/>');
      expect(row).toContain(`w:fill="${GROUP_ROW_FILL}"`);
      expect(row).toMatch(/<w:b\/>/);
      expect(row).toContain('<w:keepNext/>');
      expect(row).toContain('<w:cantSplit/>');
    }
    // An item row is not shaded.
    const itemRow = rows.find((row) => paragraphText(row).startsWith('6. EPI DISPONÍVEL'))!;
    expect(itemRow).not.toContain('w:fill=');
  }, 60_000);

  it('a removed local prints nothing: no heading, no table, not its site photo (17.1: never in section 7 either); its point leaves section 8', async () => {
    const live = await render(snapshotOf({ enelContent: true }));
    expect(live.siteTables).toHaveLength(2);
    expect(live.paragraphsOf(live.sectionXml(8))).toContain('Sem iluminação de emergência no cubículo');
    // Story 17.1: section 7 holds the "Geral" photos only; both site photos print under their locals.
    expect(live.paragraphsOf(live.sectionXml(7)).some((p) => /^Imagem \d+/.test(p))).toBe(false);
    expect(ascending(live.section, ['9.2 Cubículo Enel', SITE_TITLE, 'Imagem 2.'])).toBe(true);

    const removed = await render(snapshotOf({ enelContent: true, enelRemoved: true }));
    expect(removed.structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(['9.1 Cabine primária']);
    expect(removed.siteTables).toHaveLength(1);
    expect(removed.section).not.toContain('9.2 Cubículo Enel');
    expect(removed.section).not.toContain('Imagem 2.');
    expect(removed.paragraphsOf(removed.sectionXml(8))).not.toContain('Sem iluminação de emergência no cubículo');
    // The removed local's photo keeps a number (2, after every placed photo) but prints nowhere.
    expect(removed.structure.paragraphs).not.toContain('Imagem 2.');
    expect(removed.paragraphsOf(removed.sectionXml(7)).some((p) => /^Imagem \d+/.test(p))).toBe(false);
  }, 120_000);

  it('sections 7 and 8: the site photo prints once, under its local (17.1: not in section 7), and the point created from the item as a bullet and an action-plan row naming the local', async () => {
    const { sectionXml, paragraphsOf, tablesOf, section, structure } = await render(snapshotOf());
    expect(paragraphsOf(sectionXml(7))).not.toContain(PHOTO_LINE);
    expect(count(section, PHOTO_LINE)).toBe(1);
    expect(count(structure.paragraphs, PHOTO_LINE)).toBe(1);
    const eight = sectionXml(8);
    expect(paragraphsOf(eight)).toContain('Luminária de emergência inoperante, conforme Imagem 1. Substituir as baterias');
    const [plan] = tablesOf(eight);
    expect(plan![1]![0]).toBe('1');
    expect(plan![1]).toContain('Cabine primária · Verificações do local');
    expect(plan![1]).toContain('Substituir as baterias');
  }, 60_000);

  it.each(['v1', 'v2', 'v3'])('a relatório on %s prints no site table: the cabine tables stay inside the first sheet and a local with no equipment prints nothing', async (seedVersion) => {
    const { structure, section, siteTables, sectionXml, paragraphsOf } = await render(snapshotOf({ seedVersion, scheme: 'ordem_de_campo' }));
    expect(siteTables).toEqual([]);
    expect(section).not.toContain(SITE_TITLE);
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual(['9.1 Cabine primária']);
    expect(ascending(section, ['9.1 Cabine primária', 'TRANSFORMADOR DE FORÇA TR-1', 'CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', 'TRANSFORMADOR DE FORÇA TR-2', 'PAINEL DE ENTRADA'])).toBe(true);
    expect(count(section, 'CARACTERÍSTICAS DA SE')).toBe(1);
    // No site list places the photo: it keeps a number but prints in neither section 9 nor (17.1) section 7.
    expect(section).not.toContain(PHOTO_LINE);
    expect(paragraphsOf(sectionXml(7))).not.toContain(PHOTO_LINE);
    expect(paragraphsOf(sectionXml(7)).some((p) => p.startsWith('Item 11'))).toBe(false);
  }, 60_000);
});
