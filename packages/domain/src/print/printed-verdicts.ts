import { effectiveConclusionPair, printedConclusionPair, type ConclusionRestriction, type ConclusionResult, type EffectiveConclusionPair } from '../relatorio/conclusion.ts';
import { effectiveParecer, type ParecerVerdict } from '../relatorio/parecer.ts';
import { visitContextOf, type VisitContext } from '../relatorio/visit-context.ts';
import type { BlockRow, PrintedConclusion, RevisionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { groupForPrint } from './group-for-print.ts';
import { printsSection } from './layout.ts';
import { latestRevision } from './revisions.ts';
import { printsConclusionRow } from './section-9.ts';

/*
 * Story 25.4 (Bruno M17, the stored half of M01; AD-1, AD-13): the verdicts an issued relatório
 * printed, kept on its revision. `relatorio.setup.parecer` is written only by a verdict tap and a
 * ficha's stored pair only by "Concluir ficha" or the "Conclusão ajustada" Confirmar, while the
 * screen and the document read the effective values (`effectiveParecer`, `printedConclusionPair`).
 * At issue the generate job stores on the new `revision` row what `printedVerdicts` computes from
 * the frozen snapshot it rendered: section 10's verdict and each ficha's pair as section 9 printed
 * it. The technician's stored choices are never written (a stored verdict is a choice: writing the
 * effective Não apto over it would hold it as one after the fichas clear). A raw reader asks
 * `relatorioVerdicts`: the latest revision's recorded verdicts, else the effective ones.
 */

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Story 25.4: a compile-time check that the stored halves (`printedConclusionSchema`) are the
 * kernel's `ConclusionResult` and `ConclusionRestriction`, each nullable; a drift either way makes
 * this assignment a type error.
 */
export const PRINTED_CONCLUSION_TYPES_MATCH: Same<PrintedConclusion['result'], ConclusionResult | null> & Same<PrintedConclusion['restriction'], ConclusionRestriction | null> = true;

/** What the generate job stores on the revision it writes: the two optional keys of `revisionRowSchema`. */
export interface PrintedVerdicts {
  /** Section 10's verdict as printed (`effectiveParecer`); null when section 10 does not print. */
  printed_parecer: ParecerVerdict | null;
  /** Each ficha section 9 prints a CONCLUSÃO row for, in print order: its X marks (`printedConclusionPair`). */
  printed_conclusions: Record<string, PrintedConclusion>;
}

interface ConclusionSheet {
  block: BlockRow;
  definition: BlockDefinition;
  visit: VisitContext;
}

/**
 * The sheets section 9 prints a CONCLUSÃO row for, in print order: the blocks of `groupForPrint`'s
 * subsections (what `section9Layout` walks) that pass `printsConclusionRow`, each with its
 * definition and its visit context, as `sheetOf` judges it. None when section 9 does not print.
 */
function conclusionSheets(snapshot: RelatorioSnapshot): ConclusionSheet[] {
  if (!printsSection(snapshot, 9)) return [];
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const definitions = snapshotDefinitionContext(snapshot);
  const seen = new Set<string>();
  const sheets: ConclusionSheet[] = [];
  for (const subsection of groupForPrint(snapshot).subsections) {
    for (const blockId of subsection.blockIds) {
      if (seen.has(blockId)) continue;
      seen.add(blockId);
      const block = blocks.get(blockId);
      if (block === undefined) continue;
      const definition = blockDefinitionIn(definitions, block);
      if (definition === null || !printsConclusionRow(block, definition)) continue;
      sheets.push({ block, definition, visit: visitContextOf(snapshot, block) });
    }
  }
  return sheets;
}

const pairOf = (pair: EffectiveConclusionPair): PrintedConclusion => ({ result: pair.result, restriction: pair.restriction });

/**
 * Story 25.4: the verdicts the document of `snapshot` prints, computed by the very calls the layout
 * uses: section 10's title verdict (`effectiveParecer`, null when the section does not print) and,
 * for exactly the sheets section 9 prints a CONCLUSÃO row for, the X marks of that row
 * (`printedConclusionPair` under the sheet's visit context; on an open sheet the chosen halves, null
 * where no X prints). The generate job calls it once on the frozen snapshot it rendered.
 */
export function printedVerdicts(snapshot: RelatorioSnapshot): PrintedVerdicts {
  const printed_conclusions: Record<string, PrintedConclusion> = {};
  for (const { block, definition, visit } of conclusionSheets(snapshot)) printed_conclusions[block.id] = pairOf(printedConclusionPair(block, definition, visit));
  return { printed_parecer: printsSection(snapshot, 10) ? effectiveParecer(snapshot) : null, printed_conclusions };
}

/** What a raw reader (a count, a later export, a query) takes as a relatório's verdicts. */
export interface RelatorioVerdicts {
  /** `revision`: recorded on the latest revision; `effective`: none recorded, the effective values now. */
  source: 'revision' | 'effective';
  /** The number of the revision the verdicts were read from; null for `effective`. */
  revisionNumber: number | null;
  parecer: ParecerVerdict | null;
  conclusions: Record<string, EffectiveConclusionPair>;
}

/**
 * Story 25.4: a relatório's verdicts for a raw reader. The latest revision of the relatório when it
 * carries both recorded keys: what the issued document printed. Otherwise (no revision, or the
 * latest written before the keys existed: absent means "not recorded") the effective values, never
 * Apto nor Aprovado by default: `effectiveParecer` when section 10 prints (else null) and
 * `effectiveConclusionPair` over the same set of fichas `printedVerdicts` records.
 */
export function relatorioVerdicts(snapshot: RelatorioSnapshot, revisions: readonly RevisionRow[]): RelatorioVerdicts {
  const latest = latestRevision(revisions.filter((row) => row.relatorio_id === snapshot.relatorio.id));
  if (latest !== null && latest.printed_parecer !== undefined && latest.printed_conclusions !== undefined) {
    const conclusions: Record<string, EffectiveConclusionPair> = {};
    for (const [blockId, pair] of Object.entries(latest.printed_conclusions)) conclusions[blockId] = { result: pair.result, restriction: pair.restriction };
    return { source: 'revision', revisionNumber: latest.number, parecer: latest.printed_parecer, conclusions };
  }
  const conclusions: Record<string, EffectiveConclusionPair> = {};
  for (const { block, definition, visit } of conclusionSheets(snapshot)) conclusions[block.id] = effectiveConclusionPair(block, definition, visit);
  return { source: 'effective', revisionNumber: null, parecer: printsSection(snapshot, 10) ? effectiveParecer(snapshot) : null, conclusions };
}
