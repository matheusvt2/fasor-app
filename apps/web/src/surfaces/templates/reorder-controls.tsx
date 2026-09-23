import { parsePositionInput } from '@app/domain';
import { useState } from 'react';
import { ui } from '../../copy/ui.ts';
import type { Reorder } from './use-reorder.ts';

/** The Block card's `.drag-handle` (the six dots), named "Reordenar ⟨nome⟩". */
export function DragHandle({ name, reorder }: { name: string; reorder: Reorder }) {
  return (
    <button type="button" className="drag-handle" aria-label={ui.reorder.handle(name)} {...reorder.handleProps}>
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

export interface PositionBoxProps {
  name: string;
  position: number;
  siblings: number;
  reorder: Reorder;
}

/**
 * `.pos-box` (EXPERIENCE.md › Block card): the row's position among its siblings; a number
 * typed and committed on blur or Enter moves the row there, clamped to the ends. Anything
 * else puts the position back with no op (`parsePositionInput`).
 */
export function PositionBox({ name, position, siblings, reorder }: PositionBoxProps) {
  const [text, setText] = useState<string | null>(null);

  function commit(keepFocus: boolean, input: HTMLInputElement) {
    if (text === null) return;
    const to = parsePositionInput(text, siblings);
    setText(null);
    if (to === null || to === position - 1) return;
    void reorder.moveTo(to, keepFocus ? () => input : undefined);
  }

  return (
    <input
      className="pos-box"
      inputMode="numeric"
      aria-label={ui.reorder.position(name)}
      value={text ?? String(position)}
      onFocus={(event) => {
        setText(String(position));
        const input = event.currentTarget;
        requestAnimationFrame(() => input.select());
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={(event) => commit(false, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(true, event.currentTarget);
        }
      }}
    />
  );
}
