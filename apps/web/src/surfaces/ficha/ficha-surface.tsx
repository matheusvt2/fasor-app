import {
  blockTypeLabel,
  buildSnapshot,
  cabineOf,
  concludedByText,
  enabledSubBlocksOf,
  filledByText,
  getDefinition,
  isCabineFirstSheet,
  isEquipmentBlock,
  isEquipmentBlockType,
  locationPathText,
  nextSheet,
  railHeadText,
  sheetOrder,
  sheetProgress,
  tagRenamedText,
  tagTakenText,
  tagVerdict,
  toIso,
  type BlockDefinition,
  type BlockRow,
  type EntityState,
  type OpDraft,
  type RelatorioSnapshot,
  type SheetStep,
  type UserRow,
  type WordRow,
} from '@app/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { type OverflowMenuAction } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { manufacturerRows, voltageClassRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { writeLastSheet } from '../../db/prefs.ts';
import { localUsers } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { usePageTitle } from '../../state/page-title.tsx';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { useProjectEquipment, useRelatorioEditor, type Build } from '../relatorio/relatorio-editor.ts';
import { RelatorioGate } from '../relatorio/relatorio-gate.tsx';
import { putEquipmentTagOp } from '../relatorio/relatorio-ops.ts';
import { RelatorioTree } from '../relatorio/relatorio-tree.tsx';
import { TagDialog } from '../relatorio/tag-dialogs.tsx';
import '../relatorio/relatorio.css';
import { CabineBlock, QuickNotes } from './cabine-block.tsx';
import { BulkActionBar, ChecklistSection, useChecklistBulk } from './checklist-section.tsx';
import { ConclusaoSection } from './conclusao-section.tsx';
import { EnsaiosSection } from './ensaios-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { FichaHeader } from './ficha-header.tsx';
import { firstFocusable } from './ficha-fields.tsx';
import { concludedByOp } from './ficha-ops.ts';
import { NameplateSection } from './nameplate-section.tsx';
import { SectionStepper } from './section-stepper.tsx';
import { StickyActionBar } from './sticky-action-bar.tsx';
import './ficha.css';

const NO_USERS: UserRow[] = [];
const NO_WORDS: WordRow[] = [];

/** EXPERIENCE.md › Autosave: "Salvo" is announced at most every few seconds, never per keystroke. */
export const SAVED_THROTTLE_MS = 3000;
const SAVED_SHOWN_MS = 1500;

/**
 * `/relatorio/:id/ficha/:blockId` (Stories 5.1-5.4; `60-ficha.html`, `key-equipment-sheet.html`,
 * `key-sheet-states.html`): one equipment sheet, single column at every width, with the
 * relatório tree's rail at its left from 768 px (Story 4.4's rail presentation). The route
 * keys off the block id, not the TAG, so a rename keeps the address (spec Design Notes).
 */
export function FichaSurface() {
  const { id = '', blockId = '' } = useParams();
  return (
    <main className="screen" data-route="/relatorio/:id/ficha/:blockId">
      <RelatorioGate id={id}>{(state) => <Ficha key={blockId} relatorioId={id} blockId={blockId} state={state} />}</RelatorioGate>
    </main>
  );
}

function Ficha({ relatorioId, blockId, state }: { relatorioId: string; blockId: string; state: EntityState }) {
  const snapshot: RelatorioSnapshot = useMemo(() => buildSnapshot(state, relatorioId), [state, relatorioId]);
  const block = snapshot.blocks.find((row) => row.id === blockId && isEquipmentBlock(row)) ?? null;
  const definition = useMemo<BlockDefinition | null>(() => {
    if (block === null) return null;
    try {
      return getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
    } catch {
      return null;
    }
  }, [block]);
  if (block === null || definition === null) {
    return (
      <div className="content">
        <p className="section-note">{copy.ficha.notFound}</p>
      </div>
    );
  }
  return <FichaBody relatorioId={relatorioId} snapshot={snapshot} state={state} block={block} definition={definition} />;
}

/** The "Salvo" live region's text, set at most once per `SAVED_THROTTLE_MS`. */
function useSavedStatus(): { text: string; saved: () => void } {
  const [text, setText] = useState('');
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const saved = useCallback(() => {
    const at = Date.now();
    if (at - last.current < SAVED_THROTTLE_MS) return;
    last.current = at;
    setText(copy.ficha.saved);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(''), SAVED_SHOWN_MS);
  }, []);
  return { text, saved };
}

