import { guardedWordFlags, type GuardKind } from './guard.ts';

/*
 * Story 31.10 (Matheus, 2026-11-27): the AI control proposes before it writes, and a refusal says
 * why. The kernel's half, shared by every reader:
 *
 * - `aiRewriteDiff`: the proposal split in runs, each marked when its words are not the field's
 *   (a word diff by the longest common run of words, compared without case, accents and the
 *   punctuation around a word). Numbers, units and TAGs are never marked: the guard kept them.
 * - `aiRewriteRefusalText`: the line a field shows when the answer is not a new text, in two parts
 *   (what happened to the text, then why), and whether a new tap can help ("Tentar de novo").
 */

/** One run of a proposal: its characters, and whether the AI changed them. */
export interface AiDiffSegment {
  text: string;
  changed: boolean;
}

/** Above this many word pairs the diff reads a word as changed when the field's text does not hold it at all. */
const DIFF_CELLS_MAX = 250_000;

/** Punctuation around a word, as the guard strips it. */
const EDGE = /^[.,;:!?"'()[\]{}“”‘’«»…—–-]+|[.,;:!?"'()[\]{}“”‘’«»…—–-]+$/g;

/** A word as the diff compares it: no punctuation around it, no case, no accents. */
function wordKey(word: string): string {
  return word.replace(EDGE, '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

/** The words of a text (no spacing). */
function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}

/** Which of `proposed`'s words are in a longest common run with `source`'s (by key). */
function keptWords(source: readonly string[], proposed: readonly string[]): boolean[] {
  const kept = proposed.map(() => false);
  const n = source.length;
  const m = proposed.length;
  if (n === 0 || m === 0) return kept;
  if (n * m > DIFF_CELLS_MAX) {
    const known = new Set(source);
    return proposed.map((word) => known.has(word));
  }
  // lcs[i][j]: the longest common run of source[i..] and proposed[j..].
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = source[i] === proposed[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (source[i] === proposed[j]) {
      kept[j] = true;
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i += 1;
    else j += 1;
  }
  return kept;
}

/**
 * The proposal's runs, each marked `changed` when its words are not the field's. Spacing between two
 * changed words is part of the change; a lone punctuation mark, a number, a unit after a number and a
 * TAG are never marked. Joined, the runs give back `proposal` exactly.
 */
export function aiRewriteDiff(source: string, proposal: string): AiDiffSegment[] {
  const parts = proposal.split(/(\s+)/).filter((part) => part !== '');
  const words = parts.filter((part) => !/^\s+$/.test(part));
  const keys = words.map(wordKey);
  const kept = keptWords(wordsOf(source).map(wordKey), keys);
  const guarded = guardedWordFlags(words);
  const wordChanged = words.map((_, at) => !kept[at] && !guarded[at] && keys[at] !== '');
  const flags: boolean[] = [];
  let at = 0;
  parts.forEach((part, index) => {
    if (/^\s+$/.test(part)) {
      // Spacing is changed only between two changed words (`at` is the next word's index).
      flags[index] = at > 0 && at < words.length && wordChanged[at - 1]! && wordChanged[at]!;
      return;
    }
    flags[index] = wordChanged[at]!;
    at += 1;
  });
  const segments: AiDiffSegment[] = [];
  parts.forEach((part, index) => {
    const changed = flags[index]!;
    const last = segments.at(-1);
    if (last !== undefined && last.changed === changed) last.text += part;
    else segments.push({ text: part, changed });
  });
  return segments;
}

/** Why an answer of the AI control is not a new text in the field. */
export type AiRewriteRefusal =
  /** The guard refused the model's text; `guard_kinds` as the server named them (absent on an older server, empty on an empty answer). */
  | { kind: 'guard'; guard_kinds?: readonly GuardKind[] }
  /** The writing call failed (the provider did not answer, or answered an error). */
  | { kind: 'failed' }
  /** `429 quota_exceeded`: the company's daily ceiling of AI writing. */
  | { kind: 'daily_limit' }
  /** `429 rate_limited`: the per-user limit of taps in a minute. */
  | { kind: 'rate_limited' }
  /** `409 not_caught_up` after the device synced again: the server has not applied every op yet. */
  | { kind: 'not_caught_up' }
  /** The field's text changed while the AI wrote (typed here, or arrived from another device). */
  | { kind: 'text_changed' };

/** The refusal's line, in two parts, and whether the AI control offers "Tentar de novo" (else it is disabled with `why`). */
export interface AiRewriteRefusalText {
  what: string;
  why: string;
  retry: boolean;
}

// authored (Story 31.10, listed for Bruno): what happened to the text, the first part of every refusal line but one.
const KEPT = 'O texto foi mantido como estava.';

/** The line a field shows when the AI control's answer is not a new text (Story 31.10). */
export function aiRewriteRefusalText(refusal: AiRewriteRefusal): AiRewriteRefusalText {
  switch (refusal.kind) {
    case 'guard': {
      const kinds = refusal.guard_kinds ?? [];
      if (kinds.some((kind) => kind === 'number' || kind === 'unit' || kind === 'tag')) {
        // authored (Story 31.10, listed for Bruno): the guard refused a number, a unit or a TAG.
        return { what: KEPT, why: 'A IA alterou um valor medido, uma unidade ou uma TAG, e isso não é permitido. Seu texto não mudou.', retry: true };
      }
      if (kinds.includes('result')) {
        // authored (Story 31.10, listed for Bruno): the guard refused a result word added or dropped.
        return { what: KEPT, why: 'A IA alterou uma palavra de resultado, como aprovado ou reprovado, e isso não é permitido. Seu texto não mudou.', retry: true };
      }
      // authored (Story 31.10, listed for Bruno): an empty answer, a section text with another count of blocks, or an older server that names no kind.
      return { what: KEPT, why: 'A IA não devolveu um texto que pudesse ser usado. Seu texto não mudou.', retry: true };
    }
    case 'failed':
      // authored (Story 31.10, listed for Bruno).
      return { what: KEPT, why: 'O serviço de IA não respondeu. Tente de novo em instantes.', retry: true };
    case 'daily_limit':
      // authored (Story 31.10, listed for Bruno): no new tap helps today, so the control is disabled with this reason.
      return { what: KEPT, why: 'O limite diário de IA da empresa foi atingido. Volta amanhã.', retry: false };
    case 'rate_limited':
      // authored (Story 31.10, listed for Bruno): too many taps in a minute (the per-user limit).
      return { what: KEPT, why: 'Foram muitos pedidos à IA em pouco tempo. Aguarde um minuto e tente de novo.', retry: true };
    case 'not_caught_up':
      // authored (Story 31.10, listed for Bruno).
      return { what: KEPT, why: 'Aguarde a sincronização terminar e tente de novo.', retry: true };
    case 'text_changed':
      // authored (Story 31.10, listed for Bruno): the proposal is dropped; the field keeps what was typed or arrived.
      return { what: 'A proposta da IA foi descartada.', why: 'O texto foi editado enquanto a IA escrevia. Tente de novo.', retry: true };
  }
}
