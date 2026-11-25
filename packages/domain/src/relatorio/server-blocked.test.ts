import { describe, expect, it } from 'vitest';
import { issueBlockedReason, PARECER_MISSING_TEXT, serverBlockedRows, type PreIssueRow } from './pre-issue.ts';

/*
 * Story 30.1 C (L4150): the rows of a `409 pre_issue_blocked`. The server names the blocking kinds; the device
 * names them with the rows it holds, else with the kind's own text, and the dialog's reason reads them.
 */

const stale: PreIssueRow = {
  id: 'conclusion_stale',
  row: 'section_9',
  severity: 'blocking',
  text: 'Texto de conclusão desatualizado: SEC-C05',
  kind: 'conclusion_stale',
  sheets: [{ blockId: 'b1', name: 'SEC-C05' }],
};

describe('30.1-UNIT-C (kernel): serverBlockedRows', () => {
  it("names a kind this device holds with its own row, and one it does not with the kind's text, in the server's order", () => {
    const rows = serverBlockedRows(['parecer_missing', 'conclusion_stale', 'conclusion_stale'], [stale]);
    expect(rows.map((row) => [row.kind, row.row, row.text])).toEqual([
      ['parecer_missing', 'section_10', PARECER_MISSING_TEXT],
      ['conclusion_stale', 'section_9', 'Texto de conclusão desatualizado: SEC-C05'],
    ]);
    expect(issueBlockedReason(rows, 3, 10)).toBe('Preencha o parecer (linha 10 do sumário) e atualize o texto da conclusão de SEC-C05 para emitir a revisão 3. O rascunho pode ser visto antes.');
  });

  it('a stale text and an empty utility name the device cannot name still ask for each; an unknown kind has a text of its own', () => {
    const rows = serverBlockedRows(['conclusion_stale', 'utility_name_missing', 'something_newer'], []);
    expect(rows.map((row) => row.text)).toEqual(['Texto de conclusão desatualizado', 'Nome da concessionária em branco', 'Uma pendência impede emitir esta revisão']);
    expect(rows.every((row) => row.severity === 'blocking')).toBe(true);
    expect(issueBlockedReason(rows.slice(0, 1), 2, 10)).toBe('Atualize o texto da conclusão para emitir a revisão 2. O rascunho pode ser visto antes.');
    expect(issueBlockedReason(rows.slice(0, 2), 2, 10)).toBe('Atualize o texto da conclusão e preencha o nome da concessionária para emitir a revisão 2. O rascunho pode ser visto antes.');
  });
});
