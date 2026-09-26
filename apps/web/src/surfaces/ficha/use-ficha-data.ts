import {
  blockTypeLabel,
  cabineOf,
  enabledSubBlocksOf,
  isCabineFirstSheet,
  isEquipmentBlockType,
  nextSheet,
  sheetProgress,
  type BlockRow,
  type EntityState,
  type InstrumentRow,
  type OpDraft,
  type RelatorioSnapshot,
  type UserRow,
  type WordRow,
} from '@app/domain';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { instrumentRows, manufacturerRows, voltageClassRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { writeLastSheet } from '../../db/prefs.ts';
import { localUsers } from '../../db/sync-store.ts';
import { usePageTitle } from '../../state/page-title.tsx';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { useProjectEquipment, useRelatorioEditor, type Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { useSavedStatus } from './use-ficha-actions.ts';

const NO_USERS: UserRow[] = [];
const NO_WORDS: WordRow[] = [];
const NO_INSTRUMENTS: InstrumentRow[] = [];

/** What one equipment sheet reads: its rows, the device registries, the edit queue, and what the kernel derives from them. */
export function useFichaData({ relatorioId, snapshot, state, block }: { relatorioId: string; snapshot: RelatorioSnapshot; state: EntityState; block: BlockRow }) {
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

  return { session, db, navigate, showToast, projectId, equipment, users, instruments, registries, editor, savedText, saved, own, tag, typeName, progress, next, cabine, cabineFirst, enabled, api };
}
