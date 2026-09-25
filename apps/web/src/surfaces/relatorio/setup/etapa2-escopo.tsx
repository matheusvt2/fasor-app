import { defaultExclusions, withoutExclusion, type RelatorioSnapshot } from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { Button, OverflowMenu } from '../../../components/index.ts';
import { copy } from '../../../copy/pt-br.ts';
import { now } from '../../../clock.ts';
import { restoreFocus } from '../../../input/focus-restore.ts';
import { useFieldCommit } from '../../../input/use-field-commit.ts';
import type { UndoableEdits } from '../../../state/use-undoable-edits.ts';
import { exclusionsKey, useTextField, type BandRef, type CommitField } from './setup-fields.ts';

// --- Etapa 2 — Objetivo e escopo ----------------------------------------------------------

export function Etapa2Escopo({
  snapshot,
  onCommit,
  onWriteExclusions,
  undoable,
  bandRef,
}: {
  snapshot: RelatorioSnapshot;
  onCommit: CommitField;
  /** Writes the whole list now, as its own batch; resolves to the batch id. */
  onWriteExclusions: (value: string[]) => Promise<string | null>;
  undoable: UndoableEdits['undoable'];
  bandRef: BandRef;
}) {
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;
  const today = useMemo(() => now().toISOString().slice(0, 10), []);
  const seedExclusions = useMemo(() => defaultExclusions(snapshot.relatorio.seed_version, today), [snapshot.relatorio.seed_version, today]);
  const [exclusions, setExclusions] = useState<string[]>(() => setup.exclusions ?? seedExclusions);
  // Resync when another device (or an undo) changes `setup.exclusions` while this page stays
  // open, mirroring `useTextField`'s committed-ref pattern (`setup-fields.ts`) -- by content, not by
  // reference: `relatorioState`'s live query rebuilds a fresh array on every refresh (an
  // unrelated field's commit, a sync pull), so comparing `!==` on the array itself would
  // treat every such refresh as an external change and reset an in-progress edit.
  const committedExclusions = useRef(exclusionsKey(setup.exclusions));
  const nextKey = exclusionsKey(setup.exclusions);
  if (nextKey !== committedExclusions.current) {
    committedExclusions.current = nextKey;
    setExclusions(setup.exclusions ?? seedExclusions);
  }
  const exclusionsCommitter = useFieldCommit<string[]>({ commit: (value) => onCommit('exclusions', value) });

  // No "Escopo" field (Epic 4 QA Q3): in seed v1 `{escopo}` prints only on the cover, and
  // resolves from Etapa 1's "Informações adicionais"; `setup.escopo` would print nowhere.
  const local = useTextField(setup.local ?? '', (v) => onCommit('local', v === '' ? null : v));
  const localId = useId();

  function onExclusionChange(index: number, value: string): void {
    const next = exclusions.slice();
    next[index] = value;
    setExclusions(next);
    exclusionsCommitter.change(next);
  }

  function onAddExclusion(): void {
    const next = [...exclusions, ''];
    setExclusions(next);
    exclusionsCommitter.change(next);
  }

  // Epic 4 retro item 24: "Remover" of an exclusion's overflow menu writes the list without
  // it at once (what was typed is flushed first, so the undo puts exactly that back), with
  // "Desfazer" in the toast. The focus goes to the row now at its place, else the one before,
  // else "Adicionar exclusão"; after "Desfazer", to the restored row's menu.
  const listRef = useRef<HTMLUListElement>(null);
  const addButton = (): HTMLElement | null => listRef.current?.parentElement?.querySelector<HTMLElement>(':scope > .row > .btn') ?? null;
  const triggerAt = (index: number): HTMLElement | null =>
    listRef.current?.querySelectorAll<HTMLElement>(':scope > li .overflow-trigger')[index] ?? null;

  async function onRemoveExclusion(index: number): Promise<void> {
    exclusionsCommitter.flush();
    const before = exclusions.length;
    const next = withoutExclusion(exclusions, index);
    setExclusions(next);
    const batchId = await onWriteExclusions(next).catch(() => null);
    if (batchId === null) {
      // Nothing was written: the store still holds the row, so the view shows it again
      // (a later autosave of the list must not drop it silently).
      setExclusions(exclusions);
      return;
    }
    restoreFocus(
      () => {
        if ((listRef.current?.children.length ?? 0) >= before) return null;
        return triggerAt(index) ?? triggerAt(index - 1) ?? addButton();
      },
      { mode: 'settled' },
    );
    undoable(t.exclusionRemoved(index + 1), batchId, {
      label: t.undo,
      onUndo: () => restoreFocus(() => ((listRef.current?.children.length ?? 0) >= before ? triggerAt(index) : null), { mode: 'settled' }),
    });
  }

  return (
    <section className="section-band" aria-labelledby="setup-e2" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          2
        </span>
        <h2 className="band-title" id="setup-e2" tabIndex={-1}>
          {t.etapa2Title}
        </h2>
        <span className="band-note">{t.etapa2Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          <div className="field">
            <span className="field-label">{t.empresaExecutoraLabel}</span>
            <div className="input">{snapshot.empresa?.name ?? ''}</div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={localId}>
              {t.localLabel}
            </label>
            <input id={localId} className="input" value={local.text} onChange={(event) => local.change(event.target.value)} onBlur={local.blur} />
          </div>
        </div>
        <ul className="exclusion-list" aria-label={t.exclusionsLabel} ref={listRef}>
          {exclusions.map((text, i) => (
            <li key={i}>
              <span className="exclusion-num" aria-hidden="true">
                {i + 1}.
              </span>
              <input
                className="input grow"
                aria-label={t.exclusionFieldLabel(i + 1)}
                value={text}
                onChange={(event) => onExclusionChange(i, event.target.value)}
                onBlur={() => exclusionsCommitter.blur()}
              />
              <OverflowMenu
                name={t.exclusionFieldLabel(i + 1)}
                label={t.exclusionMenuLabel(i + 1)}
                items={[]}
                destructiveItems={[{ id: 'remove', label: t.removeExclusion, onAction: () => void onRemoveExclusion(i) }]}
              />
            </li>
          ))}
        </ul>
        <div className="row">
          <Button variant="secondary" onPress={onAddExclusion}>
            {t.addExclusion}
          </Button>
        </div>
      </div>
    </section>
  );
}
