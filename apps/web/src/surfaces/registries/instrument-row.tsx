import { instrumentDetailSeparator, instrumentLacksText, instrumentRegistryRowText, type CalibrationStatus, type InstrumentRow as InstrumentRowType, type InstrumentTwinLines } from '@app/domain';

export interface InstrumentRowProps {
  instrument: InstrumentRowType;
  status: CalibrationStatus;
  isOpen: boolean;
  onOpen: () => void;
  /** Story 25.13: the shared-certificate warning and the shared-model line (`instrumentTwinLines`). */
  twins?: InstrumentTwinLines | undefined;
}

/** One `.registry-row` of the Instrumentos list (`80-cadastros.html` L230-259). */
export function InstrumentRow({ instrument, status, isOpen, onOpen, twins }: InstrumentRowProps) {
  const text = instrumentRegistryRowText(instrument, status);
  // Story 25.12: what the instrument lacks, in the words of the rows before generating.
  const lacks = instrumentLacksText(instrument);
  const label = [`${text.code} ${text.primaryRest}`, text.validity?.text, lacks, twins?.certificate, twins?.model].filter(Boolean).join(', ');
  return (
    <li
      className="registry-row"
      tabIndex={0}
      role="button"
      aria-pressed={isOpen}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="rr-text">
        <span className="rr-primary">
          <strong>{text.code}</strong> {text.primaryRest}
        </span>
        <span className="rr-secondary">
          {text.secondaryLead}
          {instrumentDetailSeparator(text)}
          {text.validity === null ? null : text.validity.expired ? <span className="rr-expired">{text.validity.text}</span> : text.validity.text}
        </span>
        {lacks === null ? null : <span className="e25-rr-warn">{lacks}</span>}
        {twins === undefined || twins.certificate === null ? null : <span className="e25-rr-warn">{twins.certificate}</span>}
        {twins === undefined || twins.model === null ? null : <span className="e25-rr-light">{twins.model}</span>}
      </div>
      <svg className="ico rr-chevron" aria-hidden="true">
        <use href="/sprite.svg#i-chev-right" />
      </svg>
    </li>
  );
}
