import {
  addCabine,
  addColuna,
  addSection,
  addSectionBelow,
  composerView,
  defaultCabineName,
  defaultColunaName,
  duplicateSection,
  findComposerNode,
  moveAnnouncement,
  moveNode,
  moveSection,
  removeNode,
  removeSection,
  renameNode,
  setAgruparPorTipo,
  setQuantity,
  totalsText,
  withoutOrphans,
  type ComposerNode,
  type ComposerSection,
  type EquipmentBlockType,
  type OpDraft,
  type SectionBlockType,
  type TemplateRow,
} from '@app/domain';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router';
import { Button, ConfirmDialog, FormDialog } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { templateRow } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { BlockPaletteContent, PaletteDrawer, sectionName } from './block-palette.tsx';
import { SectionList } from './section-list.tsx';
import { SkeletonList } from './skeleton-list.tsx';
import { putTemplateOp, writeErrorText, type TemplateField } from './template-ops.ts';
import './templates.css';

/** DESIGN.md › Block palette: side by side from 1024 px, a drawer or a sheet below. */
const WIDE_QUERY = '(min-width: 1024px)';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

/**
 * `/templates/:id`: the Template composer of the template the address names, or the
 * not-found sentence when this device holds no live template of that id.
 */
export function TemplateComposerSurface() {
  const { id = '' } = useParams();
  const db = useSession().database;
  const row = useLiveQuery(() => (db === null ? undefined : templateRow(db, id)), [db, id]);
  return (
    <main className="screen" data-route="/templates/:id">
      {row === undefined ? (
        <div className="composer-main">
          <p className="section-note" role="status">
            {copy.common.loading}
          </p>
        </div>
      ) : row === null ? (
        <div className="composer-main">
          <p className="section-note">{copy.composer.notFound}</p>
          <Link to="/templates">{copy.composer.backToList}</Link>
        </div>
      ) : (
        <TemplateComposer key={row.id} row={row} />
      )}
    </main>
  );
}

type Confirming = { title: string; body: string; run: () => Promise<void> };

/**
 * The Template composer (`42-template-composer.html`, Story 3.4). Every edit autosaves as
 * one batch of `template/{id}/{field}` puts, computed by the kernel's pure edit functions
 * from the freshest row on this device (edits run one at a time, so two quick taps never
 * build on the same stale row). Removals confirm and offer "Desfazer"; moves are announced
 * in one polite live region.
 */
