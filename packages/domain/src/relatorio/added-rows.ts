import type { BlockRow } from '../schemas/entities.ts';
import { ADDED_ROW_NAME_MAX_LENGTH, ADDED_ROWS_DEFAULT_MAX, type AddedRowsKey } from '../seed/measurement.ts';
import type { FieldDef } from '../seed/schema.ts';
import type { EvaluatedMeasurementRow } from './measurement-evaluation.ts';

/*
 * Story 25.14 (seed v16, contract 54; M23, M30, M19; Matheus's decision 3): a row the technician adds to a
 * measurement test whose definition carries `added_rows` (`seed/measurement.ts`), the one capability the
 * thermography's points (Story 25.15), the ground grid's continuity points (Story 25.16) and the No-break's
 * batteries (Story 25.17) share. The rows are stored on the sheet under their test
 * (`sheet.test[key].added_rows[rowId]`, `schemas/entities.ts`), written through
 * `sheet/{b}/test/{t}/row/{rowId}/{name|removed_at}` and `…/row/{rowId}/cell/{col}` (`ops/path.ts`) and
 * refused by the fold on any other test (`ops/apply.ts` `assertAddedRow`). The evaluation places them after
 * the definition's rows (`measurement-evaluation.ts` `evaluateAddedRows`), so every reader of a test (the
 * progress, the conclusion paragraph, a point's finding, the print, the audit text) reads them there.
 *
 * An added row is the sheet's, not the equipment's (the coordinator's reading): no previous visit is kept or
 * read for it (`print/reading-slots.ts` keys only the definition's rows), "Copiar da última visita" and "Igual
 * à" never copy one, and the next visit starts without it.
 *
 * Here: the rules every surface shares (the name a row takes, a name already taken, the rows the plate's count
 * still asks for) and the derived words the sheet shows for them, each composed once from the key's own words.
 */

/** A stored name as the rows read it: the text trimmed, null while blank or not a string. */
export function addedRowName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** The stem as a sentence names it inside a phrase ("bateria"): the first letter lowered, unless the word is an acronym. */
function inPhrase(word: string): string {
  const second = word.charAt(1);
  if (second !== '' && second === second.toLocaleUpperCase('pt-BR') && second !== second.toLocaleLowerCase('pt-BR')) return word;
  return word.charAt(0).toLocaleLowerCase('pt-BR') + word.slice(1);
}

/** The first letter raised ("Bateria"). */
function sentenceStart(word: string): string {
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
}

// authored (e25s, Story 25.14, listed for Bruno): the words of a row added on the sheet. Without a stem the row is a
// "ponto", as the frames of Stories 25.14 to 25.16 call it (`60-ficha.html` #/ficha/SEC-02, #/ficha/MA-02).
const POINT = { singular: 'ponto', plural: 'pontos', gender: 'm' } as const;

/** The noun a row of this key is called by: its stem's, else "ponto". */
function nounOf(key: AddedRowsKey): { singular: string; plural: string; gender: 'm' | 'f' } {
  return key.stem === undefined ? POINT : { singular: inPhrase(key.stem.singular), plural: inPhrase(key.stem.plural), gender: key.stem.gender };
}

/** The label of a row with no name yet, wherever it is named (the cell's accessible name, a point's text, the print): "Ponto sem nome". */
export function addedRowUnnamedText(key: AddedRowsKey): string {
  // authored (e25s, Story 25.14, listed for Bruno).
  return `${sentenceStart(nounOf(key).singular)} sem nome`;
}

/** The accessible name of a row's name field: "Nome do ponto" (the frame's), "Nome da bateria". */
export function addedRowNameLabel(key: AddedRowsKey): string {
  const noun = nounOf(key);
  // authored (e25s, Story 25.14, listed for Bruno), after the frame's "Nome do ponto".
  return `Nome d${noun.gender === 'f' ? 'a' : 'o'} ${noun.singular}`;
}

/**
 * Review of PR #334 (Story 25.14): the label the conflict view gives a row's contested name, by the row, so two rows'
 * names in conflict never read alike: "Nome do ponto · Portão sul" (its current name, as its cells' labels say), and for
 * a row with no name "Nome do ponto · Linha 7" (its place in the table, 1-based, after the definition's rows).
 */
