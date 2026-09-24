import {
  buildSnapshot,
  defaultSectionText,
  INSERTABLE_SECTION_VARIABLES,
  isSectionBlockType,
  relatorioSectionNumber,
  SECTION_VARIABLE_LABELS,
  sectionRowTitle,
  type BlockRow,
  type RelatorioSnapshot,
} from '@app/domain';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Chip, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { relatorioState, templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useSectionTextArea } from '../../input/use-section-text-area.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
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
  const { showToast } = useToast();
  const t = copy.sectionText;

  const config = block.config as { section_text?: unknown } | null;
  const own = typeof config?.section_text === 'string' ? config.section_text : null;
  const seeded = isSectionBlockType(block.block_type) ? defaultSectionText(seedVersion, block.block_type, now()) : null;
  const initialText = own ?? seeded ?? '';

  const author = user === null ? null : { id: user.id, companyId: user.companyId };

  async function commitConfig(section_text: string | null): Promise<{ batch_id: string } | null> {
    if (db === null || author === null) return null;
    const result = await commitBatch(
      db,
      [
        {
          scope: 'relatorio',
          company_id: author.companyId,
          project_id: null,
          relatorio_id: relatorioId,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: author.id,
          kind: 'put',
          path: `block/${block.id}/config`,
          value: { ...(block.config as object), section_text } as never,
        },
      ],
      { newId, now },
    );
    return { batch_id: result.batch_id };
  }

  const committer = useFieldCommit<string>({ commit: (text) => void commitConfig(text) });

  const { areaRef, areaProps, insert, setText } = useSectionTextArea({
    initialText,
    onChange: (text) => committer.change(text),
    onBlur: () => committer.blur(),
  });

  async function onRestore(): Promise<void> {
    if (own === null) return;
    const editedText = own;
    committer.flush();
    const batch = await commitConfig(null);
    if (batch === null) return;
    // The area is uncontrolled (Story 3.6): a restore/undo changes what is shown for a
    // reason other than typing in it, so the visible text is set here rather than relying
    // on a remount, which would also fire on every ordinary autosave (`own` changes then too).
    setText(seeded ?? '');
    showToast(t.restored, {
      action: {
        label: t.undo,
        onPress: () => {
          if (db === null) return;
          void undoBatch(db, batch.batch_id, { newId, now });
          setText(editedText);
          // E3-A8: the toast that held focus is about to close; without this the undone
          // edit would leave focus stranded on `<body>`. The text area is what the undo
          // actually changed, so it gets focus back.
          areaRef.current?.focus();
        },
      },
    });
  }

  const number = relatorioSectionNumber(block.block_type) ?? 0;

  return (
    <div className="content">
      <div className="sheet-header">
        <div>
          <h2 className="section-text-title">
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
