import { audioFileRowSchema, audiosTranscritosText, audioTextInField, audioWrittenTarget, isTranscribedAudio, type AudioFileRow, type AudioTarget } from '@app/domain';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ui } from '../copy/ui.ts';
import { useLiveQuery } from '../db/live.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSession } from './session.tsx';
import { useSync } from './sync.tsx';
import { useToast } from './toast.tsx';

/*
 * Story 31.4 (AD-30; EXPERIENCE.md › Text from audio): while the app is open, the audios a sync
 * brings to `done` announce themselves once, at the end of the cycle: "N áudios transcritos" with
 * "Ver", which opens the first one's field (its surface, then the field focused). The text is
 * already in the field (the server's put); the toast only says where. The rule of
 * `reading-arrivals.tsx`: the audios this device held `done` when it first looked, and the ones a
 * device that never finished a sync pulls in its first cycle, never toast.
 */

/** The device's transcribed audio rows (every relatório). */
async function doneAudios(db: AppDatabase): Promise<AudioFileRow[]> {
  const records = await db.entities.where('entity').equals('file').toArray();
  const rows: AudioFileRow[] = [];
  for (const record of records) {
    if ((record.row as { kind?: unknown }).kind !== 'audio') continue;
    const parsed = audioFileRowSchema.safeParse(record.row);
    // e31f: which rows count as transcribed is the kernel's rule.
    if (parsed.success && isTranscribedAudio(parsed.data)) rows.push(parsed.data);
  }
  return rows;
}

export interface AudioArrivalState {
  seen: ReadonlySet<string>;
  waiting: ReadonlySet<string>;
}

/**
 * One observation of the transcribed audios: a row never seen is baseline on the first look or
 * before the device's first finished sync, else it waits; once no cycle runs the waiting rows are
 * the arrivals.
 */
export function audioArrivalStep(
  state: AudioArrivalState | null,
  rows: readonly AudioFileRow[],
  sync: { running: boolean; synced: boolean },
): { state: AudioArrivalState; arrived: AudioFileRow[] } {
  const seen = new Set(state?.seen ?? []);
  const waiting = new Set(state?.waiting ?? []);
  const baseline = state === null || !sync.synced;
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!baseline) waiting.add(row.id);
  }
  if (sync.running || waiting.size === 0) return { state: { seen, waiting }, arrived: [] };
  return { state: { seen, waiting: new Set() }, arrived: rows.filter((row) => waiting.has(row.id)).sort((a, b) => (a.id < b.id ? -1 : 1)) };
}

/** The surface a target's field is on. */
export function audioTargetRoute(relatorioId: string, target: AudioTarget): string {
  switch (target.type) {
    case 'item':
    case 'sheet_field':
    case 'test_value':
    case 'table':
      return `/relatorio/${relatorioId}/ficha/${target.block_id}`;
    case 'section':
      return `/relatorio/${relatorioId}/secao/${target.block_id}`;
    case 'photo_caption':
      return `/relatorio/${relatorioId}/fotos`;
    case 'point':
      return `/relatorio/${relatorioId}/pontos`;
    case 'setup':
      return `/relatorio/${relatorioId}/setup`;
  }
}

const FIELD = 'textarea, input, [role="textbox"], [contenteditable="true"]';

/** Focuses the field of an audio's mark once it is drawn (its surface may still be loading); false when it never shows. */
export function focusAudioField(audioId: string, attempts = 40): void {
  const mark = document.querySelector<HTMLElement>(`[data-audio-id="${audioId}"]`);
  if (mark === null) {
    if (attempts > 0) window.setTimeout(() => focusAudioField(audioId, attempts - 1), 150);
    return;
  }
  // Story 31.10: the mark sits in the field bar's tray, the input's sibling, so the field is found beside the tray.
  const around = mark.closest('.field-tray')?.parentElement ?? mark.parentElement;
  const field = around?.querySelector<HTMLElement>(FIELD) ?? mark.querySelector<HTMLElement>('button');
  mark.scrollIntoView({ block: 'center' });
  field?.focus({ preventScroll: true });
}

/** Mounted once in the shell (router and toast available); renders nothing. */
export function AudioArrivals() {
  const db = useSession().database;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const observed = useLiveQuery(async () => (db === null ? null : { db, rows: await doneAudios(db) }), [db], null);
  const { running, lastSyncAt } = useSync();
  const syncedAtStart = useRef(false);
  const hadSynced = lastSyncAt !== null;
  useEffect(() => {
    if (running) syncedAtStart.current = hadSynced;
  }, [running]);
  const memory = useRef<{ db: AppDatabase; state: AudioArrivalState } | null>(null);

  const open = useCallback(
    (row: AudioFileRow) => {
      if (row.relatorio_id === null) return;
      // Story 31.5: a table's speech that was no reading opens the OBSERVAÇÕES it went to.
      void navigate(audioTargetRoute(row.relatorio_id, audioWrittenTarget(row)));
      focusAudioField(row.id);
    },
    [navigate],
  );

  useEffect(() => {
    if (db === null || observed === null || observed.db !== db) return;
    const synced = running ? syncedAtStart.current : hadSynced;
    const step = audioArrivalStep(memory.current?.db === db ? memory.current.state : null, observed.rows, { running, synced });
    memory.current = { db, state: step.state };
    // A table's spoken reading is suggested on its cell (Story 31.5), never written into a field: it is not this toast's
    // (`audioTextInField`, the kernel's rule); its speech that was no reading went to OBSERVAÇÕES and is.
    const arrived = step.arrived.filter((row) => audioTextInField(row));
    if (arrived.length === 0) return;
    const first = arrived[0]!;
    showToast(audiosTranscritosText(arrived.length), { action: { label: ui.audio.open, onPress: () => open(first) }, arrival: true });
  }, [db, observed, running, hadSynced, open, showToast]);

  return null;
}
