import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { orderKeyBetween } from '../ops/order-key.ts';
import { replay } from '../ops/replay.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { sectionVariables } from '../relatorio/section-variables.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { SECTION_TITLES_V1 } from '../seed/sections-v1.ts';
import { standardTemplate } from '../seed/template.ts';
import { EMPTY_SECTION_NOTE, layoutSpec, sectionHeading } from './layout.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';

/*
 * Story 4.8: the layout spec over the Porto Seguro fixtures. The kernel data is asserted
 * here; the api's structure golden (`docx.test.ts`) asserts the rendering of the same spec.
 */

const ISSUED_AT = '2026-09-23T12:00:00.000Z';

function fullSnapshot(): RelatorioSnapshot {
  return buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
}

function smallSnapshot(): RelatorioSnapshot {
  return buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
}

describe('4.8-UNIT-001 layoutSpec on the full fixture', () => {
  const layout = layoutSpec(fullSnapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });

  it('is A4 with the source margins', () => {
    expect(layout.page).toEqual({ size: 'A4', marginsCm: 1.27 });
  });

  it('writes the header and footer lines from the Empresa row', () => {
    expect(layout.header).toEqual({ logoFileId: null, titleLine: 'Relatório Técnico de Cabine Primária', formLine: 'FO.SERV-03 · Revisão 00' });
    expect(layout.footer).toEqual({ companyLine: 'Fasor Engenharia', contactLine: '' });
  });

  it('fills the DADOS DO CLIENTE cover table with the fixture values, the responsible in brackets (no user row)', () => {
    expect(layout.cover.title).toBe('Relatório Técnico de Cabine Primária');
    expect(layout.cover.coverPhotoFileId).toBeNull();
    expect(layout.cover.table.title).toBe('DADOS DO CLIENTE');
    expect(layout.cover.table.rows).toEqual([
      { label: 'Cliente', value: 'Porto Seguro Companhia de Seguros Gerais' },
      { label: 'Cidade/local', value: 'São Paulo/SP' },
      { label: 'Data da execução do serviço', value: '06–08/09/2026' },
      { label: 'Informações adicionais', value: 'Manutenção Preventiva nas Cabines Primárias' },
      { label: 'Responsável', value: '[Responsável]' },
    ]);
  });

  it('lists the document control rows in the AC order with "—" for the CNPJs, the responsible and the ART', () => {
    expect(layout.documentControl).toEqual([
      { label: 'Documento', value: 'Relatório Técnico de Cabine Primária · FO.SERV-03 · Revisão 00' },
      { label: 'Revisão do documento', value: 'Rev. 1' },
      { label: 'Data de emissão', value: '23/09/2026' },
      { label: 'Contratante', value: 'Porto Seguro Companhia de Seguros Gerais · CNPJ —' },
      { label: 'Contratada', value: 'Fasor Engenharia · CNPJ —' },
      { label: 'Responsável técnico', value: '—' },
      { label: 'ART/TRT', value: '—' },
      { label: 'Período do serviço', value: '06–08/09/2026' },
    ]);
  });

  it('has the eleven TOC entries in FO.SERV-03 order with the seed titles', () => {
    expect(layout.toc.map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const entry of layout.toc) expect(entry.title).toBe(SECTION_TITLES_V1[String(entry.number)]);
    expect(sectionHeading(layout.toc[0]!)).toBe('1 OBJETIVO');
  });

  it('prints sections 1 to 6 with resolved text, 10 as its own layout, 9 with the equipment sheets (Story 7.1), and 7, 8, 11 from their own modules', () => {
    const byNumber = new Map(layout.sections.map((s) => [s.number, s]));
    for (const n of [1, 2, 3, 4, 5, 6]) expect(byNumber.get(n)?.kind, `section ${n}`).toBe('text');
    expect(byNumber.get(10)?.kind).toBe('section_10');
    expect(byNumber.get(9)?.kind).toBe('sheets');
    expect(EMPTY_SECTION_NOTE).toBe('(sem conteúdo nesta revisão)');
    // Stories 7.2/7.3 (section-7/8/11.test.ts assert their contents): 82 photos, 7 points, 3 certificates
    // (fix batch e24h: ~~and, Story 22.5, 18 out tests~~; no automatic point prints).
    const photos = byNumber.get(7)!;
    const points = byNumber.get(8)!;
    const certificates = byNumber.get(11)!;
    expect(photos.kind === 'photos' ? photos.photos.length : null).toBe(82);
    expect(points.kind === 'points' ? points.bullets.length : null).toBe(7);
    expect(certificates.kind === 'certificates' ? certificates.certificates.length : null).toBe(3);
  });

  it('resolves the section 1 variables and keeps section 3\'s "Exclusões:" list as items', () => {
    const first = layout.sections[0]!;
    expect(first.kind).toBe('text');
    if (first.kind !== 'text') return;
    expect(first.paragraphs[0]!.kind).toBe('paragraph');
    expect(first.paragraphs[0]!.text).toContain('realizadas pela Fasor Engenharia');
    expect(first.paragraphs[0]!.text).toContain('de São Paulo/SP da Porto Seguro Companhia de Seguros Gerais');
    expect(first.paragraphs[0]!.text).not.toMatch(/\{[a-z_]+\}/);

    const third = layout.sections[2]!;
    if (third.kind !== 'text') throw new Error('section 3 is text');
    expect(third.paragraphs.map((p) => p.kind)).toEqual(['paragraph', 'paragraph', 'item', 'item', 'item']);
    expect(third.paragraphs[1]!.text).toBe('Exclusões:');
    expect(third.paragraphs[2]!.text).toBe('Quadros elétricos terminais, localizados nos respectivos setores;');
  });

  it('keeps the seed headings inside section 4 as headings, not flattened', () => {
    const fourth = layout.sections[3]!;
    if (fourth.kind !== 'text') throw new Error('section 4 is text');
    expect(fourth.paragraphs[0]).toEqual({ kind: 'heading', text: 'Documentação', runs: [{ text: 'Documentação' }] });
    expect(fourth.paragraphs.filter((p) => p.kind === 'heading').map((p) => p.text)).toEqual([
      'Documentação',
      'EPC’s',
      'EPI’s',
      'Equipamentos de Ensaio',
      'Ferramentas e Materiais',
    ]);
  });

  it('confines the generation date to the document control ("Data de emissão") and the revision line', () => {
    const later = layoutSpec(fullSnapshot(), { revisionNumber: 2, issuedAt: '2026-10-01T09:00:00.000Z' });
    const strip = (l: typeof layout) => ({ ...l, documentControl: l.documentControl.filter((r) => !['Data de emissão', 'Revisão do documento'].includes(r.label)) });
    expect(strip(later)).toEqual(strip(layout));
    expect(later.documentControl.find((r) => r.label === 'Data de emissão')?.value).toBe('01/10/2026');
    expect(later.documentControl.find((r) => r.label === 'Revisão do documento')?.value).toBe('Rev. 2');
  });
});