function TemplateComposer({ row }: { row: TemplateRow }) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const wide = useMediaQuery(WIDE_QUERY);
  const view = useMemo(() => composerView(row), [row]);
  const [currentRef, setCurrentRef] = useState<string | null>(null);
  const current = findComposerNode(view, currentRef);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [insertBelow, setInsertBelow] = useState<ComposerSection | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [renaming, setRenaming] = useState<ComposerNode | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const firstSection = useRef<HTMLButtonElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const id = row.id;

  /**
   * Runs one edit: reads the row as this device holds it now, asks `build` for the puts
   * and commits them as one batch. Resolves to the batch id (null when there was nothing
   * to write); a refused write is toasted and rejects.
   */
  const edit = useCallback(
    (build: (fresh: TemplateRow) => Array<[TemplateField, unknown]> | null): Promise<string | null> => {
      const run = async (): Promise<string | null> => {
        if (db === null || user === null) return null;
        const fresh = await templateRow(db, id);
        if (fresh === null) return null;
        let puts: Array<[TemplateField, unknown]> | null;
        try {
          puts = build(fresh);
        } catch {
          // The node or section this edit names is gone (another device removed it).
          return null;
        }
        if (puts === null || puts.length === 0) return null;
        const drafts: OpDraft[] = puts.map(([field, value]) => putTemplateOp(user, id, field, value));
        try {
          const { batch_id } = await commitBatch(db, drafts, { newId, now });
          return batch_id;
        } catch (error) {
          showToast(writeErrorText(error));
          throw error;
        }
      };
      const next = queue.current.then(run, run);
      queue.current = next.catch(() => undefined);
      return next;
    },
    [db, user, id, showToast],
  );

  const announce = useCallback((text: string) => {
    // Cleared first, so the same sentence twice in a row is still announced.
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const undoable = useCallback(
    (text: string, batchId: string | null) => {
      if (batchId === null || db === null) return;
      showToast(text, { action: { label: copy.composer.undo, onPress: () => void undoBatch(db, batchId, { newId, now }) } });
    },
    [db, showToast],
  );

  // --- the template's name -------------------------------------------------------
  const [name, setName] = useState(row.name);
  const nameFocused = useRef(false);
  useEffect(() => {
    if (!nameFocused.current) setName(row.name);
  }, [row.name]);
  const nameCommitter = useFieldCommit<string>({
    commit: (value) => edit((fresh) => (value.trim() === '' || fresh.name === value ? null : [['name', value]])).then(() => undefined),
  });

  // --- skeleton ----------------------------------------------------------------------
  const cabineOf = (node: ComposerNode | null): string | null =>
    node === null ? null : node.kind === 'cabine' ? node.ref : node.parent_ref;
  const targetCabine = cabineOf(current);
  const addColunaReason =
    view.cabines.length === 0 ? copy.composer.addColunaNoCabine : targetCabine === null ? copy.composer.selectNode : undefined;

  function onAddCabine(): void {
    const ref = newId();
    void edit((fresh) => [['skeleton', addCabine(fresh.skeleton, ref, defaultCabineName(composerView(fresh).cabineCount + 1))]])
      .then((batch) => {
        if (batch !== null) setCurrentRef(ref);
      })
      .catch(() => undefined);
  }

  function onAddColuna(): void {
    if (targetCabine === null) return;
    const ref = newId();
    const cabine = targetCabine;
    void edit((fresh) => {
      const count = composerView(fresh).cabines.find((c) => c.ref === cabine)?.colunas.length ?? 0;
      return [['skeleton', addColuna(fresh.skeleton, cabine, ref, defaultColunaName(count + 1))]];
    })
      .then((batch) => {
        if (batch !== null) setCurrentRef(ref);
      })
      .catch(() => undefined);
  }

  async function onMoveNode(node: ComposerNode, toIndex: number): Promise<void> {
    const batch = await edit((fresh) => [['skeleton', moveNode(fresh.skeleton, node.ref, toIndex)]]).catch(() => null);
    if (batch !== null) announce(moveAnnouncement(node.name, toIndex + 1, node.siblings));
  }

  function onRemoveNode(node: ComposerNode): void {
    setConfirming({
      title: copy.composer.removeConfirmTitle(node.name),
      body: node.kind === 'cabine' ? copy.composer.removeCabineBody : copy.composer.removeColunaBody,
      run: async () => {
        const batch = await edit((fresh) => {
          const next = removeNode(fresh, node.ref);
          return [
            ['skeleton', next.skeleton],
            ['blocks', next.blocks],
          ];
        }).catch(() => null);
        undoable(copy.composer.removed(node.name), batch);
      },
    });
  }

  function onSetQuantity(ref: string, type: EquipmentBlockType, n: number): Promise<void> {
    return edit((fresh) => [['blocks', setQuantity(fresh, ref, type, n)]]).then(() => undefined);
  }

  // --- sections -------------------------------------------------------------------
  function onAddSection(type: SectionBlockType): void {
    const below = insertBelow;
    setInsertBelow(null);
    void edit((fresh) => [
      ['blocks', below === null ? addSection(withoutOrphans(fresh), type) : addSectionBelow(withoutOrphans(fresh), below.index, type)],
    ]).catch(() => undefined);
  }

  async function onMoveSection(section: ComposerSection, toIndex: number): Promise<void> {
    const batch = await edit((fresh) => [['blocks', moveSection(withoutOrphans(fresh), section.index, toIndex)]]).catch(() => null);
    if (batch !== null) announce(moveAnnouncement(sectionName(section.block_type), toIndex + 1, section.siblings));
  }

  function onAddBelow(section: ComposerSection): void {
    setInsertBelow(section);
    if (wide) requestAnimationFrame(() => firstSection.current?.focus());
    else setPaletteOpen(true);
  }

  function onDuplicateSection(section: ComposerSection): void {
    void edit((fresh) => [['blocks', duplicateSection(withoutOrphans(fresh), section.index)]]).catch(() => undefined);
  }

  function onRemoveSection(section: ComposerSection): void {
    const title = sectionName(section.block_type);
    setConfirming({
      title: copy.composer.removeConfirmTitle(title),
      body: copy.composer.removeSectionBody,
      run: async () => {
        const batch = await edit((fresh) => [['blocks', removeSection(withoutOrphans(fresh), section.index)]]).catch(() => null);
        undoable(copy.composer.removed(title), batch);
      },
    });
  }

  const paletteProps = {
    current,
    onAddSection,
    onSetQuantity: (type: EquipmentBlockType, n: number) =>
      current === null ? Promise.resolve() : onSetQuantity(current.ref, type, n),
    insertBelow: insertBelow === null ? null : sectionName(insertBelow.block_type),
  };

  return (
    <>
      <div className="composer-layout">
        {wide ? (
          <aside className="block-palette composer-palette" aria-label={copy.composer.paletteLabel}>
            <BlockPaletteContent {...paletteProps} firstSectionRef={firstSection} />
          </aside>
        ) : null}

        <div className="composer-main">
          <div className="composer-head">
            <label className="field name-field">
              <span className="field-label">{copy.composer.nameLabel}</span>
              <input
                className="input"
                value={name}
                onFocus={() => {
                  nameFocused.current = true;
                }}
                onChange={(event) => {
                  setName(event.target.value);
                  nameCommitter.change(event.target.value);
                }}
                onBlur={() => {
                  nameFocused.current = false;
                  nameCommitter.blur();
                  if (name.trim() === '') setName(row.name);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') nameCommitter.enter();
                }}
              />
            </label>
            {wide ? null : (
              <Button variant="secondary" onPress={() => setPaletteOpen(true)}>
                {copy.composer.paletteTitle}
              </Button>
            )}
            <p className="composer-meta">{totalsText(view.totals)}</p>
          </div>
          <p className="section-note">{copy.composer.autosaveNote}</p>

          <SkeletonList
            view={view}
            currentRef={current?.ref ?? null}
            onSelect={setCurrentRef}
            onToggleAgrupar={(ref, value) =>
              void edit((fresh) => [['skeleton', setAgruparPorTipo(fresh.skeleton, ref, value)]]).catch(() => undefined)
            }
            onMove={onMoveNode}
            onRename={setRenaming}
            onRemove={onRemoveNode}
            onSetQuantity={onSetQuantity}
            onAddCabine={onAddCabine}
            onAddColuna={onAddColuna}
            addColunaReason={addColunaReason}
          />

          <SectionList
            sections={view.sections}
            onMove={onMoveSection}
            onAddBelow={onAddBelow}
            onDuplicate={onDuplicateSection}
            onRemove={onRemoveSection}
          />
        </div>
      </div>

      <p className="visually-hidden" role="status" data-testid="composer-announcer">
        {announcement}
      </p>

      {wide ? null : (
        <PaletteDrawer
          {...paletteProps}
          isOpen={paletteOpen}
          onOpenChange={(open) => {
            setPaletteOpen(open);
            if (!open) setInsertBelow(null);
          }}
        />
      )}

      {confirming === null ? null : (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          title={confirming.title}
          description={confirming.body}
          confirmLabel={copy.composer.remove}
          cancelLabel={copy.composer.cancel}
          isDestructive
          onConfirm={() => void confirming.run()}
        />
      )}

      {renaming === null ? null : (
        <RenameDialog
          node={renaming}
          onClose={() => setRenaming(null)}
          onSave={(value) => {
            const ref = renaming.ref;
            setRenaming(null);
            void edit((fresh) => [['skeleton', renameNode(fresh.skeleton, ref, value)]]).catch(() => undefined);
          }}
        />
      )}
    </>
  );
}

function RenameDialog({ node, onClose, onSave }: { node: ComposerNode; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(node.name);
  const save = () => {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === node.name) onClose();
    else onSave(trimmed);
  };
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.composer.renameTitle(node.name)}
    >
      <label className="field">
        <span className="field-label">{copy.composer.renameLabel}</span>
        <input
          className="input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
          }}
        />
      </label>
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {copy.composer.cancel}
        </Button>
        <Button variant="primary" onPress={save}>
          {copy.composer.save}
        </Button>
      </div>
    </FormDialog>
  );
}
