import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { RelatorioRow, TemplateRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { preIssue } from './pre-issue.ts';
import { progress } from './progress.ts';
import type { ProjectRow } from '../schemas/entities.ts';
import {
  cabineMetaText,
  fixedRowNote,
  generateReason,
  numberedSiblings,
  restorableBlocks,
  sectionMovedText,
  SUMARIO_TITLES,
  sumarioMetaText,
  sumarioOpensExpanded,
  sumarioReadingMode,
  sumarioRows,
} from './sumario.ts';
import {
  defaultTemplateFor,
  endBeforeStart,
  lastTemplateUsed,
  newRelatorioEquipmentReady,
  newRelatorioEquipmentReason,
  newRelatorioReason,
  projectLabel,
  projectNamed,
  projectRelatoriosHeading,
  projectRelatoriosMeta,
  projectsOfClient,
  relatoriosOfProject,
  relatorioSubText,
  relatorioTitle,
  sumarioTitle,
  templateBlocksText,
  templateHelperText,
} from './project.ts';

const TEMPLATE_ID = '019966b0-0054-7000-8000-000000000001';

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0055-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0056-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const rowsOf = (snapshot: RelatorioSnapshot) => {
  const computed = progress(snapshot);
  return sumarioRows(snapshot, preIssue(snapshot, computed), computed);
};

describe('4.3-UNIT sumarioRows', () => {
  const snapshot = fresh();
  const rows = rowsOf(snapshot);

  it('lists the cover, the control and the eleven numbered rows in FO.SERV-03 order', () => {
    expect(rows).toHaveLength(13);
    expect(rows.map((r) => r.title)).toEqual([
      'Capa e dados do relatório',
      'Controle do documento',
      'Objetivo',
      'Definições',
      'Limite de escopo',
      'Requisitos básicos',
      'Recomendações gerais (NR-10)',
      'Verificações e ensaios aplicáveis',
      'Registro fotográfico',
      'Pontos de atenção',
      'Relatórios dos ensaios',
      'Conclusão e parecer',
      'Certificados',
    ]);
    expect(rows.map((r) => r.number)).toEqual([null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(rows.map((r) => r.kind)).toEqual([
      'fixed',
      'fixed',
      'setup',
      'text',
      'setup',
      'text',
      'text',
      'text',
      'generated',
      'generated',
      'generated',
      'pending-epic',
      'pending-epic',
    ]);
    expect(rows.filter((r) => r.expandable).map((r) => r.blockType)).toEqual(['section_9']);
    expect(numberedSiblings(rows)).toHaveLength(11);
    expect(numberedSiblings(rows).every((r) => r.siblings === 11 && r.blockId !== null)).toBe(true);
    expect(fixedRowNote('capa')).toBe('sempre no início');
    expect(fixedRowNote('controle')).toBe('montado sozinho');
  });

  it('writes every meta from the kernel: gaps on the cover, "0 de 94" on row 9, the fixed lines elsewhere', () => {
    const meta = Object.fromEntries(rows.map((r) => [r.rowKey, r.meta]));
    expect(meta.capa).toBe('Cliente em branco · Responsável técnico em branco · Razão social não cadastrada · Logo da empresa não cadastrado');
    expect(meta.controle).toBe('montado dos dados do relatório · Rev. 1 na primeira emissão');
    expect(meta.section_1).toBe('editado em Dados do relatório › Etapa 2');
    expect(meta.section_2).toBe('texto padrão');
    // Story 12.3: every cabine of a new relatório still asks its six fields (pending, never blocking).
    expect(meta.section_9).toBe(
      ['0 de 94', ...['Cubículo Enel', '1° Subsolo', 'Oxigênio', 'Cobertura A', 'Cobertura B', 'Geradores'].map((name) => `${name}: faltam 6 campos`)].join(' · '),
    );
    expect(meta.section_7).toBe('disponível em uma próxima etapa');
    // Story 6.6: row 8 counts its entries; a new relatório has none.
    expect(meta.section_8).toBe('Nenhum ponto de atenção');
    expect(rows.every((r) => !r.blocking)).toBe(true);
    expect(rows.filter((r) => r.pending).map((r) => r.rowKey)).toEqual(['capa', 'section_9']);
    expect(generateReason(rows)).toBe('Nada impede gerar.');
  });

  it('E4 retro item 22: an edited section reads "texto editado"; the template text alone reads "texto do template"', () => {
    const section2 = snapshot.blocks.find((b) => b.block_type === 'section_2')!;
    const withConfig = (config: unknown) => ({ ...snapshot, blocks: snapshot.blocks.map((b) => (b.id === section2.id ? { ...b, config: config as never } : b)) });
    const metaOf = (s: RelatorioSnapshot) => rowsOf(s).find((r) => r.rowKey === 'section_2')!.meta;
    expect(metaOf(withConfig({ ...(section2.config as object), section_text: 'do template' }))).toBe('texto do template');
    expect(metaOf(withConfig({ ...(section2.config as object), section_text: 'editado', section_text_edited: true }))).toBe('texto editado');
    expect(metaOf(withConfig({ ...(section2.config as object), section_text: null, section_text_edited: false }))).toBe('texto padrão');
  });

  it('numbers by position after a removal and a move', () => {
    const removed = snapshot.blocks.find((b) => b.block_type === 'section_5')!;
    const without = { ...snapshot, blocks: snapshot.blocks.filter((b) => b.id !== removed.id) };
    const after = rowsOf(without);
    expect(after.map((r) => r.number)).toEqual([null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(after[6]!.title).toBe('Verificações e ensaios aplicáveis');
    const moved = { ...snapshot, blocks: snapshot.blocks.map((b) => (b.block_type === 'section_2' ? { ...b, order_key: 'zz' } : b)) };
    expect(numberedSiblings(rowsOf(moved)).map((r) => r.title).at(-1)).toBe('Definições');
    expect(numberedSiblings(rowsOf(moved)).map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('names the blocking rows in the generate reason', () => {
    const blocking = rows.map((r) => (r.rowKey === 'section_10' ? { ...r, blocking: true } : r));
    expect(generateReason(blocking)).toBe('Só Conclusão e parecer (linha 10) impede gerar. O resto está escrito em cada linha.');
    const two = blocking.map((r) => (r.rowKey === 'capa' ? { ...r, blocking: true } : r));
    expect(generateReason(two)).toBe('Capa e dados do relatório, Conclusão e parecer (linha 10) impedem gerar. O resto está escrito em cada linha.');
  });

  it('lists the removed blocks with a display name, newest removal first', () => {
    const [s2, s4] = ['section_2', 'section_4'].map((t) => snapshot.blocks.find((b) => b.block_type === t)!);
    const sheet = snapshot.blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const blocks = [
      { ...s2!, removed_at: '2026-09-07T10:00:00.000Z' },
      { ...s4!, removed_at: '2026-09-08T10:00:00.000Z' },
      { ...sheet, removed_at: '2026-09-06T10:00:00.000Z' },
      snapshot.blocks.find((b) => b.block_type === 'section_1')!,
    ];
    expect(restorableBlocks(blocks, snapshot.equipment).map((r) => r.name)).toEqual(['4 Requisitos básicos', '2 Definições', 'SEC-C01']);
    expect(restorableBlocks([sheet], []).map((r) => r.name)).toEqual([]);
  });

  it('F-5: gives every restorable row a unique label, the sheet its place and equipment id', () => {
    const s2 = snapshot.blocks.find((b) => b.block_type === 'section_2')!;
    const sheet = snapshot.blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const blocks = [
      { ...s2, removed_at: '2026-09-08T10:00:00.000Z' },
      { ...s2, id: '019966b0-0057-7000-8000-000000000001', removed_at: '2026-09-07T10:00:00.000Z' },
      { ...s2, id: '019966b0-0057-7000-8000-000000000002', removed_at: '2026-09-06T10:00:00.000Z' },
      { ...sheet, removed_at: '2026-09-05T10:00:00.000Z' },
    ];
    const restorable = restorableBlocks(blocks, snapshot.equipment, snapshot.locations);
    expect(restorable.map((r) => r.label)).toEqual(['2 Definições', '2 Definições (2)', '2 Definições (3)', 'SEC-C01 — 1° Subsolo › Coluna 1']);
    expect(restorable.at(-1)).toMatchObject({ name: 'SEC-C01', detail: '1° Subsolo › Coluna 1', equipmentId: sheet.equipment_id });
    expect(restorable[0]).toMatchObject({ detail: null, equipmentId: null });
    expect(new Set(restorable.map((r) => r.label)).size).toBe(4);
  });

  it('writes a cabine meta line from its own data', () => {
    const ps = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const enel = ps.locations.find((l) => l.name === 'Cubículo Enel')!;
    expect(cabineMetaText(enel)).toBe('BLINDADA · 13,8 kV · 19 °C · 67 %');
    // The fixture's 1° Subsolo carries no SE data of its own: only its grouping flag reads.
    expect(cabineMetaText(ps.locations.find((l) => l.name === '1° Subsolo')!)).toBe('agrupar por tipo');
    // A cabine with nothing set reads the dash; a coluna has no data line.
    expect(cabineMetaText(snapshot.locations.find((l) => l.name === 'Cubículo Enel')!)).toBe('—');
    expect(cabineMetaText(snapshot.locations.find((l) => l.kind === 'coluna')!)).toBe('');
  });

  it('4.4 matrix: the cabine meta reads SE type, voltage, temperature, humidity and the grouping flag', () => {
    const base = snapshot.locations.find((l) => l.name === 'Cubículo Enel')!;
    if (base.kind !== 'cabine') throw new Error('Cubículo Enel is a cabine');
    const n = (raw: string) => ({ raw, unit: null, state: 'measured' as const });
    const full = {
      ...base,
      se: { ...base.se, type: 'SE', primary_kv: n('13.8') },
      env: { ...base.env, temperature_c: n('19'), humidity_pct: n('67') },
      agrupar_por_tipo: true,
    };
    expect(cabineMetaText(full)).toBe('SE · 13,8 kV · 19 °C · 67 % · agrupar por tipo');
    expect(cabineMetaText({ ...base, agrupar_por_tipo: false })).toBe('—');
  });

  it('over the Porto Seguro fixture: the cover reads the client and dates once nothing is missing but the logo', () => {
    const ps = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const psRows = rowsOf(ps);
    expect(psRows[0]!.meta).toBe('Logo da empresa não cadastrado');
    expect(psRows.find((r) => r.rowKey === 'section_9')).toBeUndefined();
    expect(psRows).toHaveLength(2);
    // The fixture predates section blocks: a relatório with none lists the two fixed rows only.
    const withSections = { ...ps, blocks: [...ps.blocks, ...fresh().blocks.filter((b) => b.location_id === null).map((b) => ({ ...b, relatorio_id: ps.relatorio.id }))] };
    // The delivered relatório left Cubículo Enel's secondary voltage and two cabines' data blank (Story 12.3 counts them).
    expect(rowsOf(withSections).find((r) => r.rowKey === 'section_9')!.meta).toBe(
      '3 de 94 · 3 não ensaiadas · Cubículo Enel: falta a tensão secundária · 1° Subsolo: faltam 6 campos · Geradores: faltam 6 campos',
    );
  });
});

describe('4.1-UNIT project and relatório texts', () => {
  const project = { name: 'Torres A e B', site: 'Torres A e B — Alameda, 740' };

  it('titles', () => {
    expect(relatorioTitle(project)).toBe('Cabine primária — Torres A e B — Alameda, 740');
    expect(relatorioTitle({ name: 'Obra', site: null })).toBe('Cabine primária — Obra');
    expect(relatorioTitle(null)).toBe('Cabine primária');
    expect(sumarioTitle({ name: 'Seguradora Exemplo S.A.' }, project)).toBe('Seguradora Exemplo S.A. · Torres A e B — Alameda, 740');
    expect(sumarioTitle(null, project)).toBe('Torres A e B — Alameda, 740');
    expect(SUMARIO_TITLES.section_5).toBe('Recomendações gerais (NR-10)');
    expect(sectionMovedText('Objetivo')).toBe('Objetivo movida — numeração refeita');
    expect(sumarioMetaText({ start: '2026-09-06', end: '2026-09-08', templateName: 'Cabine primária — padrão', responsibleName: 'Ana Alves' })).toBe(
      '06–08/09/2026 · template Cabine primária — padrão · responsável Ana Alves',
    );
    expect(sumarioMetaText({ start: null, end: null, templateName: null, responsibleName: null })).toBe('');
  });

  it('project heading, meta and the newest-first list', () => {
    expect(projectRelatoriosHeading(3)).toBe('Relatórios desta obra (3)');
    const rows = [
      { id: '019966b0-0057-7000-8000-000000000001', project_id: 'p', template_id: 't1', removed_at: null },
      { id: '019966b0-0057-7000-8000-000000000003', project_id: 'p', template_id: 't2', removed_at: null },
      { id: '019966b0-0057-7000-8000-000000000002', project_id: 'q', template_id: 't3', removed_at: null },
      { id: '019966b0-0057-7000-8000-000000000004', project_id: 'p', template_id: 't1', removed_at: '2026-09-08T10:00:00.000Z' },
    ] as RelatorioRow[];
    expect(projectRelatoriosMeta(rows)).toBe('3');
    expect(relatoriosOfProject(rows, 'p').map((r) => r.id)).toEqual(['019966b0-0057-7000-8000-000000000003', '019966b0-0057-7000-8000-000000000001']);
    expect(lastTemplateUsed(relatoriosOfProject(rows, 'p'))).toBe('t2');
    expect(lastTemplateUsed([])).toBeNull();
  });

  it('the row sub line reads the creation date out of the UUIDv7 and the template name', () => {
    // 0x019966b00057 ms = 2026-09-2x in America/Sao_Paulo.
    const text = relatorioSubText({ id: '019966b0-0057-7000-8000-000000000001' }, 'Cabine primária — padrão');
    expect(text).toMatch(/^criado em \d{2}\/\d{2}\/\d{4} · Cabine primária — padrão$/);
    expect(relatorioSubText({ id: 'not-a-uuid' }, null)).toBe('');
  });

  it('lists a client\'s live obras by label in pt-BR order and finds one by a name typed like it', () => {
    const rows = [
      { id: 'p1', client_id: 'c', name: 'Obra Z', site: 'Zona Sul', removed_at: null },
      { id: 'p2', client_id: 'c', name: 'Obra A', site: null, removed_at: null },
      { id: 'p3', client_id: 'c', name: 'Obra E', site: 'Água Branca', removed_at: null },
      { id: 'p4', client_id: 'c', name: 'Removida', site: 'Aaa', removed_at: '2026-09-08T10:00:00.000Z' },
      { id: 'p5', client_id: 'd', name: 'Outra', site: 'Aab', removed_at: null },
    ] as ProjectRow[];
    expect(projectLabel(rows[0]!)).toBe('Zona Sul');
    expect(projectLabel(rows[1]!)).toBe('Obra A');
    expect(projectsOfClient(rows, 'c').map((r) => r.id)).toEqual(['p3', 'p2', 'p1']);
    expect(projectsOfClient(rows, null)).toEqual([]);
    expect(projectsOfClient(rows, 'x')).toEqual([]);
    const ofC = projectsOfClient(rows, 'c');
    expect(projectNamed(ofC, '  zona   SUL ')?.id).toBe('p1');
    expect(projectNamed(ofC, 'agua branca')?.id).toBe('p3');
    expect(projectNamed(ofC, 'obra a')?.id).toBe('p2');
    expect(projectNamed(ofC, 'Zona Norte')).toBeNull();
  });

  it('end before start: both dates present and the end earlier', () => {
    expect(endBeforeStart('2026-09-06', '2026-09-05')).toBe(true);
    expect(endBeforeStart('2026-09-06', '2026-09-06')).toBe(false);
    expect(endBeforeStart('2026-09-06', '2026-09-07')).toBe(false);
    expect(endBeforeStart('2026-09-06', null)).toBe(false);
    expect(endBeforeStart(null, '2026-09-05')).toBe(false);
    expect(endBeforeStart('', '2026-09-05')).toBe(false);
  });

  it('section 9 opens expanded on Em campo only; the list reads as is-review on Em revisão only', () => {
    expect(sumarioOpensExpanded('em_campo')).toBe(true);
    for (const status of ['rascunho', 'em_revisao', 'emitido'] as const) expect(sumarioOpensExpanded(status), status).toBe(false);
    expect(sumarioReadingMode('em_revisao')).toBe('is-review');
    for (const status of ['rascunho', 'em_campo', 'emitido'] as const) expect(sumarioReadingMode(status), status).toBeNull();
  });

  it('the dialog reason, in order: template, start, end before start', () => {
    expect(newRelatorioReason({ templateId: null, start: null, end: null })).toBe('Criar relatório: falta o template');
    expect(newRelatorioReason({ templateId: 't', start: null, end: null })).toBe('Criar relatório: falta a data de início');
    expect(newRelatorioReason({ templateId: 't', start: '2026-09-06', end: '2026-09-05' })).toBe('Criar relatório: o fim é anterior ao início');
    expect(newRelatorioReason({ templateId: 't', start: '2026-09-06', end: '2026-09-06' })).toBeNull();
    expect(newRelatorioReason({ templateId: 't', start: '2026-09-06', end: null })).toBeNull();
  });

  describe('E4 retro item 17: newRelatorioEquipmentReady', () => {
    const P = TEST_PROJECT;
    const OTHER_P = '019966b0-0058-7000-8000-0000000000a1';
    const R1 = '019966b0-0058-7000-8000-0000000000b1';
    const R2 = '019966b0-0058-7000-8000-0000000000b2';
    const summaries = [
      { id: R1, project_id: P },
      { id: R2, project_id: OTHER_P },
    ];

    it('a first relatório of the obra (the summary lists none of it) is ready, offline or with no summary', () => {
      expect(newRelatorioEquipmentReady({ projectId: P, summaries: [], heldRelatorioIds: [], downloadedStreamIds: [] })).toBe(true);
      expect(newRelatorioEquipmentReady({ projectId: P, summaries: [{ id: R2, project_id: OTHER_P }], heldRelatorioIds: [], downloadedStreamIds: [] })).toBe(true);
    });

    it('a relatório of the obra this device never pulled makes it not ready', () => {
      expect(newRelatorioEquipmentReady({ projectId: P, summaries, heldRelatorioIds: [], downloadedStreamIds: ['company'] })).toBe(false);
      expect(newRelatorioEquipmentReason()).toBe('Criar relatório: conecte-se para baixar os equipamentos desta obra');
    });

    it('ready once every relatório of the obra is held, or the project stream or a held relatório stream of it was downloaded', () => {
      expect(newRelatorioEquipmentReady({ projectId: P, summaries, heldRelatorioIds: [R1], downloadedStreamIds: [] })).toBe(true);
      expect(newRelatorioEquipmentReady({ projectId: P, summaries, heldRelatorioIds: [], downloadedStreamIds: [`project:${P}`] })).toBe(true);
      expect(newRelatorioEquipmentReady({ projectId: P, summaries, heldRelatorioIds: [], downloadedStreamIds: [`project:${OTHER_P}`] })).toBe(false);
      const R3 = '019966b0-0058-7000-8000-0000000000b3';
      const two = [...summaries, { id: R3, project_id: P }];
      expect(newRelatorioEquipmentReady({ projectId: P, summaries: two, heldRelatorioIds: [R3], downloadedStreamIds: [R3] })).toBe(true);
      expect(newRelatorioEquipmentReady({ projectId: P, summaries: two, heldRelatorioIds: [R3], downloadedStreamIds: [] })).toBe(false);
    });
  });

  it('picks the default template: last used, else the only pickable one, else null', () => {
    const template = (id: string, archived_at: string | null = null): TemplateRow => ({ ...standardTemplate({ id }), archived_at });
    const A = '019966b0-0058-7000-8000-000000000001';
    const B = '019966b0-0058-7000-8000-000000000002';
    const used = [{ id: '019966b0-0058-7000-8000-000000000009', template_id: B, removed_at: null }];
    expect(defaultTemplateFor(used, [template(A), template(B)])).toBe(B);
    expect(defaultTemplateFor(used, [template(A), template(B, '2026-09-01T00:00:00.000Z')])).toBe(A);
    expect(defaultTemplateFor([], [template(A), template(B)])).toBeNull();
    expect(defaultTemplateFor([], [template(A)])).toBe(A);
    expect(defaultTemplateFor([], [])).toBeNull();
  });

  it('template option meta and helper', () => {
    expect(templateBlocksText(94)).toBe('94 blocos');
    expect(templateBlocksText(1)).toBe('1 bloco');
    expect(templateHelperText(94)).toBe('Os 94 blocos nascem nas cabines e colunas do template, com a TAG final. Arquivados não aparecem.');
    expect(templateHelperText(null)).toBe('Os blocos nascem nas cabines e colunas do template, com a TAG final. Arquivados não aparecem.');
  });
});
