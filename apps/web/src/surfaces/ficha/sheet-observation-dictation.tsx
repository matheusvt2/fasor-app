import { parseTableUtterance, type EvaluatedTable, type TableDictation } from '@app/domain';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ui } from '../../copy/ui.ts';
import { useProseDictation } from '../../speech/dictation.tsx';

/*
 * Story 9.4: the sheet observation's dictated text, held for the whole sheet. Two things
 * offer it: the "Observações" section head's Dictation button, and a Measurement table whose
 * utterance the kernel could not read as a reading (the speech then becomes a suggestion for
 * the observation, never a cell). The "Observações" section draws it under its field with
 * "Usar". It lives with the sheet: leaving the sheet discards it; nothing is ever written
 * before "Usar".
 */

export interface SheetObservationDictation {
  /** The dictated text as the field shows it, or null. */
  pending: string | null;
  /** Takes a raw transcript; replaces any text still pending. */
  offer: (transcript: string) => void;
  discard: () => void;
  /** Whether the sheet shows its "Observações" (the sub-block is on). */
  enabled: boolean;
}

const SheetObservationDictationContext = createContext<SheetObservationDictation | null>(null);

export function SheetObservationDictationProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { pending, offer, discard } = useProseDictation();
  const value = useMemo(() => ({ pending, offer, discard, enabled }), [pending, offer, discard, enabled]);
  return <SheetObservationDictationContext.Provider value={value}>{children}</SheetObservationDictationContext.Provider>;
}

/** The sheet's observation dictation; a section rendered alone (a unit test) holds its own. */
export function useSheetObservationDictation(): SheetObservationDictation {
  const shared = useContext(SheetObservationDictationContext);
  const own = useProseDictation();
  return shared ?? { ...own, enabled: true };
}

export type DictatedReading = Extract<TableDictation, { kind: 'cell' }>;

/**
 * One Measurement table's dictation: the kernel reads the utterance (`parseTableUtterance`);
 * a reading waits on its cell until "Confirmar"; speech it cannot read becomes the sheet
 * observation's suggestion and is announced, or, with "Observações" off, is only announced.
 */
export function useTableDictation(
  table: EvaluatedTable,
  announce: (text: string) => void,
): { dictated: DictatedReading | null; setDictated: (reading: DictatedReading | null) => void; onDictated: (transcript: string) => void } {
  const [dictated, setDictated] = useState<DictatedReading | null>(null);
  const observation = useSheetObservationDictation();
  const onDictated = (transcript: string) => {
    const parsed = parseTableUtterance(transcript, table);
    if (parsed.kind === 'cell') {
      setDictated(parsed);
      return;
    }
    setDictated(null);
    if (observation.enabled) {
      observation.offer(parsed.text);
      announce(ui.dictation.unparsed);
    } else {
      announce(ui.dictation.unparsedNoObservations);
    }
  };
  return { dictated, setDictated, onDictated };
}