/** The element inside a missing-field marker that takes the focus. */
function focusableIn(element: HTMLElement): HTMLElement {
  return firstFocusable(element) ?? element;
}

/** After the menu or the dialog that triggered it has handed its focus back, `run` once the DOM holds the change. */
function afterFrames(run: () => void, frames = 3): void {
  let left = frames;
  const tick = () => {
    if (--left <= 0) run();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function FichaBody({
  relatorioId,
  snapshot,
  state,
  block,
  definition,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  state: EntityState;
  block: BlockRow;
  definition: BlockDefinition;
}) {
  const t = copy.ficha;
  const session = useSession();
  const db = session.database;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const blockId = block.id;
  const relatorio = snapshot.relatorio;
  const projectId = relatorio.project_id;
  const equipment = useProjectEquipment(state, projectId);
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);
  const manufacturers = useLiveQuery(() => (db === null ? Promise.resolve(NO_WORDS) : manufacturerRows(db)), [db], NO_WORDS);
  const voltageClasses = useLiveQuery(() => (db === null ? Promise.resolve(NO_WORDS) : voltageClassRows(db)), [db], NO_WORDS);
  const registries = useMemo(() => ({ manufacturer: manufacturers, voltage_class: voltageClasses }), [manufacturers, voltageClasses]);
  const editor = useRelatorioEditor(relatorioId, projectId);
  const { text: savedText, saved } = useSavedStatus();

  const own = block.equipment_id === null ? undefined : equipment.find((row) => row.id === block.equipment_id);
  const tag = own?.tag ?? '';
  const typeName = isEquipmentBlockType(block.block_type) ? copy.composer.equipmentNames[block.block_type] : blockTypeLabel(block.seed_version, block.block_type);
  usePageTitle(tag === '' ? typeName : tag);

  // The rail and "você parou aqui" follow the sheet open now.
  useEffect(() => {
    if (db !== null) void writeLastSheet(db, relatorioId, blockId);
  }, [db, relatorioId, blockId]);

  const progress = useMemo(() => sheetProgress(snapshot, blockId), [snapshot, blockId]);
  const next = useMemo(() => nextSheet(snapshot, blockId), [snapshot, blockId]);
  const cabine = useMemo(() => cabineOf(snapshot.locations, block.location_id), [snapshot.locations, block.location_id]);
  const cabineFirst = useMemo(() => isCabineFirstSheet(snapshot, blockId), [snapshot, blockId]);
  const enabled = enabledSubBlocksOf(block);

  const api: FichaApi = useMemo(
    () => ({
      relatorioId,
      projectId,
      blockId,
      author: editor.author,
      commit: async (drafts: OpDraft[]) => {
        if (db === null) return;
        await commitBatch(db, drafts, { newId, now });
        saved();
      },
      edit: (build: Build) =>
        editor.edit(build).then((batch) => {
          if (batch !== null) saved();
          return batch;
        }),
      undoable: editor.undoable,
      announce: editor.announce,
    }),
    [relatorioId, projectId, blockId, editor, db, saved],
  );
  const bulk = useChecklistBulk(api, snapshot, block, equipment);

  // --- the steps: the current one, the ones left complete (collapsed), the jump -----------
  const [current, setCurrentStep] = useState<SheetStep>(() => progress.firstIncompleteStep ?? 'placa');
  const [left, setLeft] = useState<ReadonlySet<SheetStep>>(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const setCurrent = useCallback(
    (step: SheetStep) => {
      if (step === current) return;
      setLeft((before) => new Set(before).add(current));
      setCurrentStep(step);
    },
    [current],
  );
  const collapsed = (step: SheetStep) => step !== current && left.has(step) && progress.steps[step].missing === 0;

  /** Scrolls to a step and expands it; with `missing`, focuses its first missing field. */
  const goTo = (step: SheetStep, missing: boolean) => {
    setCurrent(step);
    if (step === 'placa' && missing) setRevealed(true);
    const land = () => {
      const host = document.getElementById(`ficha-step-${step}`);
      if (host === null) return;
      host.scrollIntoView?.({ block: 'start' });
      const marker = missing ? host.querySelector<HTMLElement>('[data-missing-field]') : null;
      (marker === null ? host : focusableIn(marker)).focus({ preventScroll: marker === null });
    };
    afterFrames(land);
    // A menu that closed on the action hands its focus back to its trigger on its own
    // schedule; land again only if that is where the focus went (never over a control the
    // engineer moved to in the meantime).
    afterFrames(() => {
      const active = document.activeElement;
      if (active === null || active === document.body || active.matches('.overflow-trigger')) land();
    }, 12);
  };

  // --- the checklist on screen: the Sticky action bar mirrors its bulk action --------------
  const checklistEl = useRef<HTMLElement | null>(null);
  const [checklistOnScreen, setChecklistOnScreen] = useState(false);
  useEffect(() => {
    const element = checklistEl.current;
    if (element === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => setChecklistOnScreen(entries.some((entry) => entry.isIntersecting)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [blockId]);

  // --- "Concluir ficha" and the way on ------------------------------------------------------
  const goNext = () => {
    if (next.kind === 'relatorio') void navigate(`/relatorio/${relatorioId}`);
    else void navigate(`/relatorio/${relatorioId}/ficha/${next.blockId}`);
  };

  const conclude = () => {
    if (!progress.complete) {
      editor.announce(t.incomplete);
      goTo(progress.firstIncompleteStep ?? 'placa', true);
      return;
    }
    if (block.concluded_by !== null) {
      goNext();
      return;
    }
    void api
      .edit((blocks, by) => {
        const fresh = blocks.find((row) => row.id === blockId && row.removed_at === null);
        if (fresh === undefined || fresh.concluded_by !== null) return null;
        if (!sheetProgress({ blocks }, blockId).complete) return null;
        return [concludedByOp(by, relatorioId, blockId, toIso(now()))];
      })
      .then((batch) => {
        if (batch === null) return;
        showToast(t.concluded);
        goNext();
      })
      .catch(() => undefined);
  };

  const concludable = progress.complete && block.concluded_by === null && block.not_tested === null;
  const primaryLabel = concludable ? t.concluir : next.kind === 'ficha' ? t.proximaFicha : next.kind === 'coluna' ? t.proximaColuna : t.voltarRelatorio;

  // --- the header -----------------------------------------------------------------------
  const [renaming, setRenaming] = useState(false);
  const nameOf = (actorId: string | null) => (actorId === null ? null : (users.find((row) => row.id === actorId)?.name ?? (session.user?.id === actorId ? session.user.name : null)));
  const filledName = nameOf(block.last_modified_by);
  const filledBy = filledName === null || block.last_modified_at === null ? null : filledByText(filledName, block.last_modified_at);
  const concludedName = block.concluded_by === null ? null : nameOf(block.concluded_by.actor_id);
  const concludedBy = block.concluded_by === null || concludedName === null ? null : concludedByText(concludedName, block.concluded_by.at);
  const menu: OverflowMenuAction[] = [];
  if (block.concluded_by === null && block.not_tested === null) menu.push({ id: 'concluir', label: t.menuConcluir, onAction: conclude });
  if (block.equipment_id !== null) menu.push({ id: 'rename-tag', label: t.menuRenameTag, onAction: () => setRenaming(true) });

  const rename = (value: string) => {
    const equipmentId = block.equipment_id;
    setRenaming(false);
    if (equipmentId === null) return;
    let refusal: string | null = null;
    void editor
      .edit((_blocks, by, fresh) => {
        const row = fresh.equipment.find((e) => e.id === equipmentId && e.removed_at === null);
        if (row === undefined || row.tag === value.trim()) return null;
        const verdict = tagVerdict(value, fresh.equipment, equipmentId);
        if (verdict !== null) {
          refusal = verdict.reason === 'empty' ? copy.sumario.tagDialogs.emptyTag : tagTakenText(verdict.holder.tag, null);
          return null;
        }
        return [putEquipmentTagOp(by, projectId, equipmentId, value.trim())];
      })
      .then((batch) => {
        if (batch === null) {
          if (refusal !== null) showToast(refusal);
          return;
        }
        saved();
        editor.undoable(tagRenamedText(value.trim()), batch);
      })
      .catch(() => undefined);
  };

  // --- the rail -------------------------------------------------------------------------
  const railT = copy.sumario.rail;
  const [rail, setRail] = useState<'auto' | 'open' | 'closed'>('auto');
  const stripToggle = useRef<HTMLButtonElement>(null);
  const collapse = useRef<HTMLButtonElement>(null);
  const treeContext = useMemo(
    () => ({ relatorioId, projectId, seedVersion: relatorio.seed_version, editor }),
    [relatorioId, projectId, relatorio.seed_version, editor],
  );
  const total = useMemo(() => sheetOrder(snapshot).length, [snapshot]);

  const stepClass = (step: SheetStep) => (collapsed(step) ? 'ficha-step is-collapsed' : 'ficha-step');
  const observations = typeof block.sheet.observations?.value === 'string' ? block.sheet.observations.value : null;

  return (
    <>
      <div className="screen-body ficha-body" data-rail={rail}>
        <aside className="rail-collapsed" aria-label={railT.stripLabel}>
          <button
            type="button"
            className="rail-toggle"
            aria-label={railT.open}
            aria-expanded={false}
            ref={stripToggle}
            onClick={() => {
              setRail('open');
              requestAnimationFrame(() => collapse.current?.focus());
            }}
          >
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-tree" />
            </svg>
          </button>
          <span className="rail-vlabel" aria-hidden="true">
            {railT.title}
          </span>
        </aside>
        <aside className="rail" aria-label={railT.title}>
          <div className="rail-head">
            <span>{railHeadText(total)}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={railT.collapse}
              ref={collapse}
              onClick={() => {
                setRail('closed');
                requestAnimationFrame(() => stripToggle.current?.focus());
              }}
            >
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-back" />
              </svg>
            </button>
          </div>
          <RelatorioTree presentation="rail" snapshot={snapshot} equipment={equipment} lastSheetId={blockId} expandToLastSheet context={treeContext} />
        </aside>

        <div className="ficha-main">
          <FichaHeader
            typeName={typeName}
            tag={tag}
            locationText={locationPathText(snapshot.locations, block.location_id)}
            filledBy={filledBy}
            concludedBy={concludedBy}
            progress={progress}
            menu={menu}
            onRename={block.equipment_id === null ? null : () => setRenaming(true)}
          />
          <div className="content">
            <div id="ficha-step-placa" className={stepClass('placa')} data-step="placa" tabIndex={-1} onFocus={() => setCurrent('placa')}>
              {cabine === null ? null : <CabineBlock api={api} snapshot={snapshot} cabine={cabine} editable={cabineFirst} />}
              {enabled.has('nameplate') ? (
                <NameplateSection
                  api={api}
                  snapshot={snapshot}
                  block={block}
                  definition={definition}
                  equipment={equipment}
                  registries={registries}
                  revealed={revealed}
                  onReveal={() => setRevealed(true)}
                />
              ) : null}
            </div>
            <div id="ficha-step-verificacoes" className={stepClass('verificacoes')} data-step="verificacoes" tabIndex={-1} onFocus={() => setCurrent('verificacoes')}>
              <ChecklistSection
                api={api}
                snapshot={snapshot}
                block={block}
                definition={definition}
                bulk={bulk}
                sectionRef={(element) => {
                  checklistEl.current = element;
                }}
              />
            </div>
            {enabled.has('observations') ? <QuickNotes api={api} snapshot={snapshot} cabine={cabine} observations={observations} /> : null}
            <EnsaiosSection />
            <ConclusaoSection />
          </div>
          <StickyActionBar
            stepper={<SectionStepper progress={progress} current={current} onGo={(step) => goTo(step, false)} />}
            secondary={checklistOnScreen && definition.checklist !== null ? <BulkActionBar bulk={bulk} compact /> : null}
            primaryLabel={primaryLabel}
            onPrimary={concludable ? conclude : goNext}
          />
        </div>
      </div>

      <p className="visually-hidden" role="status" data-testid="ficha-saved">
        {savedText}
      </p>
      <p className="visually-hidden" role="status" data-testid="ficha-announcer">
        {editor.announcement}
      </p>

      {renaming && own !== undefined ? (
        <TagDialog
          title={copy.sumario.tagDialogs.renameTagTitle(tag)}
          action={copy.sumario.tagDialogs.save}
          initial={tag}
          equipment={equipment}
          blocks={snapshot.blocks}
          locations={snapshot.locations}
          selfId={own.id}
          onClose={() => setRenaming(false)}
          onSubmit={rename}
        />
      ) : null}
    </>
  );
}
