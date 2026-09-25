import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { progress, progressCounterText } from './progress.ts';
import { locationTree, treeNodes, type TreeEquipmentNode } from './tree.ts';

/*
 * Story 12.2 (J-05): where Home's "Continuar" goes and what it says. The last sheet worked
 * on this device when it is still a live sheet of the tree; else the first sheet in tree
 * order still missing something (vazia or em preenchimento); else, every sheet done with,
 * the first sheet. A relatório with no sheet has no target: "Continuar" opens the Sumário.
 */

export interface ResumeTarget {
  blockId: string;
  /** The button's tabular part: "SEC-C05 · 42 de 94" (`20-home.html` `.card-continue`). */
  text: string;
}

export function resumeTarget(
  snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment' | 'suggestions'>,
  lastSheetId: string | null,
): ResumeTarget | null {
  const sheets = treeNodes(locationTree(snapshot)).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
  if (sheets.length === 0) return null;
  const node =
    (lastSheetId === null ? undefined : sheets.find((row) => row.blockId === lastSheetId)) ??
    sheets.find((row) => row.state === 'vazia' || row.state === 'em_preenchimento') ??
    sheets[0]!;
  return { blockId: node.blockId, text: `${node.name} · ${progressCounterText(progress(snapshot))}` };
}
