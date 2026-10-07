import { CalendarDate, parseDate } from '@internationalized/date';
import { useId, type ReactNode } from 'react';
import { DateField as AriaDateField, DateInput, DateSegment, Label } from 'react-aria-components';
import { ui } from '../copy/ui.ts';
import { Chip } from './chip.tsx';

export interface DateFieldProps {
  label: string;
  /** ISO `YYYY-MM-DD`, or null when empty. */
  value: string | null;
  onChange: (value: string | null) => void;
  isInvalid?: boolean;
  /** Ids of elements that describe the field (a helper, a reason). */
  describedBy?: string;
  autoFocus?: boolean;
  /** Focus left the field: a caller debouncing its commit (`useFieldCommit`) settles it now. */
  onBlur?: () => void;
  /** Story 11.9: extra classes on the `.field` (the Suggestion field `suggestion-field poa-prazo-sf`). */
  className?: string;
  /** Story 11.9: the Suggestion field's `data-state` on the `.field`. */
  state?: 'suggested' | 'confirmed';
  /** Story 11.9: siblings after the `.input` (the "Sugerido" pill, a helper). */
  after?: ReactNode;
  /**
   * Story 13.4 (INP-3): today's date (`YYYY-MM-DD`, America/Sao_Paulo). While the field is
   * empty a "Hoje" chip under the `.input` fills it and settles it like a typed date.
   */
  today?: () => string;
}

function toCalendarDate(value: string | null): CalendarDate | null {
  if (value === null || value === '') return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/**
 * The mock's date field (`30-project.html` "Início da parada"): a `.field` › `.input` box
 * holding React Aria's segmented `DateInput` (day, month, year in pt-BR order, arrow keys
 * and typed digits) and the `#i-calendar` sprite glyph. ISO strings in and out; the app
 * root's `I18nProvider locale="pt-BR"` orders the segments.
 */
export function DateField({ label, value, onChange, isInvalid, describedBy, autoFocus, onBlur, className, state, after, today }: DateFieldProps) {
  const labelId = useId();
  const showToday = today !== undefined && toCalendarDate(value) === null;
  return (
    <AriaDateField
      className={className === undefined ? 'field' : `field ${className}`}
      data-state={state}
      value={toCalendarDate(value)}
      onChange={(next) => onChange(next === null ? null : next.toString())}
      isInvalid={isInvalid}
      aria-describedby={describedBy}
      autoFocus={autoFocus}
      onBlur={onBlur}
      granularity="day"
    >
      <Label className="field-label" id={labelId}>
        {label}
      </Label>
      <DateInput className="input date-input">
        {(segment) => <DateSegment segment={segment} className="date-segment" />}
      </DateInput>
      <svg className="ico date-ico" aria-hidden="true">
        <use href="/sprite.svg#i-calendar" />
      </svg>
      {showToday ? (
        <div className="chip-row">
          <Chip
            onPress={() => {
              onChange(today());
              onBlur?.();
            }}
          >
            {ui.dateField.today}
          </Chip>
        </div>
      ) : null}
      {after}
    </AriaDateField>
  );
}