describe('4.8-UNIT-002 layoutSpec edge cases', () => {
  it('never throws on a snapshot without Empresa, client, project or responsible: empty lines and "—"', () => {
    const bare: RelatorioSnapshot = { ...smallSnapshot(), empresa: null, client: null, project: null, responsible: null };
    const layout = layoutSpec(bare, { revisionNumber: 1, issuedAt: ISSUED_AT });
    expect(layout.header).toEqual({ logoFileId: null, titleLine: '', formLine: '' });
    expect(layout.footer).toEqual({ companyLine: '', contactLine: '' });
    expect(layout.cover.title).toBe('');
    expect(layout.cover.table.rows[0]).toEqual({ label: 'Cliente', value: '[Cliente]' });
    expect(layout.documentControl.map((r) => r.value)).toEqual(['—', 'Rev. 1', '23/09/2026', '—', '—', '—', '—', '06/09/2026']);
    const first = layout.sections[0]!;
    if (first.kind !== 'text') throw new Error('section 1 is text');
    expect(first.paragraphs[0]!.text).toContain('pela [Empresa executora]');
  });

  it('reads the responsible, the site fallback and the escopo through the one kernel mapping (sectionVariables)', () => {
    const small = smallSnapshot();
    expect(sectionVariables(small, small.responsible?.name ?? null)).toEqual({ cliente: 'Cliente de Testes Ltda', obra: 'Local de Testes', datas: '06/09/2026', itens_resultados: 'nos itens 8 e 9' });
    // A blank `local` is as good as none: the project's site stands in.
    const blankLocal: RelatorioSnapshot = { ...small, relatorio: { ...small.relatorio, setup: { ...small.relatorio.setup, local: '   ' } } };
    expect(sectionVariables(blankLocal, null).obra).toBe('Local de Testes');
    expect(layoutSpec(blankLocal, { revisionNumber: 1, issuedAt: ISSUED_AT }).cover.table.rows[1]).toEqual({ label: 'Cidade/local', value: 'Local de Testes' });
    const withUser: RelatorioSnapshot = {
      ...small,
      relatorio: { ...small.relatorio, setup: { ...small.relatorio.setup, additional_info: 'Manutenção', escopo: 'Nunca impresso', local: 'Torre X' } },
      responsible: {
        id: portoSeguroSmall.userId,
        name: 'Ana Alves',
        email: 'a@teste.local',
        council: 'crea',
        registration_number: '5063583141',
        title: 'Eng. Eletricista',
        photo_location_enabled: true,
      },
      empresa: { ...fullSnapshot().empresa!, name: 'Empresa X' },
    };
    expect(sectionVariables(withUser, withUser.responsible?.name ?? null)).toEqual({
      cliente: 'Cliente de Testes Ltda',
      obra: 'Torre X',
      datas: '06/09/2026',
      escopo: 'Manutenção',
      responsavel: 'Ana Alves',
      empresa_executora: 'Empresa X',
      itens_resultados: 'nos itens 8 e 9',
    });
  });

  it('Q3: prints setup.additional_info in the cover\'s "Informações adicionais" row (never setup.escopo) and setup.exclusions as section 3\'s items', () => {
    const small = smallSnapshot();
    const withInfoAndExclusions: RelatorioSnapshot = {
      ...small,
      relatorio: {
        ...small.relatorio,
        setup: { ...small.relatorio.setup, additional_info: 'Parada programada', escopo: 'x', exclusions: ['Exclusão A', 'Exclusão B'] },
      },
    };
    const layout = layoutSpec(withInfoAndExclusions, { revisionNumber: 1, issuedAt: ISSUED_AT });
    expect(layout.cover.table.rows.find((r) => r.label === 'Informações adicionais')).toEqual({ label: 'Informações adicionais', value: 'Parada programada' });
    expect(JSON.stringify(layout)).not.toContain('"x"');
    const third = layout.sections[2]!;
    if (third.kind !== 'text') throw new Error('section 3 is text');
    expect(third.paragraphs.map((p) => p.kind)).toEqual(['paragraph', 'paragraph', 'item', 'item']);
    expect(third.paragraphs.slice(2).map((p) => p.text)).toEqual(['Exclusão A', 'Exclusão B']);

    // setup.escopo alone never reaches the cover.
    const escopoOnly: RelatorioSnapshot = { ...small, relatorio: { ...small.relatorio, setup: { ...small.relatorio.setup, additional_info: null, escopo: 'Somente escopo' } } };
    const rows = layoutSpec(escopoOnly, { revisionNumber: 1, issuedAt: ISSUED_AT }).cover.table.rows;
    // F-04 (review 2026-10-06, D1): a blank additional_info leaves its optional row out, never
    // "[Informações adicionais]"; the other rows keep their order.
    expect(rows.find((r) => r.label === 'Informações adicionais')).toBeUndefined();
    expect(rows.map((r) => r.label)).toEqual(['Cliente', 'Cidade/local', 'Data da execução do serviço', 'Responsável']);
    expect(rows.some((r) => r.value.includes('[Informações adicionais]'))).toBe(false);
    // A blank required field still prints its placeholder (it counts in the issue confirmation).
    const bare = layoutSpec({ ...small, empresa: null }, { revisionNumber: 1, issuedAt: ISSUED_AT }).sections[0]!;
    if (bare.kind !== 'text') throw new Error('section 1 is text');
    expect(bare.paragraphs[0]!.text).toContain('[Empresa executora]');
  });

  it('chooses the seed text in force on sectionTextAt when given', () => {
    const small = smallSnapshot();
    const a = layoutSpec(small, { revisionNumber: 1, issuedAt: ISSUED_AT });
    const b = layoutSpec(small, { revisionNumber: 1, issuedAt: ISSUED_AT, sectionTextAt: '2028-01-01T12:00:00.000Z' });
    // The 2027 NR-10 slot is empty, so the v1 text stays in force after it.
    expect(b.sections).toEqual(a.sections);
  });
});