export function addedRowNameConflictLabel(key: AddedRowsKey, name: string | null, tableRow: number): string {
  return `${addedRowNameLabel(key)} · ${name ?? `Linha ${tableRow + 1}`}`;
}

/** The accessible name of a row's remove action: "Remover ponto Quadro geral de baixa tensão", "Remover bateria Bateria 1" (the frames'). */
export function addedRowRemoveLabel(key: AddedRowsKey, label: string): string {
  return `Remover ${nounOf(key).singular} ${label}`;
}

/** The toast after a row was removed, with "Desfazer": "Ponto removido: Quadro geral de baixa tensão" (the frame's). */
export function addedRowRemovedText(key: AddedRowsKey, label: string): string {
  const noun = nounOf(key);
  // authored (e25s, Story 25.14, listed for Bruno), after the frame's "Ponto removido: …".
  return `${sentenceStart(noun.singular)} removid${noun.gender === 'f' ? 'a' : 'o'}: ${label}`;
}

/** The names joined as a sentence lists them: "A", "A e B", "A, B e C". */
function joined(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]!}`;
}

/**
 * The toast after rows were added: one with no name yet "Ponto acrescentado: dê um nome a ele" (the frame's);
 * one with its numbered name "Bateria acrescentada: Bateria 3"; several "2 baterias acrescentadas: Bateria 3 e
 * Bateria 4" (the frames'). `names` holds each added row's name, null for one with none.
 */
export function addedRowsAddedText(key: AddedRowsKey, names: readonly (string | null)[]): string {
  const noun = nounOf(key);
  const ending = noun.gender === 'f' ? 'a' : 'o';
  const named = names.filter((name): name is string => name !== null);
  // authored (e25s, Story 25.14, listed for Bruno), after the frames' toasts.
  if (names.length <= 1) return named.length === 0 ? `${sentenceStart(noun.singular)} acrescentad${ending}: dê um nome a ${noun.gender === 'f' ? 'ela' : 'ele'}` : `${sentenceStart(noun.singular)} acrescentad${ending}: ${named[0]!}`;
  const many = `${names.length} ${noun.plural} acrescentad${ending}s`;
  return named.length === 0 ? many : `${many}: ${joined(named)}`;
}

/** The action that adds the rows the plate's count still asks for: "Adicionar as 2 baterias que faltam" (the frame's), "Adicionar a bateria que falta". */
export function addedRowsFromPlateLabel(key: AddedRowsKey, missing: number): string {
  const noun = nounOf(key);
  const the = noun.gender === 'f' ? 'a' : 'o';
  // authored (e25s, Story 25.14, listed for Bruno), after the frame's "Adicionar as 2 baterias que faltam".
  return missing === 1 ? `Adicionar ${the} ${noun.singular} que falta` : `Adicionar ${the}s ${missing} ${noun.plural} que faltam`;
}

/** Why the plate action asks for that many: "A placa diz 4 baterias." (the frame's). */
export function addedRowsPlateReason(key: AddedRowsKey, count: number): string {
  const noun = nounOf(key);
  // authored (e25s, Story 25.14, listed for Bruno), after the frame's "A placa diz 4 baterias.".
  return `A placa diz ${count} ${count === 1 ? noun.singular : noun.plural}.`;
}

/** Why the add actions are off: the test already holds its maximum ("Máximo de 30 pontos nesta tabela."). */
export function addedRowsAtMaxText(key: AddedRowsKey): string {
  // authored (e25s, Story 25.14, listed for Bruno).
  return `Máximo de ${key.max ?? ADDED_ROWS_DEFAULT_MAX} ${nounOf(key).plural} nesta tabela.`;
}

/** A name as two names are compared: trimmed, its spaces collapsed, lower case. */
function comparable(name: string): string {
  return name.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
}

/**
 * Whether `name` is already the name of another row of the test on this device: a definition row shown (by its
 * label) or another live added row (by its name). Two devices offline may still give two rows one name; nothing
 * merges them (the story's rule). A blank name is never taken (it is the missing one).
 */
export function addedRowNameTaken(rows: readonly Pick<EvaluatedMeasurementRow, 'label' | 'added'>[], rowId: string | null, name: string): boolean {
  const wanted = comparable(name);
  if (wanted === '') return false;
  return rows.some((row) => {
    if (row.added === undefined) return comparable(row.label) === wanted;
    return row.added.id !== rowId && row.added.name !== null && comparable(row.added.name) === wanted;
  });
}

/**
 * The numbered names the next `count` rows take (`stem` "Bateria": "Bateria 4" on): from the live added rows'
 * count plus one, each skipping a name another row of the test already has. None without a stem (the
 * technician names the row).
 */
export function nextAddedRowNames(key: AddedRowsKey, rows: readonly Pick<EvaluatedMeasurementRow, 'label' | 'added'>[], count: number): string[] {
  if (key.stem === undefined || count <= 0) return [];
  const live = rows.filter((row) => row.added !== undefined).length;
  const names: string[] = [];
  let n = live + 1;
  while (names.length < count) {
    const name = `${key.stem.singular} ${n}`;
    n += 1;
    if (addedRowNameTaken(rows, null, name) || names.some((taken) => comparable(taken) === comparable(name))) continue;
    names.push(name);
  }
  return names;
}

/**
 * The number of rows the plate says the sheet expects: the whole number the key's `plate_field` holds (a
 * measured value, at least 1); null without the field, while it is empty, "N/A" or not a whole number.
 */
export function plateRowCount(block: Pick<BlockRow, 'sheet'>, nameplate: readonly Pick<FieldDef, 'key'>[], key: AddedRowsKey): number | null {
  const field = key.plate_field;
  if (field === undefined || !nameplate.some((candidate) => candidate.key === field)) return null;
  const value = block.sheet.nameplate[field]?.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const stored = value as { raw?: unknown; state?: unknown };
  if (stored.state !== 'measured' || typeof stored.raw !== 'string' || !/^\d+(\.\d+)?$/u.test(stored.raw)) return null;
  const number = Number(stored.raw);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

/** Story 25.14: what the sheet offers to add on a test whose definition carries `added_rows` (`MeasurementTestEvaluation.addedRows`). */
export interface AddedRowsView {
  key: AddedRowsKey;
  /** The action as the sheet draws it ("Adicionar ponto"). */
  label: string;
  /** The live added rows, and the most the test takes. */
  count: number;
  max: number;
  /** Whether one more row may be added (the test holds fewer than `max`). */
  canAdd: boolean;
  /** The name a new row takes: the stem's next number ("Bateria 3"); null without a stem (the technician names it). */
  nextName: string | null;
  /**
   * From the plate's count, when the key names a plate field holding a whole number: that number, and the names of
   * the rows still missing up to it, in order (none once the sheet holds that many; never past `max`). Nothing is
   * added by itself: the sheet offers one action that adds them.
   */
  fromPlate: { count: number; names: string[] } | null;
  /** The longest name a row takes (`ADDED_ROW_NAME_MAX_LENGTH`). */
  nameMax: number;
}

/** The view of a test's added rows (`rows`, the evaluation's, the added ones after the definition's). */
export function addedRowsView(block: Pick<BlockRow, 'sheet'>, nameplate: readonly Pick<FieldDef, 'key'>[], key: AddedRowsKey, rows: readonly Pick<EvaluatedMeasurementRow, 'label' | 'added'>[]): AddedRowsView {
  const count = rows.filter((row) => row.added !== undefined).length;
  const max = key.max ?? ADDED_ROWS_DEFAULT_MAX;
  const plate = plateRowCount(block, nameplate, key);
  const missing = plate === null ? 0 : Math.max(0, Math.min(plate, max) - count);
  return {
    key,
    label: key.label,
    count,
    max,
    canAdd: count < max,
    nextName: nextAddedRowNames(key, rows, 1)[0] ?? null,
    fromPlate: plate === null ? null : { count: plate, names: nextAddedRowNames(key, rows, missing) },
    nameMax: ADDED_ROW_NAME_MAX_LENGTH,
  };
}
