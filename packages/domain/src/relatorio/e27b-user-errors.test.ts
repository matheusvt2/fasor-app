import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { clientNamedLike, type ClientRow } from '../registry/client-row.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { exportPrecheck, preIssue, sectionTextEmptyText } from './pre-issue.ts';
import { namedWarningSection } from './pre-issue-warnings.ts';
import { progress } from './progress.ts';
import { editedSectionTextConfig, exclusionsWithoutBlanks, printedExclusions, sectionTextEmpty } from './section-variables.ts';
import { siteMissingText } from './site-checklist.ts';
import { sumarioRows } from './sumario.ts';

/*
 * 27.10-UNIT (Story 27.10, F23 to F26 of the manual pass of 2026-11-21): the slips the kernel can see:
 * an emptied section text (a pending row, never blocking, and "texto vazio" on the Sumário), an empty
 * exclusion dropped when "Concluir dados do relatório" writes, a repeated client name, and the
 * unanswered-items message with its plural.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0054-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId: idSequence('019966b0-0055-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0056-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const withSectionText = (snapshot: RelatorioSnapshot, blockType: string, text: string): RelatorioSnapshot => ({
  ...snapshot,
  blocks: snapshot.blocks.map((b) => (b.block_type === blockType ? { ...b, config: editedSectionTextConfig(b.config, text) as never } : b)),
});

const rowsOf = (snapshot: RelatorioSnapshot) => {
  const computed = progress(snapshot);
  const issues = preIssue(snapshot, computed);
  return { issues, sumario: sumarioRows(snapshot, issues, computed) };
};

describe('27.10-UNIT an emptied section text', () => {
  const base = fresh();

  it('raises one pending row naming the section, listed in "Antes de emitir" with its section, never blocking', () => {
    const snapshot = withSectionText(base, 'section_4', '');
    const block = snapshot.blocks.find((b) => b.block_type === 'section_4')!;
    const { issues } = rowsOf(snapshot);
    const empty = issues.filter((row) => row.kind === 'section_text_empty');
    expect(empty).toEqual([{ id: `section_text_empty:${block.id}`, row: 'section_4', severity: 'pending', text: 'Texto vazio em Requisitos básicos', kind: 'section_text_empty' }]);
    expect(sectionTextEmptyText('Definições')).toBe('Texto vazio em Definições');
    const precheck = exportPrecheck(issues);
    expect(precheck.explicit.map((row) => row.kind)).toContain('section_text_empty');
    expect(precheck.blocking.map((row) => row.kind)).not.toContain('section_text_empty');
    expect(namedWarningSection(empty[0]!)).toBe(4);
  });

  it('whitespace only counts as empty; a typed text, the seed text and a non-text section raise none', () => {
    expect(rowsOf(withSectionText(base, 'section_2', ' \n  ')).issues.filter((row) => row.kind === 'section_text_empty')).toHaveLength(1);
    expect(rowsOf(withSectionText(base, 'section_2', 'Definições do relatório')).issues.filter((row) => row.kind === 'section_text_empty')).toEqual([]);
    expect(rowsOf(base).issues.filter((row) => row.kind === 'section_text_empty')).toEqual([]);
    // Section 1 is a setup row: the section text editor never opens it.
    expect(rowsOf(withSectionText(base, 'section_1', '')).issues.filter((row) => row.kind === 'section_text_empty')).toEqual([]);
    expect(sectionTextEmpty({ section_text: null })).toBe(false);
    expect(sectionTextEmpty({})).toBe(false);
    expect(sectionTextEmpty({ section_text: '' })).toBe(true);
  });

  it('the Sumário row reads "texto vazio" in place of "texto editado", pending, and nothing blocks because of it', () => {
    const { sumario } = rowsOf(withSectionText(base, 'section_5', ''));
    const row = sumario.find((r) => r.rowKey === 'section_5')!;
    expect(row.meta).toBe('texto vazio');
    expect(row.pending).toBe(true);
    expect(row.blocking).toBe(false);
    const edited = rowsOf(withSectionText(base, 'section_5', 'editado')).sumario.find((r) => r.rowKey === 'section_5')!;
    expect(edited.meta).toBe('texto editado');
    expect(edited.pending).toBe(false);
  });
});

describe('27.10-UNIT an empty exclusion is dropped when "Concluir dados do relatório" writes', () => {
  it('blank and whitespace-only rows go; the rest keep their order; nothing to drop writes nothing', () => {
    expect(exclusionsWithoutBlanks(['Relé de proteção', '', '  ', 'Banco de capacitores'])).toEqual(['Relé de proteção', 'Banco de capacitores']);
    expect(exclusionsWithoutBlanks([''])).toEqual([]);
    expect(exclusionsWithoutBlanks(['Relé de proteção'])).toBeNull();
    expect(exclusionsWithoutBlanks([])).toBeNull();
    expect(exclusionsWithoutBlanks(null)).toBeNull();
    // The print's own rule: what is kept is what prints.
    expect(exclusionsWithoutBlanks(['a', ' ', 'b'])).toEqual(printedExclusions(['a', ' ', 'b']));
  });
});

describe('27.10-UNIT a repeated client name, by the Novo relatório dialog\'s rule', () => {
  const client = (id: string, name: string): ClientRow => ({ id, kind: 'client', name, cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null });
  const clients = [client('a', 'Cliente Local'), client('b', 'Condomínio Teste')];

  it('case, accents and repeated spaces aside, the name repeats a client; never the row itself, never a blank name', () => {
    expect(clientNamedLike(clients, 'cliente  local')?.id).toBe('a');
    expect(clientNamedLike(clients, '  CONDOMINIO teste ')?.id).toBe('b');
    expect(clientNamedLike(clients, 'Cliente Local', 'a')).toBeNull();
    expect(clientNamedLike(clients, 'Cliente Locais')).toBeNull();
    expect(clientNamedLike(clients, '   ')).toBeNull();
  });
});

describe('27.10-UNIT the unanswered-items message beside "Concluir verificações"', () => {
  it('counts with the kernel plural and names the first item; null once every item is answered', () => {
    const snapshot = fresh();
    const local = snapshot.locations.find((row) => row.kind === 'cabine' && row.parent_id === null)!;
    const text = siteMissingText(snapshot, local.id);
    expect(text).toMatch(/^\d+ itens sem resposta — o primeiro é o item 1, /);
  });
});
