import type { OpDraft } from '../ops/op.ts';
import { suggestionStatusPath } from '../ops/path.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import type { JsonValue, SuggestionRow } from '../schemas/entities.ts';
import type { FieldDef } from '../seed/schema.ts';
import { dateFieldText } from '../format/datetime.ts';
import { plural } from '../text/plural.ts';
import { relatorioOpEnvelope, type Author } from './ops.ts';
import { fieldInputText, valueText } from './suggestion-group.ts';
import { numberShape } from './suggestion-rows.ts';

/*
 * E9-A7, part of `suggestions.ts`: the batches a tap writes (Confirmar, discard) and the
 * suggestion texts (values, buttons, toasts, notes, announcements).
 */

// --- the ops ---------------------------------------------------------------------------------

/**
 * Confirmar (and "Substituir", and the device's auto-confirm with `auto`): the status put
 * and the target put carrying `meta.source_suggestion_id`, one batch. `value` replaces the
 * suggestion's value in the put: the auto-confirm writes the engineer's own cell value back
 * (only its provenance changes), never the reading's spelling of it.
 */
export function confirmSuggestionOps(
  author: Author,
  s: Pick<SuggestionRow, 'id' | 'relatorio_id' | 'target_path' | 'value'>,
  opts: { auto?: boolean; value?: JsonValue } = {},
): OpDraft[] {
  const envelope = relatorioOpEnvelope(author, s.relatorio_id);
  const auto = opts.auto === true ? { auto: true } : {};
  return [
    { ...envelope, meta: opts.auto === true ? { auto: true } : null, kind: 'put', path: suggestionStatusPath(s.id), value: 'confirmed' },
    { ...envelope, meta: { source_suggestion_id: s.id, ...auto }, kind: 'put', path: s.target_path, value: (opts.value === undefined ? s.value : opts.value) as JsonValue },
  ];
}

/** Typing into a suggested field: this suggestion alone is discarded (the typed value op is the caller's). */
export function discardSuggestionOp(author: Author, s: Pick<SuggestionRow, 'id' | 'relatorio_id'>): OpDraft {
  return { ...relatorioOpEnvelope(author, s.relatorio_id), kind: 'put', path: suggestionStatusPath(s.id), value: 'discarded' };
}

// --- the texts ---------------------------------------------------------------------------------

/** A suggested value as a sentence names it, unit included: "630 A", "15 kV", "03/2012", "Schneider". */
export function suggestionValueText(field: Pick<FieldDef, 'kind' | 'unit'> | null, value: unknown): string {
  if (field === null) return typeof value === 'string' ? value : JSON.stringify(value);
  if (field.kind === 'voltage_class') return fieldInputText(field, value);
  if (field.kind === 'date' && typeof value === 'string') return dateFieldText(value);
  const number = numberShape(value);
  if (number !== null) {
    const unit = number.unit ?? field.unit ?? null;
    const shown = formatDecimalGroupedPtBr(number.raw);
    return unit === null ? shown : `${shown} ${unit}`;
  }
  return valueText(field, value);
}

/** The group button: "Confirmar todos (7)". */
export function confirmarTodosText(n: number): string {
  return `Confirmar todos (${n})`;
}

/** The toast of "Confirmar todos": "7 campos confirmados — 1 campo pede verificação" (the verify clause only when one is left). */
export function confirmedAllToastText(confirmed: number, skipped: number): string {
  const done = plural(confirmed, 'campo confirmado', 'campos confirmados');
  return skipped === 0 ? done : `${done} — ${plural(skipped, 'campo pede verificação', 'campos pedem verificação')}`;
}

/** The toast of one Confirmar: "Fabricante: Schneider — confirmado". */
export function confirmedFieldToastText(label: string, valueText: string): string {
  return `${label}: ${valueText} — confirmado`;
}

/**
 * The group note (`60-ficha.html`'s ".section-note" of the nameplate): "9 sugestões lidas da
 * foto 3. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu
 * toque." Without the photo's number (none given, or a photo this device does not number)
 * "da foto N" is left out.
 */
export function suggestionGroupNoteText(n: number, verifyCount: number, photoNumber?: number | null): string {
  const read = `${plural(n, 'sugestão lida', 'sugestões lidas')}${photoNumber == null ? '' : ` da foto ${photoNumber}`}`;
  const head = n === 1 ? `${read}. Nada foi gravado até você confirmar` : `${read}. Nada foi gravado: confirme um a um ou todos`;
  if (verifyCount === 0) return `${head}.`;
  return verifyCount === 1 ? `${head} — o campo “Verificar” pede o seu toque.` : `${head} — os campos “Verificar” pedem o seu toque.`;
}

/** The Confirmar button's accessible name: "Sugerido, 15 kV, confirmar" ("Verificar, …" for a guess to check). */
export function suggestionAnnouncement(trust: SuggestionRow['trust'], valueText: string): string {
  return `${trust === 'verify' ? 'Verificar' : 'Sugerido'}, ${valueText}, confirmar`;
}

/** The replace line beside an engineer-filled value: "Sugerido: 15 kV" (then "Substituir"). */
export function replaceLineText(valueText: string): string {
  return `Sugerido: ${valueText}`;
}

/** The pre-issue row (Story 8.6): "3 fichas com sugestões por confirmar". */
export function fichasComSugestoesText(n: number): string {
  return plural(n, 'ficha com sugestões por confirmar', 'fichas com sugestões por confirmar');
}

/** "Criar Celtta?": the Confirmar of a suggestion that creates its manufacturer (Story 8.5). */
export function criarText(name: string): string {
  return `Criar ${name}?`;
}

/**
 * E78-Q13 (WCAG 2.5.3, label in name): the accessible name of a "Criar Celtta?" Confirmar
 * starts with its visible words, then the trust: "Criar Celtta?, sugerido" ("…, verificar").
 */
export function criarAnnouncement(name: string, trust: SuggestionRow['trust']): string {
  return `${criarText(name)}, ${trust === 'verify' ? 'verificar' : 'sugerido'}`;
}
