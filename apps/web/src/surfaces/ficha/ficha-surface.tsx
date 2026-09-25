import {
  blockTypeLabel,
  buildSnapshot,
  cabineOf,
  concludedByText,
  contextCaption,
  conclusionRestrictionOf,
  conclusionResultOf,
  enabledSubBlocksOf,
  filledByText,
  getDefinition,
  getSeed,
  isCabineFirstSheet,
  isEquipmentBlock,
  isEquipmentBlockType,
  locationPathText,
  nextSheet,
  railHeadText,
  sheetOrder,
  sheetProgress,
  stepMayCollapse,
  suggestedInstruments,
  tagRenamedText,
  tagTakenText,
  tagVerdict,
  toIso,
  type BlockDefinition,
  type BlockRow,
  type EntityState,
  type InstrumentRow,
  type OpDraft,
  type RelatorioSnapshot,
  type SeedWord,
  type SheetStep,
  type UserRow,
  type WordRow,
} from '@app/domain';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { type OverflowMenuAction } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { instrumentRows, manufacturerRows, voltageClassRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useBlockPhotoTiles, useLocalWordRows } from '../../db/photo-store.ts';
import { writeLastSheet } from '../../db/prefs.ts';
import { localUsers } from '../../db/sync-store.ts';
import { isPointerModality, useHeldWhilePressed } from '../../input/press-hold.ts';
import { usePageTitle } from '../../state/page-title.tsx';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { useProjectEquipment, useRelatorioEditor, type Build } from '../relatorio/relatorio-editor.ts';
import { RelatorioGate } from '../relatorio/relatorio-gate.tsx';
import { putEquipmentTagOp } from '../relatorio/relatorio-ops.ts';
import { NotTestedDialog } from '../relatorio/not-tested-dialog.tsx';
import { RelatorioTree } from '../relatorio/relatorio-tree.tsx';
import { TagDialog } from '../relatorio/tag-dialogs.tsx';
import '../relatorio/relatorio.css';
import { CabineBlock, QuickNotes } from './cabine-block.tsx';
import { BulkActionBar, ChecklistSection, useChecklistBulk, type ChecklistPhotos } from './checklist-section.tsx';
import { ConclusaoSection } from './conclusao-section.tsx';
import { EnsaiosSection } from './ensaios-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { FichaHeader } from './ficha-header.tsx';
import { firstFocusable } from './ficha-fields.tsx';
import { concludedByOp, conclusionOp, notTestedOp, testInstrumentOp } from './ficha-ops.ts';
import { NameplateSection } from './nameplate-section.tsx';
import { NotTestedBand } from './not-tested-band.tsx';
import { useSheetCamera } from './photo-openers.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';
import { SectionStepper, STEPPER_STEPS } from './section-stepper.tsx';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';
import { StickyActionBar } from './sticky-action-bar.tsx';
import { stepOnScreen, testKeyOnScreen, useOnScreen } from './use-on-screen.ts';
import './ficha.css';

const NO_USERS: UserRow[] = [];
const NO_WORDS: WordRow[] = [];
const NO_INSTRUMENTS: InstrumentRow[] = [];
const NO_SEED_WORDS: { atividades: readonly SeedWord[]; locais: readonly SeedWord[] } = { atividades: [], locais: [] };

function isSheetStep(value: string | null): value is SheetStep {
  return value === 'placa' || value === 'verificacoes' || value === 'ensaios' || value === 'conclusao';
}

/** The Sticky action bar's primary: where the readings' continuous Enter run ends. */
const PRIMARY_ID = 'ficha-primary';

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

