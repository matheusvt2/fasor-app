import {
  buildSnapshot,
  defaultSectionText,
  editedSectionTextConfig,
  putBlockOp,
  restoredSectionTextConfig,
  INSERTABLE_SECTION_VARIABLES,
  isSectionBlockType,
  relatorioSectionNumber,
  SECTION_VARIABLE_LABELS,
  sectionRowTitle,
  type BlockRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Chip, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { blockRowsOf, relatorioState, templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSectionTextArea } from '../../input/use-section-text-area.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import './relatorio.css';

/** The section types this surface ever opens for; 1 and 3 route to Etapa 2 of the setup page instead. */
const EDITABLE_TYPES = new Set(['section_2', 'section_4', 'section_5', 'section_6']);

const NO_TEMPLATES: { id: string; name: string }[] = [];

/**
 * `/relatorio/:id/secao/:blockId` (Story 4.7): the section's own plain-text boilerplate,
 * with variable chips, autosaving to `block/{id}/config.section_text`. Rows 1 and 3 never
 * route here (the Sumário's `onOpen` sends them to `/setup?etapa=2`); reached with any
 * other block type (a stale link), it shows the not-found copy.
 */
export function SectionTextSurface() {
  const { id = '', blockId = '' } = useParams();
  const db = useSession().database;
  const state = useLiveQuery(() => (db === null ? undefined : relatorioState(db, id)), [db, id]);
  const templates = useLiveQuery(() => (db === null ? Promise.resolve(NO_TEMPLATES) : templateRows(db)), [db], NO_TEMPLATES);
  const snapshot: RelatorioSnapshot | null = useMemo(() => (state === undefined || state === null ? null : buildSnapshot(state, id)), [state, id]);
  const block = snapshot?.blocks.find((row) => row.id === blockId) ?? null;
  const t = copy.sectionText;

  return (
    <main className="screen" data-route="/relatorio/:id/secao/:blockId">
      {state === undefined ? (
        <div className="content">
          <p className="section-note" role="status">
            {copy.common.loading}
          </p>
        </div>
      ) : block === null || snapshot === null || !EDITABLE_TYPES.has(block.block_type) ? (
        <div className="content">
          <p className="section-note">{t.notFound}</p>
          <Link to={`/relatorio/${id}`}>{t.backToSumario}</Link>
        </div>
      ) : (
        <SectionTextEditor
          key={block.id}
          relatorioId={id}
          block={block}
          seedVersion={snapshot.relatorio.seed_version}
          templateName={templates.find((row) => row.id === snapshot.relatorio.template_id)?.name ?? null}
        />
      )}
    </main>
  );
}

interface SectionTextEditorProps {
  relatorioId: string;
  block: BlockRow;
  seedVersion: string;
  templateName: string | null;
}

function SectionTextEditor({ relatorioId, block, seedVersion, templateName }: SectionTextEditorProps) {
  const db = useSession().database;
  const user = useSession().user;
  const navigate = useNavigate();
  const edits = useUndoableEdits();
  const t = copy.sectionText;

  const config = block.config as { section_text?: unknown } | null;
  const own = typeof config?.section_text === 'string' ? config.section_text : null;
  const seeded = isSectionBlockType(block.block_type) ? defaultSectionText(seedVersion, block.block_type, now()) : null;
  const initialText = own ?? seeded ?? '';

  const author = user === null ? null : { id: user.id, companyId: user.companyId };

  /**
   * One `block/{id}/config` put built from the block's config as this device holds it at the
   * moment of the write (never the render's, which a quick second autosave would read
   * stale), in the surface's edit queue (Epic 4 retro item 21). Resolves to the batch id,
   * or null when nothing was written (the block is gone).
   */
  async function writeConfig(next: (config: unknown) => Record<string, unknown>): Promise<string | null> {
    if (db === null || author === null) return null;
    const fresh = (await blockRowsOf(db, relatorioId)).find((row) => row.id === block.id);
    if (fresh === undefined || fresh.removed_at !== null) return null;
    return (await commitBatch(db, [putBlockOp(author, relatorioId, block.id, 'config', next(fresh.config))], { newId, now })).batch_id;
  }

  // A refused autosave is said once, by `useFieldCommit`, which keeps the text for the next blur.
  const committer = useFieldCommit<string>({
    commit: (text) => edits.write(() => writeConfig((current) => editedSectionTextConfig(current, text)), { quiet: true }).then(() => undefined),
  });

  const { areaRef, areaProps, insert, setText } = useSectionTextArea({
    initialText,
    onChange: (text) => {
      // Typing over a restore takes its "Desfazer" away at once: an undo now would put the
      // old text back over what is being typed.
      edits.retire();
      committer.change(text);
    },
    onBlur: () => committer.blur(),
  });

  async function onRestore(): Promise<void> {
    if (own === null) return;
    const editedText = own;
    committer.flush();
    const batch = await edits.write(() => writeConfig(restoredSectionTextConfig)).catch(() => null);
    if (batch === null) return;
    // The area is uncontrolled (Story 3.6): a restore/undo changes what is shown for a
    // reason other than typing in it, so the visible text is set here rather than relying
    // on a remount, which would also fire on every ordinary autosave (`own` changes then too).
    setText(seeded ?? '');
    edits.undoable(t.restored, batch, {
      label: t.undo,
      onUndo: () => {
        setText(editedText);
        // E3-A8: the toast that held focus is about to close; without this the undone
        // edit would leave focus stranded on `<body>`. The text area is what the undo
        // actually changed, so it gets focus back.
        areaRef.current?.focus();
      },
    });
  }

  const number = relatorioSectionNumber(block.block_type) ?? 0;

  // Opening a section moves the focus to its heading, as the setup page does for its band
  // (Epic 4 QA Q14): never left on `<body>` after the Sumário row that opened it is gone.
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="content">
      <div className="sheet-header">
        <div>
          <h2 className="section-text-title" tabIndex={-1} ref={heading}>
            {t.title} {number} — {sectionRowTitle(block.block_type)}
          </h2>
          <p className="sheet-meta">
            {t.metaLead(templateName)}
            <strong>{t.metaStrong}</strong>
            {t.metaTail}
          </p>
        </div>
      </div>

      <div className="secao-content">
        <div>
          <p className="field-label" id="secao-lbl">
            {t.fieldLabel}
          </p>
          <div {...areaProps} className="secao-text" aria-labelledby="secao-lbl" />
        </div>

        <div>
          <p className="field-label" aria-hidden="true">
            {t.insertVariable}
          </p>
          <div className="chip-row" role="group" aria-label={t.insertVariable}>
            {INSERTABLE_SECTION_VARIABLES.map((name) => (
              <Chip key={name} onPress={() => insert(name)}>
                {SECTION_VARIABLE_LABELS[name].toLocaleLowerCase('pt-BR')}
              </Chip>
            ))}
          </div>
        </div>

        <div className="secao-note">
          <span>{t.autosaveNote}</span>
          <TextButton isDisabled={own === null} disabledReason={t.nothingToRestore} onPress={() => void onRestore()}>
            {t.restore}
          </TextButton>
        </div>
      </div>

      <div className="sticky-action-bar">
        <div className="bar-buttons">
          <Button variant="primary" onPress={() => void navigate(`/relatorio/${relatorioId}`)}>
            {t.voltarAoSumario}
          </Button>
        </div>
      </div>
    </div>
  );
}
