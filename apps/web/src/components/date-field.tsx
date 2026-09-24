import { CalendarDate, parseDate } from '@internationalized/date';
import { useId } from 'react';
import { DateField as AriaDateField, DateInput, DateSegment, Label } from 'react-aria-components';

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
export function DateField({ label, value, onChange, isInvalid, describedBy, autoFocus, onBlur }: DateFieldProps) {
  const labelId = useId();
  return (
    <AriaDateField
      className="field"
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
    </AriaDateField>
  );
}
