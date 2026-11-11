import { ncRowPointsText, type RelatorioSnapshot, type SheetPointFinding } from '@app/domain';
import { useRef } from 'react';
import { CreatePointAction } from '../points/create-point-action.tsx';
import { useSheetReadOnly } from './sheet-read-only.tsx';

/*
 * Batch e24p (Story 24.17, every seed; `60-ficha.html` `.e24-point-place`, `#ficha-dj01-rc-point`,
 * `#ficha-tr02-conc-point`): the place of "Criar ponto de atenção" under a test that fails or has a
 * restricted reading, and on the Conclusão step of a ficha the technician reproved. The kernel says
 * which findings exist and where (`sheetPointFindings`): with no live point written from the finding
 * the place offers the action, which opens the point editor with the kernel's text and action (nothing
 * is stored until the editor closes); with one, it names the point ("Ponto de atenção N", the NC row's
 * mark) and offers no second one. A read-only sheet offers nothing.
 */

export function PointPlace({
  relatorioId,
  snapshot,
  equipmentId,
  finding,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  equipmentId: string | null;
  finding: SheetPointFinding;
}) {
  const readOnly = useSheetReadOnly();
  const mark = useRef<HTMLSpanElement | null>(null);
  if (readOnly) return null;
  const named = ncRowPointsText(finding.positions);
  return (
    <div className={named === null ? 'row-wrap e24-point-place' : 'row-wrap e24-point-place has-point'} data-point-place={finding.testKey ?? 'conclusao'}>
      {/* Fix batch e24x (D1): always mounted, so the editor its tap opened stays open when its own autosave
          stores the point (the place then names it); only the button goes. */}
      <CreatePointAction
        relatorioId={relatorioId}
        snapshot={snapshot}
        seed={() => ({
          text: finding.text,
          equipmentId,
          origin: finding.origin,
          testKey: finding.testKey,
          action: finding.action,
          actionHelper: finding.actionHelper,
        })}
        // The save takes the button away: the focus goes to the point's name in its place.
        focusAfterSave={() => mark.current}
        hideButton={named !== null}
      />
      {named === null ? null : (
        <span className="nc-point-ref" ref={mark} tabIndex={-1}>
          {named}
        </span>
      )}
    </div>
  );
}

/** The places of one spot of the sheet (a test, or the Conclusão step), in the kernel's order. */
export function pointPlaces(
  findings: readonly SheetPointFinding[],
  where: { testKey: string } | 'conclusao',
  props: { relatorioId: string; snapshot: RelatorioSnapshot; equipmentId: string | null },
) {
  const shown = findings.filter((finding) => (where === 'conclusao' ? finding.place === 'conclusao' : finding.place === 'test' && finding.testKey === where.testKey));
  if (shown.length === 0) return null;
  return shown.map((finding) => <PointPlace key={`${finding.origin}:${finding.testKey ?? ''}`} {...props} finding={finding} />);
}