describe('4.8-UNIT-007 layoutSpec follows the relatório\'s section blocks (Sumário order)', () => {
  /** The small fixture with the eleven section blocks a relatório born from the standard template carries. */
  function withSectionBlocks(): { snapshot: RelatorioSnapshot; blocks: BlockRow[] } {
    const small = smallSnapshot();
    let n = 0;
    const newId = () => `019966c1-00f0-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
    const { drafts } = instantiateTemplate(
      standardTemplate({ id: '019966c1-00f1-7000-8000-000000000001' }),
      { id: small.project!.id },
      { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
      { newId, actorId: portoSeguroSmall.userId, companyId: portoSeguroSmall.companyId },
    );
    const blocks = drafts
      .filter((d) => d.path.startsWith('block/'))
      .map((d) => d.value as unknown as BlockRow)
      .filter((b) => b.location_id === null)
      .map((b) => ({ ...b, relatorio_id: small.relatorio.id }));
    return { snapshot: { ...small, blocks: [...small.blocks, ...blocks] }, blocks };
  }
  const byType = (blocks: BlockRow[], type: string) => blocks.find((b) => b.block_type === type)!;

  it('prints the eleven sections in creation order when the blocks are untouched: FO.SERV-03 order with the tests before the points (Story 20.3)', () => {
    const { snapshot } = withSectionBlocks();
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    const fallback = layoutSpec(smallSnapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT }).toc;
    expect(layout.toc.map((entry) => entry.number)).toEqual(fallback.map((entry) => entry.number));
    expect(layout.toc.map((entry) => entry.title)).toEqual(fallback.map((entry, i) => fallback[i === 7 ? 8 : i === 8 ? 7 : i]!.title));
    expect(layout.toc.slice(7, 9)).toEqual([
      { number: 8, title: 'RELATÓRIOS DOS ENSAIOS' },
      { number: 9, title: 'PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES' },
    ]);
  });

  it('Story 20.3: the points section starts a page when it prints after the tests, also when empty; before them (FO.SERV-03 order) it does not', () => {
    const { snapshot, blocks } = withSectionBlocks();
    const points = (layout: ReturnType<typeof layoutSpec>) => layout.sections.find((s) => s.title.startsWith('PONTOS DE ATENÇÃO'))!;
    // With no point and no Não ensaiado sheet the section prints its note alone.
    const fresh = points(layoutSpec({ ...snapshot, blocks: snapshot.blocks.map((b) => ({ ...b, not_tested: null })) }, { revisionNumber: 1, issuedAt: ISSUED_AT }));
    expect(fresh.kind).toBe('empty');
    expect(fresh).toMatchObject({ number: 9, startsPage: true });
    const withPoint = { ...snapshot, points: [{ id: '019966c1-00f2-7000-8000-000000000001', relatorio_id: snapshot.relatorio.id, text: 'Ponto', equipment_id: null, origin: 'manual' as const, order_key: 'a0', removed_at: null, action: null, priority: null, deadline: null, owner: null }] };
    expect(points(layoutSpec(withPoint, { revisionNumber: 1, issuedAt: ISSUED_AT }))).toMatchObject({ kind: 'points', startsPage: true });
    // The order a relatório created before the change stored, and the seed fallback: no break.
    const s8 = byType(blocks, 'section_8');
    const s9 = byType(blocks, 'section_9');
    const old: RelatorioSnapshot = { ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === s8.id ? { ...b, order_key: s9.order_key } : b.id === s9.id ? { ...b, order_key: s8.order_key } : b)) };
    for (const subject of [old, smallSnapshot(), { ...withPoint, blocks: old.blocks }]) {
      const section = points(layoutSpec(subject, { revisionNumber: 1, issuedAt: ISSUED_AT }));
      expect(section.number).toBe(8);
      expect('startsPage' in section).toBe(false);
    }
    // No other section carries the flag.
    expect(layoutSpec(withPoint, { revisionNumber: 1, issuedAt: ISSUED_AT }).sections.filter((s) => 'startsPage' in s).map((s) => s.number)).toEqual([9]);
  });

  it('Story 20.3: a relatório created before the change (points block before the tests block) and one with no section block keep FO.SERV-03 order', () => {
    const { snapshot, blocks } = withSectionBlocks();
    const points = byType(blocks, 'section_8');
    const tests = byType(blocks, 'section_9');
    // The order an older instantiation stored: section_8's key before section_9's.
    const old: RelatorioSnapshot = {
      ...snapshot,
      blocks: snapshot.blocks.map((b) => (b.id === points.id ? { ...b, order_key: tests.order_key } : b.id === tests.id ? { ...b, order_key: points.order_key } : b)),
    };
    const fallback = layoutSpec(smallSnapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT }).toc;
    expect(layoutSpec(old, { revisionNumber: 1, issuedAt: ISSUED_AT }).toc).toEqual(fallback);
    expect(fallback.slice(7, 9)).toEqual([
      { number: 8, title: 'PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES' },
      { number: 9, title: 'RELATÓRIOS DOS ENSAIOS' },
    ]);
  });

  it('drops a removed section, follows a move and prints a duplicate, numbered by position', () => {
    const { snapshot, blocks } = withSectionBlocks();
    const s5 = byType(blocks, 'section_5');
    const s6 = byType(blocks, 'section_6');
    const s8 = byType(blocks, 'section_8');
    const s2 = byType(blocks, 'section_2');
    const s3 = byType(blocks, 'section_3');
    const edited = snapshot.blocks.map((b) => {
      if (b.id === s5.id) return { ...b, removed_at: '2026-09-24T00:00:00.000Z' };
      // 8 moves between 4 and 6 (5 is gone).
      if (b.id === s8.id) return { ...b, order_key: orderKeyBetween(byType(blocks, 'section_4').order_key, s6.order_key) };
      return b;
    });
    // A duplicate of 2 right under it, carrying its own text.
    const duplicate: BlockRow = { ...s2, id: '019966c1-00f2-7000-8000-000000000001', order_key: orderKeyBetween(s2.order_key, s3.order_key), config: { ...(s2.config as object), section_text: 'Texto próprio de {cliente}.\n\nExclusões:\nitem a\nitem b' } };
    const layout = layoutSpec({ ...snapshot, blocks: [...edited, duplicate] }, { revisionNumber: 1, issuedAt: ISSUED_AT });
    expect(layout.toc.map(sectionHeading)).toEqual([
      '1 OBJETIVO',
      `2 ${SECTION_TITLES_V1['2']}`,
      `3 ${SECTION_TITLES_V1['2']}`,
      `4 ${SECTION_TITLES_V1['3']}`,
      `5 ${SECTION_TITLES_V1['4']}`,
      `6 ${SECTION_TITLES_V1['8']}`,
      `7 ${SECTION_TITLES_V1['6']}`,
      `8 ${SECTION_TITLES_V1['7']}`,
      `9 ${SECTION_TITLES_V1['9']}`,
      `10 ${SECTION_TITLES_V1['10']}`,
      `11 ${SECTION_TITLES_V1['11']}`,
    ]);
    // The duplicate prints its own text, resolved, with its list as items.
    const third = layout.sections[2]!;
    expect(third.kind).toBe('text');
    if (third.kind === 'text') {
      expect(third.paragraphs).toEqual([
        { kind: 'paragraph', text: 'Texto próprio de Cliente de Testes Ltda.', runs: [{ text: 'Texto próprio de Cliente de Testes Ltda.' }] },
        { kind: 'paragraph', text: 'Exclusões:', runs: [{ text: 'Exclusões:' }] },
        { kind: 'item', text: 'item a', runs: [{ text: 'item a' }] },
        { kind: 'item', text: 'item b', runs: [{ text: 'item b' }] },
      ]);
    }
    // The moved 8 prints at its new place (Story 7.3); the sections the seed fills stay text. Fix batch e24h: the
    // small fixture stores no point (its one untested sheet listed itself before), so 8 prints its empty note.
    expect(layout.sections[5]!.kind).toBe('empty');
    expect(layout.sections[1]!.kind).toBe('text');
  });
});
