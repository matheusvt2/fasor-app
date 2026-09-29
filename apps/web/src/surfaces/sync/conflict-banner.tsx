import { decisionKey, decisionText, type Decision, type DuplicateTagDecision } from '@app/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { HeldDecisions } from '../../db/decision-store.ts';
import type { Banner } from '../../state/banner-slot.tsx';
import { useSync } from '../../state/sync.tsx';
import { ConflictDialog } from './conflict-dialog.tsx';
import { useDecisionActions, useDecisionTextContext } from './decision-actions.ts';

/*
 * Stories 10.2 and 10.3 (epic-10 "Banner priority"): the conflict Banner a surface puts in
 * the app's one slot (`useExtraBanner`, ranked first by `pickBanner`), `role="alert"`, and
 * the Conflict view it opens.
 *
 * - The sheet (`blockId` given): the open block's contradicting cells, "SEC-C12: 1 célula
 *   em contradição" with "Ver".
 * - The Sumário: the relatório's first structure decision in `openDecisions` order ("SEC-C12:
 *   removido por Eduardo, alterado por você" with "Ver", "Manter", "Remover"; "SEC-C09 foi
 *   criada em dois aparelhos" with "Renomear uma", "Manter as duas"), else its first sheet
 *   with contradicting cells. The rest are listed in Sync status.
 */

export interface ConflictBanner {
  banner: Banner | null;
  /** The Conflict view while it is open, else null; the surface renders it. */
  dialog: ReactNode;
}

function pickDecision(entry: HeldDecisions | undefined, blockId: string | undefined): Decision | null {
  if (entry === undefined) return null;
  if (blockId !== undefined) return entry.decisions.find((decision) => decision.kind === 'cell' && decision.block_id === blockId) ?? null;
  return entry.decisions.find((decision) => decision.kind !== 'cell') ?? entry.decisions[0] ?? null;
}

export function useConflictBanner(input: {
  relatorioId: string;
  blockId?: string;
  /** The Sumário's "Renomear uma": opens its rename dialog on the later equipment. */
  onRenameOne?: (decision: DuplicateTagDecision) => void;
}): ConflictBanner {
  const { relatorioId, blockId, onRenameOne } = input;
  const sync = useSync();
  const entry = sync.decisions?.find((row) => row.relatorioId === relatorioId);
  const decision = pickDecision(entry, blockId);
  const context = useDecisionTextContext(entry ?? null);
  const actions = useDecisionActions();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const t = copy.conflict;
  const text = decision === null ? null : decisionText(decision, context);

  const banner = useMemo<Banner | null>(() => {
    if (decision === null || text === null || entry === undefined) return null;
    const open = () => setOpenKey(decisionKey(decision));
    let buttons: ReactNode;
    if (decision.kind === 'cell') buttons = <TextButton onPress={open}>{t.see}</TextButton>;
    else if (decision.kind === 'block_removal') {
      buttons = (
        <>
          <TextButton onPress={open}>{t.see}</TextButton>
          <TextButton onPress={() => void actions.keep(entry, decision, context)}>{t.keep}</TextButton>
          <TextButton tone="red" onPress={() => void actions.remove(entry, decision, context)}>
            {t.remove}
          </TextButton>
        </>
      );
    } else {
      buttons = (
        <>
          {onRenameOne === undefined ? null : <TextButton onPress={() => onRenameOne(decision)}>{t.renameOne}</TextButton>}
          <TextButton onPress={() => void actions.keepBoth(entry, decision, context)}>{t.keepBoth}</TextButton>
        </>
      );
    }
    return { kind: 'conflict', variant: 'conflict', role: 'alert', text, actions: buttons };
  }, [decision, text, entry, actions, context, onRenameOne, t]);

  const open = openKey === null || entry === undefined ? undefined : entry.decisions.find((row) => decisionKey(row) === openKey);
  const dialog =
    open === undefined || open.kind === 'duplicate_tag' || entry === undefined ? null : (
      <ConflictDialog entry={entry} decision={open} context={context} actions={actions} onClose={() => setOpenKey(null)} />
    );
  return { banner, dialog };
}
