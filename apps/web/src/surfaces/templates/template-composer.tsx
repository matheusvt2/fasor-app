import {
  addCabine,
  addColuna,
  addSection,
  addSectionBelow,
  composerView,
  defaultCabineName,
  defaultColunaName,
  defaultSectionText,
  duplicateSection,
  EQUIPMENT_BLOCK_TYPES,
  findComposerNode,
  moveAnnouncement,
  moveNode,
  removedText,
  moveSection,
  removeNode,
  removeSection,
  renameNode,
  isSectionBlockType,
  SECTION_BLOCK_TYPES,
  setAgruparPorTipo,
  setQuantity,
  setSectionText,
  setTypeDefaults,
  TemplateTargetGoneError,
  totalsText,
  typeConfigFor,
  withoutOrphans,
  type ComposerNode,
  type ComposerSection,
  type EquipmentBlockType,
  type OpDraft,
  type SectionBlockType,
  type TemplateRow,
  type TypeConfig,
} from '@app/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, ConfirmDialog, FormDialog } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { templateRow } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { BlockPaletteContent, PaletteDrawer, sectionName } from './block-palette.tsx';
import { SectionList } from './section-list.tsx';
import { SectionTextDialog } from './section-text-dialog.tsx';
import { SkeletonList } from './skeleton-list.tsx';
import { putTemplateOp, type TemplateField } from './template-ops.ts';
import { TypeDefaultsDialog } from './type-defaults-dialog.tsx';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from './use-reorder.ts';
import './templates.css';

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

/** A reorderable row's Overflow trigger (a cabine card's, a coluna row's, a section card's). */
const overflowOf = (row: Element | undefined): HTMLElement | null =>
  row?.querySelector<HTMLElement>(':scope > .overflow-trigger, :scope > .col-line > .overflow-trigger') ?? null;

/**
 * Names where the focus goes once the row `li` has left its list: the Overflow the Confirm
 * dialog returned the focus to leaves with it, which would drop the focus to `<body>`. The
 * row now at its place takes it, else the one before it, else `fallback` (the list's
 * heading, or the cabine a coluna belonged to). Called with the row as drawn before the
 * removal was written.
 */
