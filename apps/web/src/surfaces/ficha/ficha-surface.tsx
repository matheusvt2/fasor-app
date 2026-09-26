import { buildSnapshot, getDefinition, isEquipmentBlock, locationPathText, shownSheetSteps, type BlockDefinition, type BlockRow, type EntityState, type RelatorioSnapshot } from '@app/domain';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { useHeldWhilePressed } from '../../input/press-hold.ts';
import { RelatorioGate } from '../relatorio/relatorio-gate.tsx';
import '../relatorio/relatorio.css';
import { CabineBlock, QuickNotes } from './cabine-block.tsx';
import { BulkActionBar, ChecklistSection, useChecklistBulk } from './checklist-section.tsx';
import { ConclusaoSection } from './conclusao-section.tsx';
import { EnsaiosSection } from './ensaios-section.tsx';
import { FichaDialogs } from './ficha-dialogs.tsx';
import { FichaHeader } from './ficha-header.tsx';
import { FichaRail, type RailState } from './ficha-rail.tsx';
import { NameplateSection } from './nameplate-section.tsx';
import { NotTestedBand } from './not-tested-band.tsx';
import { AddPhotosButton } from './photo-openers.tsx';
import { DropHint } from '../photos/capture-sheet.tsx';
import { SectionStepper } from './section-stepper.tsx';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';
import { StickyActionBar } from './sticky-action-bar.tsx';
import { useChecklistMirror } from './use-checklist-mirror.ts';
import { useFichaActions } from './use-ficha-actions.ts';
import { useFichaData } from './use-ficha-data.ts';
import { useFichaPhotos } from './use-ficha-photos.ts';
import { useFichaSteps } from './use-ficha-steps.ts';
import './ficha.css';

/** The Sticky action bar's primary: where the readings' continuous Enter run ends. */
const PRIMARY_ID = 'ficha-primary';

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
  const blockId = block.id;
  const { session, db, navigate, showToast, projectId, equipment, users, instruments, registries, editor, savedText, saved, own, tag, typeName, progress, next, cabine, cabineFirst, enabled, api } =
    useFichaData({ relatorioId, snapshot, state, block });
  // E12-A7: only the steps whose sub-block is on; the header sentence names only these.
  const shownSteps = useMemo(() => shownSheetSteps(block, { cabineFirst }), [block, cabineFirst]);
  const bulk = useChecklistBulk(api, snapshot, block, equipment);
  const { current, focusIn, stepClass, goTo } = useFichaSteps(progress, shownSteps);
  const photos = useFichaPhotos({ relatorioId, snapshot, block, current, db, api, showToast });
  const { photoTarget, sheetCamera, checklistPhotos, setImportTarget, fichaMain, dragging } = photos;
  const { checklistEl, showMirror } = useChecklistMirror(block, definition, bulk);
  const actions = useFichaActions({
    relatorioId,
    snapshot,
    block,
    progress,
    next,
    instruments,
    users,
    sessionUser: session.user,
    api,
    editor,
    goTo,
    navigate,
    showToast,
    saved,
  });
  const { primaryLabel, primary, menu, filledBy, concludedBy, setRenaming } = actions;
  const [rail, setRail] = useState<RailState>('auto');
  const observations = typeof block.sheet.observations?.value === 'string' ? block.sheet.observations.value : null;

  return (
    <>
      <div className="screen-body ficha-body" data-rail={rail}>
        <FichaRail relatorioId={relatorioId} projectId={projectId} snapshot={snapshot} equipment={equipment} blockId={blockId} editor={editor} onRail={setRail} />

        <div className="ficha-main" ref={fichaMain} data-dropping={dragging ? '' : undefined}>
          <FichaHeader
            typeName={typeName}
            tag={tag}
            locationText={locationPathText(snapshot.locations, block.location_id)}
            filledBy={filledBy}
            concludedBy={concludedBy}
            progress={progress}
            shown={shownSteps}
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
          <DropHint dragging={dragging} />
          <StickyActionBar
            stepper={<SectionStepper steps={shownSteps} progress={progress} current={current} onGo={(step) => goTo(step, false)} />}
            // J-15: with nothing left to mark the mirror goes (no disabled button in the bar);
            // the list head keeps its disabled action with the reason.
            secondary={showMirror ? <BulkActionBar bulk={bulk} compact /> : null}
            camera={sheetCamera.button}
            importButton={<AddPhotosButton onPress={() => setImportTarget(photoTarget(null))} />}
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

      <FichaDialogs relatorioId={relatorioId} snapshot={snapshot} block={block} equipment={equipment} own={own} tag={tag} photos={photos} actions={actions} />
    </>
  );
}