function Ficha({ relatorioId, blockId, state: live }: { relatorioId: string; blockId: string; state: EntityState }) {
  // Story 12.1 (J-01): the rows as they were when a finger went down, until it comes up, so
  // a commit landing mid-press never moves the pressed control (`input/press-hold.ts`).
  const state = useHeldWhilePressed(live);
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
  const instruments = useLiveQuery(() => (db === null ? Promise.resolve(NO_INSTRUMENTS) : instrumentRows(db)), [db], NO_INSTRUMENTS);
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

  // The project's equipment, live on its own: a TAG rename moves the prefilled nameplate TAG (Story 12.3).
  const progress = useMemo(() => sheetProgress({ ...snapshot, equipment }, blockId), [snapshot, equipment, blockId]);
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
      // Story 12.1: a typed value joins the relatório's one edit queue, so a tap's edit
      // queued after its blur or Enter commit reads it, and the commit retires only a
      // "Desfazer" toast standing when it was called (never the tap's own fresh toast).
      commit: (drafts: OpDraft[]) => editor.commit(drafts).then(saved),
      edit: (build: Build) =>
        editor.edit(build).then((batch) => {
          if (batch !== null) saved();
          return batch;
        }),
      undoable: editor.undoable,
      announce: editor.announce,
    }),
    [relatorioId, projectId, blockId, editor, saved],
  );
  const bulk = useChecklistBulk(api, snapshot, block, equipment);

  // --- the steps: the current one, the ones left complete (collapsed), the jump -----------
  // D-2 (`source-deltas.md` 2026-09-24): a complete section collapses when the engineer
  // leaves it (a stepper tap, or the keyboard -- Tab, the Enter run -- moving the focus into
  // another section), never in reaction to a tap: a pointer focus arriving in another
  // section makes it current but leaves the previous one open, and a section holding a
  // reading out of its criterion never collapses (`stepMayCollapse`, the kernel's rule).
  const [current, setCurrentStep] = useState<SheetStep>(() => progress.firstIncompleteStep ?? 'placa');
  const [left, setLeft] = useState<ReadonlySet<SheetStep>>(() => new Set());
  const setCurrent = useCallback(
    (step: SheetStep, leaving: boolean) => {
      if (step === current) return;
      setLeft((before) => {
        const after = new Set(before);
        after.delete(step);
        if (leaving) after.add(current);
        return after;
      });
      setCurrentStep(step);
    },
    [current],
  );
  // --- Story 6.1: the camera, captioned from where the engineer stands --------------------
  const sync = useSync();
  const localWords = useLocalWordRows(db);
  const seedWords = useMemo(() => {
    try {
      const seed = getSeed(block.seed_version, 'cabine_primaria');
      return { atividades: seed.atividades, locais: seed.locais };
    } catch {
      return NO_SEED_WORDS;
    }
  }, [block.seed_version]);
  /** The capture target, read when a camera opens: the section on screen then, the item if any. */
  const photoTarget = (itemKey: string | null): CaptureTarget => {
    const onScreen = stepOnScreen();
    const step: SheetStep = itemKey !== null ? 'verificacoes' : isSheetStep(onScreen) ? onScreen : current;
    const testKey = step === 'ensaios' ? testKeyOnScreen() : null;
    return {
      blockId,
      itemKey,
      caption: contextCaption({ block_id: blockId, item_key: itemKey }, snapshot, { step, testKey, words: seedWords, registry: localWords }),
    };
  };
  const sheetCamera = useSheetCamera(relatorioId, () => photoTarget(null));
  const photoTiles = useBlockPhotoTiles(db, relatorioId, blockId);
  const { retryUpload } = sync;
  const checklistPhotos: ChecklistPhotos = {
    tiles: photoTiles,
    target: (itemKey) => photoTarget(itemKey),
    retry: (fileId) => void retryUpload?.(fileId),
  };

  /** A focus arriving in `step`: leaving the previous step only when it came from the keyboard. */
  const focusIn = (step: SheetStep) => setCurrent(step, !isPointerModality());
  const collapsed = (step: SheetStep) => step !== current && left.has(step) && stepMayCollapse(progress, step);

  /** Scrolls to a step and expands it; with `missing`, focuses its first missing field. */
  const goTo = (step: SheetStep, missing: boolean) => {
    setCurrent(step, true);
    const land = () => {
      const host = document.getElementById(`ficha-step-${step}`);
      if (host === null) return;
      host.scrollIntoView?.({ block: 'start' });
      // The first marker drawn now (a TTR table and its phone cards both carry one; CSS shows one).
      const marker = missing ? ([...host.querySelectorAll<HTMLElement>('[data-missing-field]')].find((element) => element.getClientRects().length > 0) ?? null) : null;
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
  const checklistOnScreen = useOnScreen(checklistEl, blockId);
  // J-15: the mirror only while something is left to mark. When it leaves holding the focus
  // (its own keyboard press marked the last items), the focus goes to the list head's action,
  // still there with its reason, never to the page body.
  const showMirror = checklistOnScreen && definition.checklist !== null && block.not_tested === null && bulk.unset > 0;
  const mirrorFocused = useRef(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      mirrorFocused.current = event.target instanceof Element && event.target.closest('.sticky-action-bar .bulk-action-bar') !== null;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  useLayoutEffect(() => {
    if (showMirror || !mirrorFocused.current) return;
    mirrorFocused.current = false;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    document.querySelector<HTMLElement>('#ficha-step-verificacoes .bulk-action-bar button')?.focus({ preventScroll: true });
  }, [showMirror]);

  // --- "Concluir ficha" and the way on ------------------------------------------------------
  const goNext = () => {
    if (next.kind === 'relatorio') void navigate(`/relatorio/${relatorioId}`);
    else void navigate(`/relatorio/${relatorioId}/ficha/${next.blockId}`);
  };

  /**
   * "Concluir ficha" (Story 12.1): completeness is decided on the fresh rows inside the
   * edit, which runs after the commit of the value typed just before (the one queue), never
   * on this render's progress, which may predate that commit. `otherwise` runs when the
   * fresh rows are not complete: the menu and a primary labelled "Concluir ficha" say so and
   * jump to the first missing field; a primary still labelled "Próxima ficha" moves on.
   * Story 12.3 (D-4): the conclusion confirms every suggested instrument of the sheet, in
   * the same batch as `concluded_by` ("Próxima ficha" alone writes nothing).
   */
  const conclude = (otherwise: 'jump' | 'next' = 'jump') => {
    if (block.concluded_by !== null) {
      goNext();
      return;
    }
    let firstMissing: SheetStep | null = null;
    void api
      .edit((blocks, by, rows) => {
        const fresh = blocks.find((row) => row.id === blockId && row.removed_at === null);
        if (fresh === undefined || fresh.concluded_by !== null || fresh.not_tested !== null) return null;
        const freshProgress = sheetProgress({ blocks, locations: rows.locations, equipment: rows.equipment, relatorio }, blockId);
        if (!freshProgress.complete) {
          firstMissing = freshProgress.firstIncompleteStep ?? 'placa';
          return null;
        }
        return [
          ...suggestedInstruments({ blocks, instruments }, blockId).map((suggestion) => testInstrumentOp(by, relatorioId, blockId, suggestion.testKey, suggestion.header)),
          concludedByOp(by, relatorioId, blockId, toIso(now())),
        ];
      })
      .then((batch) => {
        if (batch === null) {
          if (otherwise === 'next') goNext();
          else if (firstMissing !== null) {
            editor.announce(t.incomplete);
            goTo(firstMissing, true);
          }
          return;
        }
        showToast(t.concluded);
        goNext();
      })
      .catch(() => undefined);
  };

  const concludable = progress.complete && block.concluded_by === null && block.not_tested === null;
  const primaryLabel = concludable ? t.concluir : next.kind === 'ficha' ? t.proximaFicha : next.kind === 'coluna' ? t.proximaColuna : t.voltarRelatorio;
  // An open sheet's primary concludes on the fresh rows: right after the last value is typed
  // this render may still say "Próxima ficha" (the commit has not been drawn yet).
  const primary = block.concluded_by === null && block.not_tested === null ? () => conclude(concludable ? 'jump' : 'next') : goNext;

  // --- the header -----------------------------------------------------------------------
  const [renaming, setRenaming] = useState(false);
  const [notTestedDialogOpen, setNotTestedDialogOpen] = useState(false);
  const nameOf = (actorId: string | null) => (actorId === null ? null : (users.find((row) => row.id === actorId)?.name ?? (session.user?.id === actorId ? session.user.name : null)));
  const filledName = nameOf(block.last_modified_by);
  const filledBy = filledName === null || block.last_modified_at === null ? null : filledByText(filledName, block.last_modified_at);
  const concludedName = block.concluded_by === null ? null : nameOf(block.concluded_by.actor_id);
  const concludedBy = block.concluded_by === null || concludedName === null ? null : concludedByText(concludedName, block.concluded_by.at);
  const menu: OverflowMenuAction[] = [];
  if (block.concluded_by === null && block.not_tested === null) menu.push({ id: 'concluir', label: t.menuConcluir, onAction: () => conclude() });
  if (block.equipment_id !== null) menu.push({ id: 'rename-tag', label: t.menuRenameTag, onAction: () => setRenaming(true) });
  if (block.not_tested === null) menu.push({ id: 'nao-ensaiado', label: copy.sumario.tree.markNotTested, onAction: () => setNotTestedDialogOpen(true) });
  // E5-Q17 (EXPERIENCE › Conclusion control: "Limpar" via Delete/Backspace or the sheet
  // Overflow menu): clears the result and the restriction in one edit, undoable like any
  // other; the stored text stays, hidden while the result is empty.
  if (block.not_tested === null && (conclusionResultOf(block) !== null || conclusionRestrictionOf(block) !== null)) {
    menu.push({ id: 'limpar-conclusao', label: t.menuLimparConclusao, onAction: () => clearConclusion() });
  }

  const clearConclusion = () => {
    void api
      .edit((blocks, by) => {
        const fresh = blocks.find((row) => row.id === blockId && row.removed_at === null);
        if (fresh === undefined) return null;
        const ops: OpDraft[] = [];
        if (conclusionResultOf(fresh) !== null) ops.push(conclusionOp(by, relatorioId, blockId, 'result', null));
        if (conclusionRestrictionOf(fresh) !== null) ops.push(conclusionOp(by, relatorioId, blockId, 'restriction', null));
        return ops.length === 0 ? null : ops;
      })
      .then((batch) => api.undoable(t.conclusionCleared, batch))
      .catch(() => undefined);
  };

  const markNotTested = (reason: string, text: string | null) => {
    void api
      .edit((blocks, by) => {
        const fresh = blocks.find((row) => row.id === blockId && row.removed_at === null);
        if (fresh === undefined) return null;
        return [notTestedOp(by, relatorioId, blockId, { reason, text, at: toIso(now()) })];
      })
      .then((batch) => {
        // Same feedback as the tree's `markNotTested` on the same null-batch case (review
        // finding, 2026-09-24): the block was removed by another device meanwhile.
        showToast(batch === null ? copy.sumario.tree.gone : t.notTestedToast);
      })
      .catch(() => undefined);
  };

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
            shown={STEPPER_STEPS}
            menu={menu}
            notTested={block.not_tested !== null}
            onRename={block.equipment_id === null ? null : () => setRenaming(true)}
          />
          <SheetReadOnlyProvider value={block.not_tested !== null}>
            <div className="content">
              {block.not_tested === null ? null : <NotTestedBand api={api} block={block} snapshot={snapshot} />}
              <div id="ficha-step-placa" className={stepClass('placa')} data-step="placa" tabIndex={-1} onFocus={() => focusIn('placa')}>
                {cabine === null ? null : <CabineBlock api={api} snapshot={snapshot} cabine={cabine} first={cabineFirst} />}
                {enabled.has('nameplate') ? (
                  <NameplateSection api={api} snapshot={snapshot} block={block} definition={definition} equipment={equipment} registries={registries} />
                ) : null}
              </div>
              <div id="ficha-step-verificacoes" className={stepClass('verificacoes')} data-step="verificacoes" tabIndex={-1} onFocus={() => focusIn('verificacoes')}>
                <ChecklistSection
                  api={api}
                  snapshot={snapshot}
                  block={block}
                  definition={definition}
                  bulk={bulk}
                  photos={checklistPhotos}
                  sectionRef={(element) => {
                    checklistEl.current = element;
                  }}
                />
              </div>
              {enabled.has('observations') ? <QuickNotes api={api} snapshot={snapshot} cabine={cabine} observations={observations} /> : null}
              <EnsaiosSection
                api={api}
                snapshot={snapshot}
                block={block}
                definition={definition}
                instruments={instruments}
                className={stepClass('ensaios')}
                onFocus={() => focusIn('ensaios')}
                primaryId={PRIMARY_ID}
              />
              <ConclusaoSection api={api} block={block} definition={definition} tag={tag} className={stepClass('conclusao')} onFocus={() => focusIn('conclusao')} />
            </div>
          </SheetReadOnlyProvider>
          <StickyActionBar
            stepper={<SectionStepper progress={progress} current={current} onGo={(step) => goTo(step, false)} />}
            // J-15: with nothing left to mark the mirror goes (no disabled button in the bar);
            // the list head keeps its disabled action with the reason.
            secondary={showMirror ? <BulkActionBar bulk={bulk} compact /> : null}
            camera={sheetCamera.button}
            cameraNote={sheetCamera.note}
            primaryLabel={primaryLabel}
            onPrimary={primary}
            primaryId={PRIMARY_ID}
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

      {notTestedDialogOpen ? (
        <NotTestedDialog
          seedVersion={block.seed_version}
          onClose={() => setNotTestedDialogOpen(false)}
          onSubmit={(reason, text) => {
            setNotTestedDialogOpen(false);
            markNotTested(reason, text);
          }}
        />
      ) : null}
    </>
  );
}
