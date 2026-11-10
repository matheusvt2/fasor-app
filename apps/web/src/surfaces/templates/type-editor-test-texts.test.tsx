import { TEST_TEXT_MAX_LENGTH, validateTypeDraft, type CompanyTypeDraft } from '@app/domain';
import { DEFINITION_1 } from '@app/domain/fixtures/company-types';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TestsPanel } from './type-editor-parts.tsx';

/*
 * Epic 23 QA (deferred row of batch e23h, Verification Gap VG-3): an over-cap "Como ensaiar"
 * heading or "Recomendação se reprovado" shows its kernel issue inline under its own field of
 * the open test, in either grammar (`TestTextsFields`, `issuesAt(issues, [part, index, 'help',
 * key])` and `[part, index, 'recommendation']`), never under another heading. The issues are the
 * kernel's (`validateTypeDraft`); the open editor also lists every issue of its row at its end,
 * so each check reads the field's own `.field` box. Synthetic texts.
 */

afterEach(cleanup);

const OVER = 'x'.repeat(TEST_TEXT_MAX_LENGTH + 1);
const seeded = DEFINITION_1.tests[0]!;
const measurement = DEFINITION_1.measurement_tests![0]!;

/** DEFINITION_1 with one over-cap text on each grammar's test: the given help heading or the recommendation. */
function draftWith(help: { seeded?: string; measurement?: string }, recommendation: { seeded?: boolean; measurement?: boolean }): CompanyTypeDraft {
  const draft = structuredClone(DEFINITION_1) as unknown as { tests: Record<string, unknown>[]; measurement_tests: Record<string, unknown>[] };
  if (help.seeded !== undefined) draft.tests[0]!.help = { [help.seeded]: OVER };
  if (help.measurement !== undefined) draft.measurement_tests[0]!.help = { [help.measurement]: OVER };
  if (recommendation.seeded === true) draft.tests[0]!.recommendation = OVER;
  if (recommendation.measurement === true) draft.measurement_tests[0]!.recommendation = OVER;
  return draft as unknown as CompanyTypeDraft;
}

function renderPanel(draft: CompanyTypeDraft) {
  const issues = validateTypeDraft(draft);
  render(<TestsPanel draft={draft} issues={issues} edit={() => undefined} />);
  return issues;
}

async function openTest(label: string): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }));
  return screen.getByRole('listitem', { name: `Editar ensaio ${label}` });
}

/** The `.field` box of the textarea labelled `label` inside the open editor. */
const fieldOf = (editor: HTMLElement, label: string): HTMLElement => within(editor).getByLabelText(label, { selector: 'textarea' }).closest<HTMLElement>('.field')!;
const issueLines = (box: HTMLElement): string[] => [...box.querySelectorAll('[data-type-issue]')].map((line) => line.textContent ?? '');

const HEADINGS = ['Objetivo', 'Instrumento', 'Tensão de ensaio', 'Ligações', 'Procedimento', 'Critério', 'Norma', 'Pré-requisito (NR-10)'];
const RECOMMENDATION = 'Recomendação se reprovado';

describe('Epic 23 QA: an over-cap "Como ensaiar" text shows its issue under its own field', () => {
  it('a seeded-grammar test: the over-cap Procedimento carries the kernel sentence, no other heading nor the recommendation does', async () => {
    const issues = renderPanel(draftWith({ seeded: 'procedure' }, {}));
    const message = issues.find((issue) => issue.path[0] === 'tests' && issue.path[2] === 'help')!.message;
    expect(message).toBe(`${seeded.label}: cada tópico de Como ensaiar tem até ${TEST_TEXT_MAX_LENGTH.toLocaleString('pt-BR')} caracteres.`);
    const editor = await openTest(seeded.label);
    expect(issueLines(fieldOf(editor, 'Procedimento'))).toEqual([message]);
    for (const heading of HEADINGS.filter((h) => h !== 'Procedimento')) expect(issueLines(fieldOf(editor, heading)), heading).toEqual([]);
    expect(issueLines(fieldOf(editor, RECOMMENDATION))).toEqual([]);
  });

  it('a seeded-grammar test: the over-cap recommendation carries its own sentence under its field, no heading does', async () => {
    const issues = renderPanel(draftWith({}, { seeded: true }));
    const message = issues.find((issue) => issue.path[0] === 'tests' && issue.path[2] === 'recommendation')!.message;
    expect(message).toBe(`${seeded.label}: a recomendação se reprovado tem até ${TEST_TEXT_MAX_LENGTH.toLocaleString('pt-BR')} caracteres.`);
    const editor = await openTest(seeded.label);
    expect(issueLines(fieldOf(editor, RECOMMENDATION))).toEqual([message]);
    for (const heading of HEADINGS) expect(issueLines(fieldOf(editor, heading)), heading).toEqual([]);
  });

  it('a measurement-grammar test: an over-cap heading and recommendation each sit under their own field, and the seeded test\'s fields carry neither', async () => {
    const issues = renderPanel(draftWith({ measurement: 'objective' }, { measurement: true }));
    const mine = issues.filter((issue) => issue.path[0] === 'measurement_tests');
    const help = mine.find((issue) => issue.path[2] === 'help')!.message;
    const recommendation = mine.find((issue) => issue.path[2] === 'recommendation')!.message;
    expect(help).toContain(`${measurement.label}: cada tópico de Como ensaiar`);
    expect(recommendation).toContain(`${measurement.label}: a recomendação se reprovado`);
    const editor = await openTest(measurement.label);
    expect(issueLines(fieldOf(editor, 'Objetivo'))).toEqual([help]);
    expect(issueLines(fieldOf(editor, RECOMMENDATION))).toEqual([recommendation]);
    for (const heading of HEADINGS.filter((h) => h !== 'Objetivo')) expect(issueLines(fieldOf(editor, heading)), heading).toEqual([]);
    cleanup();
    // The other grammar's test of the same draft: its fields are clean.
    renderPanel(draftWith({ measurement: 'objective' }, { measurement: true }));
    const other = await openTest(seeded.label);
    for (const heading of [...HEADINGS, RECOMMENDATION]) expect(issueLines(fieldOf(other, heading)), heading).toEqual([]);
  });

  it('two over-cap headings of one test each show the sentence under its own field', async () => {
    const draft = draftWith({}, {});
    (draft as unknown as { tests: Record<string, unknown>[] }).tests[0]!.help = { instrument: OVER, nr10: OVER };
    const issues = renderPanel(draft);
    const help = issues.filter((issue) => issue.path[0] === 'tests' && issue.path[2] === 'help');
    expect(help.map((issue) => issue.path[3])).toEqual(['instrument', 'nr10']);
    const editor = await openTest(seeded.label);
    expect(issueLines(fieldOf(editor, 'Instrumento'))).toEqual([help[0]!.message]);
    expect(issueLines(fieldOf(editor, 'Pré-requisito (NR-10)'))).toEqual([help[1]!.message]);
    for (const heading of HEADINGS.filter((h) => h !== 'Instrumento' && h !== 'Pré-requisito (NR-10)')) expect(issueLines(fieldOf(editor, heading)), heading).toEqual([]);
  });
});
