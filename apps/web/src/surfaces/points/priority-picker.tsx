import { POINT_PRIORITIES, priorityAccessibleName, priorityHint, priorityLabel, priorityTone, type PointPriority } from '@app/domain';
import { useRef, useState, type KeyboardEvent } from 'react';

/*
 * Story 11.9 (`72-pontos.html` 233-240, EXPERIENCE.md › Priority picker, UX-DR55): the
 * Priority picker, a `radiogroup` of five `.option-row` radios with the pill (text first,
 * `data-p` tone second) and the suggested-deadline hint at the right. No default: with no
 * priority none is checked. Roving focus: one row is in the tab order (the checked one,
 * else the first), the arrow keys move the focus, and a tap, Space or Enter selects the
 * row and writes (`onPick`). Delete or Backspace on a row clears the priority (`onClear`).
 * Labels, hints and accessible names are the kernel's.
 */

export interface PriorityPickerProps {
  labelId: string;
  describedBy?: string;
  value: PointPriority | null;
  onPick: (priority: PointPriority) => void;
  onClear: () => void;
}

export function PriorityPicker({ labelId, describedBy, value, onPick, onClear }: PriorityPickerProps) {
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  /** The row the Tab key lands on: the last focused one, else the checked one, else the first. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const checkedIndex = value === null ? -1 : POINT_PRIORITIES.indexOf(value);
  const tabIndexOf = focusIndex ?? (checkedIndex === -1 ? 0 : checkedIndex);

  const move = (to: number) => {
    const index = (to + POINT_PRIORITIES.length) % POINT_PRIORITIES.length;
    setFocusIndex(index);
    rows.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        move(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(POINT_PRIORITIES.length - 1);
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        if (value !== null) onClear();
        break;
      default:
    }
  };

  return (
    <div className="priority-picker" role="radiogroup" aria-labelledby={labelId} aria-describedby={describedBy}>
      {POINT_PRIORITIES.map((priority, index) => {
        const checked = priority === value;
        return (
          <button
            key={priority}
            ref={(element) => {
              rows.current[index] = element;
            }}
            type="button"
            className={checked ? 'option-row is-selected' : 'option-row'}
            role="radio"
            aria-checked={checked}
            aria-label={priorityAccessibleName(priority)}
            tabIndex={index === tabIndexOf ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onPick(priority)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={checked ? 'radio is-on' : 'radio'} aria-hidden="true" />
            <span className="pr-text">
              <span className="priority-pill" data-p={priorityTone(priority)}>
                {priorityLabel(priority)}
              </span>
            </span>
            <span className="pr-hint">{priorityHint(priority)}</span>
          </button>
        );
      })}
    </div>
  );
}