function focusAfterRemoval(li: HTMLElement | null, fallback: HTMLElement | null): void {
  const list = li?.parentElement ?? null;
  if (li === null || list === null) return;
  const count = list.children.length;
  const index = [...list.children].indexOf(li);
  restoreFocus(
    () => {
      const rows = list.isConnected ? [...list.children] : [];
      // Not re-rendered yet: the row is still counted in its list.
      if (list.isConnected && rows.length >= count) return null;
      return overflowOf(rows[index]) ?? overflowOf(rows[index - 1]) ?? fallback;
    },
    { frames: LIST_FOCUS_WATCH_FRAMES, once: true },
  );
}

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
  // The composer's edit queue and undo toast (Epic 4 retro item 5): once any later edit is
  // written, an undo of a whole-field removal would put the old `blocks`/`skeleton` back
  // over that edit, so the toast goes away instead; leaving the composer takes it away too.
  const edits = useUndoableEdits();
  const view = useMemo(() => composerView(row), [row]);
  const [currentRef, setCurrentRef] = useState<string | null>(null);
  const current = findComposerNode(view, currentRef);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [insertBelow, setInsertBelow] = useState<ComposerSection | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [renaming, setRenaming] = useState<ComposerNode | null>(null);
  const [editingType, setEditingType] = useState<EquipmentBlockType | null>(null);
  const [editingText, setEditingText] = useState<ComposerSection | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const firstSection = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const id = row.id;

  /**
   * Runs one edit: reads the row as this device holds it now, asks `build` for the puts
   * and commits them as one batch. Resolves to the batch id, or null when nothing was
   * written: the row or the node or section the edit names is gone (another device removed
   * it), or there was nothing to change. A refused write, or any other error, is toasted
   * and rejects.
   */
  const { write } = edits;
  const edit = useCallback(
    (build: (fresh: TemplateRow) => Array<[TemplateField, unknown]> | null): Promise<string | null> =>
      write(async () => {
        if (db === null || user === null) return null;
        const fresh = await templateRow(db, id);
        if (fresh === null) return null;
        let puts: Array<[TemplateField, unknown]> | null;
        try {
          puts = build(fresh);
        } catch (error) {
          if (error instanceof TemplateTargetGoneError) return null;
          throw error;
        }
        if (puts === null || puts.length === 0) return null;
        const drafts: OpDraft[] = puts.map(([field, value]) => putTemplateOp(user, id, field, value));
        return (await commitBatch(db, drafts, { newId, now })).batch_id;
      }),
    [write, db, user, id],
  );

  const announce = useCallback((text: string) => {
    // Cleared first, so the same sentence twice in a row is still announced.
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const { undoable: showUndo } = edits;
  // In the edit queue: an undo pressed while a quantity commit is queued runs after it,
  // never racing it on `blocks`.
  const undoable = useCallback(
    (text: string, batchId: string | null) => showUndo(text, batchId, { label: copy.composer.undo }),
    [showUndo],
  );

  // --- the template's name -------------------------------------------------------
  const [name, setName] = useState(row.name);
  const nameFocused = useRef(false);
  useEffect(() => {
    if (!nameFocused.current) setName(row.name);
  }, [row.name]);
  const nameCommitter = useFieldCommit<string>({
    // Stored trimmed; nothing is written for an empty or unchanged name.
    commit: (value) =>
      edit((fresh) => {
        const trimmed = value.trim();
        return trimmed === '' || fresh.name === trimmed ? null : [['name', trimmed]];
      }).then(() => undefined),
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
    if (batch !== null) announce(moveAnnouncement(node.kind, node.name, toIndex + 1, node.siblings));
  }

  function onRemoveNode(node: ComposerNode): void {
    setConfirming({
      title: copy.composer.removeConfirmTitle(node.name),
      body: node.kind === 'cabine' ? copy.composer.removeCabineBody : copy.composer.removeColunaBody,
      run: async () => {
        const li =
          mainRef.current?.querySelector<HTMLElement>(`[data-composer-list="skeleton"] [data-reorder-key="${CSS.escape(node.ref)}"]`) ?? null;
        // A cabine's list is the skeleton (its heading last); a coluna's is its cabine's.
        const fallback =
          node.kind === 'cabine'
            ? (li?.closest('section')?.querySelector<HTMLElement>('h2') ?? null)
            : (li?.closest('.cabine-card')?.querySelector<HTMLElement>(':scope > .block-body') ?? null);
        const batch = await edit((fresh) => {
          const next = removeNode(fresh, node.ref);
          return [
            ['skeleton', next.skeleton],
            ['blocks', next.blocks],
          ];
        }).catch(() => null);
        if (batch !== null) focusAfterRemoval(li, fallback);
        undoable(removedText(node.kind, node.name), batch);
      },
    });
  }

  /** Rejects when nothing was written (the node is gone), so the stepper puts its count back. */
  function onSetQuantity(ref: string, type: EquipmentBlockType, n: number): Promise<void> {
    return edit((fresh) => [['blocks', setQuantity(fresh, ref, type, n)]]).then((batch) => {
      if (batch === null) throw new TemplateTargetGoneError(`quantity not written: node "${ref}" is gone`);
    });
  }

  // --- sections -------------------------------------------------------------------
  function onAddSection(type: SectionBlockType): void {
    const below = insertBelow;
    setInsertBelow(null);
    void edit((fresh) => [
      [
        'blocks',
        below === null
          ? addSection(withoutOrphans(fresh), type, fresh.seed_version)
          : addSectionBelow(withoutOrphans(fresh), below.index, type, fresh.seed_version),
      ],
    ]).catch(() => undefined);
  }

  async function onMoveSection(section: ComposerSection, toIndex: number): Promise<void> {
    const batch = await edit((fresh) => [['blocks', moveSection(withoutOrphans(fresh), section.index, toIndex)]]).catch(() => null);
    if (batch !== null) announce(moveAnnouncement('section', String(section.number), toIndex + 1, section.siblings));
  }

  function onAddBelow(section: ComposerSection): void {
    setInsertBelow(section);
    // From 1024 px the palette sits beside the composition (CSS alone decides, never a JS
    // breakpoint): the focus moves into it. Below, it is hidden, so the drawer opens.
    const first = firstSection.current;
    if (first !== null && first.offsetParent !== null) requestAnimationFrame(() => first.focus());
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
        const list = mainRef.current?.querySelector<HTMLElement>('[data-composer-list="sections"]') ?? null;
        const li = (list?.children[section.position - 1] as HTMLElement | undefined) ?? null;
        const heading = list?.closest('section')?.querySelector<HTMLElement>('h2') ?? null;
        const batch = await edit((fresh) => [['blocks', removeSection(withoutOrphans(fresh), section.index)]]).catch(() => null);
        if (batch !== null) focusAfterRemoval(li, heading);
        undoable(removedText('section', String(section.number)), batch);
      },
    });
  }

  // --- sub-block defaults per type (Story 3.5) -----------------------------------
  const liveBlocks = useMemo(() => withoutOrphans(row), [row]);
  const placedTypes = useMemo(
    () => new Set(EQUIPMENT_BLOCK_TYPES.filter((type) => typeConfigFor(liveBlocks, type) !== null)),
    [liveBlocks],
  );
  const editingConfig = editingType === null ? null : typeConfigFor(liveBlocks, editingType);
  // The type left the template (its last placement went to zero, here or on another device):
  // its panel closes rather than reopening by itself when the type comes back.
  useEffect(() => {
    if (editingType !== null && editingConfig === null) setEditingType(null);
  }, [editingType, editingConfig]);

  /** One change to a type's defaults, applied to its config as the freshest row holds it. */
  function onEditTypeDefaults(type: EquipmentBlockType, update: (current: TypeConfig) => TypeConfig): void {
    void edit((fresh) => {
      const blocks = withoutOrphans(fresh);
      const config = typeConfigFor(blocks, type);
      return config === null ? null : [['blocks', setTypeDefaults(blocks, type, update(config))]];
    }).catch(() => undefined);
  }

  // --- section text (Story 3.6) --------------------------------------------------
  // The seed's text in force today, per section type; null for 8 and 11, which carry none.
  const seedTexts = useMemo(() => {
    const today = now();
    return new Map(SECTION_BLOCK_TYPES.map((type) => [type, defaultSectionText(row.seed_version, type, today)]));
  }, [row.seed_version]);
  const seedTextOf = (section: ComposerSection) => seedTexts.get(section.block_type) ?? null;

  /**
   * Writes the text of the section the dialog was opened on, as the freshest row holds it.
   * An empty text, or one equal to the seed's text in force, is written as null, so the
   * section keeps following the seed. `gone` is true when nothing was written because that
   * section is no longer at its index (another device moved, retyped or removed it); an
   * unchanged text writes nothing and is not `gone`.
   */
  async function writeSectionText(section: ComposerSection, text: string | null): Promise<{ batch: string | null; gone: boolean }> {
    const value = text === null || text.trim() === '' || text === seedTextOf(section) ? null : text;
    let gone = false;
    const batch = await edit((fresh) => {
      const blocks = withoutOrphans(fresh);
      const current = blocks.filter((block) => isSectionBlockType(block.block_type))[section.index];
      if (current === undefined || current.block_type !== section.block_type) {
        gone = true;
        return null;
      }
      if (current.section_text === value) return null;
      return [['blocks', setSectionText(blocks, section.index, value)]];
    });
    return { batch, gone };
  }

  async function onCommitText(section: ComposerSection, text: string): Promise<void> {
    const { gone } = await writeSectionText(section, text);
    if (!gone) return;
    // The section is not where the dialog was opened any more: it closes, so the toast is
    // shown once rather than on every later autosave.
    showToast(copy.composer.textGone);
    setEditingText(null);
  }

  function onRestoreText(section: ComposerSection): void {
    setEditingText(null);
    void writeSectionText(section, null)
      .then(({ batch, gone }) => {
        if (gone) showToast(copy.composer.textGone);
        else if (batch === null) showToast(copy.composer.textRestored);
        else undoable(copy.composer.textRestored, batch);
      })
      .catch(() => undefined);
  }

  const paletteProps = {
    current,
    placedTypes,
    onEditDefaults: setEditingType,
    onAddSection,
    onSetQuantity: (type: EquipmentBlockType, n: number) =>
      current === null ? Promise.resolve() : onSetQuantity(current.ref, type, n),
    insertBelow: insertBelow === null ? null : sectionName(insertBelow.block_type),
  };

  return (
    <>
      <div className="composer-layout">
        {/* Side by side from 1024 px; below, CSS hides it and "Blocos" opens the drawer or sheet. */}
        <aside className="block-palette composer-palette" aria-label={copy.composer.paletteLabel}>
          <BlockPaletteContent {...paletteProps} firstSectionRef={firstSection} />
        </aside>

        <div className="composer-main" ref={mainRef}>
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
            <span className="composer-blocos">
              <Button variant="secondary" onPress={() => setPaletteOpen(true)}>
                {copy.composer.paletteTitle}
              </Button>
            </span>
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
            canEditText={(section) => section.section_text !== null || seedTextOf(section) !== null}
            onEditText={setEditingText}
          />
        </div>
      </div>

      <p className="visually-hidden" role="status" data-testid="composer-announcer">
        {announcement}
      </p>

      <PaletteDrawer
        {...paletteProps}
        isOpen={paletteOpen}
        onOpenChange={(open) => {
          setPaletteOpen(open);
          if (!open) setInsertBelow(null);
        }}
      />

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

      {editingType === null || editingConfig === null ? null : (
        <TypeDefaultsDialog
          type={editingType}
          seedVersion={row.seed_version}
          config={editingConfig}
          onChange={(update) => onEditTypeDefaults(editingType, update)}
          onClose={() => setEditingType(null)}
        />
      )}

      {editingText === null ? null : (
        <SectionTextDialog
          sectionTitle={sectionName(editingText.block_type)}
          sectionNumber={editingText.number}
          text={editingText.section_text ?? seedTextOf(editingText) ?? ''}
          onCommit={(text) => onCommitText(editingText, text)}
          onRestore={() => onRestoreText(editingText)}
          onClose={() => setEditingText(null)}
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
