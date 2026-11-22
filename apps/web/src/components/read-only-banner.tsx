import { permissionRefusalText, READ_ONLY_LEAD_TEXT } from '@app/domain';

/**
 * Story 26.5 (`62-ficha-consulta.html` `.fc-banner`; EXPERIENCE.md § State Patterns, "A relatório
 * the role cannot fill"): the info Banner a screen draws once, under its header, when the role
 * does not hold `relatorio.fill`, instead of a line beside every control. The words are the
 * kernel's. e26r (2026-11-22): `reason` is the kernel's other reason, an Emitido relatório for a
 * role that does not issue (`useFillAccess().reason`); absent, the `relatorio.fill` one.
 */
export function ReadOnlyBanner({ reason = permissionRefusalText('relatorio.fill') }: { reason?: string } = {}) {
  return (
    <div className="banner fc-banner" data-variant="info" role="status">
      <span className="banner-text">
        <strong>{READ_ONLY_LEAD_TEXT}</strong> {reason}
      </span>
    </div>
  );
}
