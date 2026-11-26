import { parseTableUtterance, type EvaluatedTable, type TableDictation } from '@app/domain';
import { useState } from 'react';
import { ui } from '../../copy/ui.ts';

/*
 * Story 9.4: a Measurement table's spoken reading, held on its cell until "Confirmar". Story 31.3
 * (batch e31b): the browser speech engine and the table's button are gone, and so is the sheet
 * observation's pending dictated text (an audio's text now lands in the field through the
 * server's put). The table's audio and its review are Story 31.5's (batch e31c); until then this
 * hook stays as it was so `DictatedMeasurementField` keeps compiling, with nothing calling
 * `onDictated`.
 */

export type DictatedReading = Extract<TableDictation, { kind: 'cell' }>;

/**
 * One Measurement table's dictation: the kernel reads the utterance (`parseTableUtterance`);
 * a reading waits on its cell until "Confirmar"; speech it cannot read is announced.
 * E9-Q9: a reading whose cell is filled some other way ("Confirmar todos", a pull, a typed
 * value) is dropped then, so it never comes back if the cell is emptied later.
 */
export function useTableDictation(
  table: EvaluatedTable,
  announce: (text: string) => void,
): { dictated: DictatedReading | null; setDictated: (reading: DictatedReading | null) => void; onDictated: (transcript: string) => void } {
  const [held, setDictated] = useState<DictatedReading | null>(null);
  const waits =
    held !== null &&
    table.rows.some((row) => row.cells.some((cell) => cell.state === 'empty' && cell.address.testKey === held.address.testKey && cell.address.row === held.address.row && cell.address.col === held.address.col));
  // Dropped in the render that sees its cell filled (React's "adjust state while rendering").
  if (held !== null && !waits) setDictated(null);
  const dictated = waits ? held : null;
  const onDictated = (transcript: string) => {
    const parsed = parseTableUtterance(transcript, table);
    if (parsed.kind === 'cell') {
      setDictated(parsed);
      return;
    }
    setDictated(null);
    announce(ui.tableReading.unparsed);
  };
  return { dictated, setDictated, onDictated };
}
