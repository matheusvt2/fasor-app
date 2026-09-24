import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { SECTION_TITLES_V1 } from '../seed/sections-v1.ts';
import { EMPTY_SECTION_NOTE, layoutSpec, sectionHeading, sectionInputs } from './layout.ts';

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
      { label: 'Informações adicionais', value: 'Manutenção preventiva' },
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

  it('prints sections 1 to 6 and 10 with resolved text and 7, 8, 9, 11 as heading plus the note', () => {
    const byNumber = new Map(layout.sections.map((s) => [s.number, s]));
    for (const n of [1, 2, 3, 4, 5, 6, 10]) expect(byNumber.get(n)?.kind, `section ${n}`).toBe('text');
    for (const n of [7, 8, 9, 11]) {
      const section = byNumber.get(n)!;
      expect(section.kind).toBe('empty');
      if (section.kind === 'empty') expect(section.note).toBe(EMPTY_SECTION_NOTE);
    }
    expect(EMPTY_SECTION_NOTE).toBe('(sem conteúdo nesta revisão)');
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
    expect(fourth.paragraphs[0]).toEqual({ kind: 'heading', text: 'Documentação' });
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

  it('reads the responsible, the site fallback and the escopo through sectionInputs', () => {
    const small = smallSnapshot();
    expect(sectionInputs(small)).toEqual({ cliente: 'Cliente de Testes Ltda', obra: 'Local de Testes', datas: '06/09/2026' });
    // A blank `local` is as good as none: the project's site stands in.
    const blankLocal: RelatorioSnapshot = { ...small, relatorio: { ...small.relatorio, setup: { ...small.relatorio.setup, local: '   ' } } };
    expect(sectionInputs(blankLocal).obra).toBe('Local de Testes');
    expect(layoutSpec(blankLocal, { revisionNumber: 1, issuedAt: ISSUED_AT }).cover.table.rows[1]).toEqual({ label: 'Cidade/local', value: 'Local de Testes' });
    const withUser: RelatorioSnapshot = {
      ...small,
      relatorio: { ...small.relatorio, setup: { ...small.relatorio.setup, atividade: 'Manutenção', local: 'Torre X' } },
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
    expect(sectionInputs(withUser)).toEqual({
      cliente: 'Cliente de Testes Ltda',
      obra: 'Torre X',
      datas: '06/09/2026',
      escopo: 'Manutenção',
      responsavel: 'Ana Alves',
      empresa_executora: 'Empresa X',
    });
  });

  it('chooses the seed text in force on sectionTextAt when given', () => {
    const small = smallSnapshot();
    const a = layoutSpec(small, { revisionNumber: 1, issuedAt: ISSUED_AT });
    const b = layoutSpec(small, { revisionNumber: 1, issuedAt: ISSUED_AT, sectionTextAt: '2028-01-01T12:00:00.000Z' });
    // The 2027 NR-10 slot is empty, so the v1 text stays in force after it.
    expect(b.sections).toEqual(a.sections);
  });
});
