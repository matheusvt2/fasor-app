import { decisionKey, decisionTotal, uniqueHeldDecisions, type Decision, type SyncDecisionRow } from '@app/domain';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { HeldDecisions } from '../../db/decision-store.ts';
import type { SyncState } from '../../state/sync.tsx';
import { ConflictDialog, type ConflictDialogDecision } from './conflict-dialog.tsx';
import { useDecisionActions, useDecisionTextContext, type DecisionActions } from './decision-actions.ts';
import { DecisionsSection } from './sync-sections.tsx';

/*
 * Stories 10.2/10.3, the X side of the X/S seam: Story 10.4's "Decisões" section (its rows,
 * `.banner[data-variant=conflict]` never `role="alert"`, the surface is not live) with each
 * row's resolution. A cell row opens the Conflict view ("Resolver"); a removal row resolves in
 * place ("Manter" / "Remover"); a TAG row renames ("Renomear uma" opens the relatório's
 * Sumário on the rename dialog of the later one) or keeps both ("Manter as duas"). The rows'
 * keys are the kernel's (`syncDecisionRows`: `⟨relatório⟩:⟨decisionKey⟩`).
 */

interface Resolvable {
  entry: HeldDecisions;
  decision: Decision;
}

export function ResolvableDecisions({ held, decisions, merges }: { held: readonly HeldDecisions[]; decisions: readonly SyncDecisionRow[]; merges: SyncState['merges'] }) {
  const actions = useDecisionActions();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const byKey = useMemo(() => {
    const out = new Map<string, Resolvable>();
    for (const entry of uniqueHeldDecisions(held)) for (const decision of entry.decisions) out.set(`${entry.relatorioId}:${decisionKey(decision)}`, { entry, decision });
    return out;
  }, [held]);
  const open = openKey === null ? undefined : byKey.get(openKey);
  return (
    <>
      <DecisionsSection
        decisions={decisions}
        merges={merges}
        count={decisionTotal(held)}
        actions={(row) => {
          const found = byKey.get(row.key);
          return found === undefined ? null : <RowActions {...found} actions={actions} onOpen={() => setOpenKey(row.key)} />;
        }}
      />
      {open === undefined || open.decision.kind === 'duplicate_tag' ? null : (
        <DecisionDialog entry={open.entry} decision={open.decision} actions={actions} onClose={() => setOpenKey(null)} />
      )}
    </>
  );
}

function DecisionDialog({ entry, decision, actions, onClose }: { entry: HeldDecisions; decision: ConflictDialogDecision; actions: DecisionActions; onClose: () => void }) {
  const context = useDecisionTextContext(entry);
  return <ConflictDialog entry={entry} decision={decision} context={context} actions={actions} onClose={onClose} />;
}

function RowActions({ entry, decision, actions, onOpen }: Resolvable & { actions: DecisionActions; onOpen: () => void }) {
  const t = copy.conflict;
  const context = useDecisionTextContext(entry);
  const navigate = useNavigate();
  if (decision.kind === 'cell') return <TextButton onPress={onOpen}>{copy.sync.resolve}</TextButton>;
  if (decision.kind === 'block_removal') {
    return (
      <>
        <TextButton onPress={() => void actions.keep(entry, decision, context)}>{t.keep}</TextButton>
        <TextButton tone="red" onPress={() => void actions.remove(entry, decision, context)}>
          {t.remove}
        </TextButton>
      </>
    );
  }
  return (
    <>
      <TextButton onPress={() => void navigate(`/relatorio/${entry.relatorioId}`, { state: { renameEquipmentId: decision.later_equipment_id } })}>{t.renameOne}</TextButton>
      <TextButton onPress={() => void actions.keepBoth(entry, decision, context)}>{t.keepBoth}</TextButton>
    </>
  );
}
