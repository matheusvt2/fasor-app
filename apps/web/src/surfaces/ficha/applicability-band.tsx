import { APPLICABILITY_APPLIED, NA_REASON_LEAD, type TestApplicability } from '@app/domain';
import { useId, type ReactNode } from 'react';
import { Button, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { FichaApi } from './ficha-api.ts';
import { testApplicabilityOp } from './ficha-ops.ts';
import { useSheetReadOnly } from './sheet-read-only.tsx';

/*
 * Story 23.9 (seed v13, decision J; `60-ficha.html` #/ficha/SEC-C05, DESIGN.md › Not-applicable test):
 * a test the nameplate makes not applicable. The kernel decides (`testApplicability`) and composes
 * the reason; the sheet draws, in place of the test's instrument and table, the heading with the
 * "Não se aplica" pill and the neutral band with the reason and "Aplicar este ensaio". Applied by
 * hand, the test shows as any test under the applied band ("Aplicado por você. A placa diz …") with
 * "Seguir a placa". Each button writes the one override cell,
 * `sheet/{b}/test/{k}/applicability` (`'applied'`, or null to follow the plate), through the
 * relatório's edit queue with "Desfazer". Nothing here judges the plate.
 */

/** Writes the override of `testKey` ('applied', or null to follow the plate), with the mock's toast and "Desfazer". */
function useApplicabilityWrite(api: FichaApi, testKey: string): (value: typeof APPLICABILITY_APPLIED | null) => void {
  const t = copy.ficha.applicability;
  return (value) => {
    void api
      .edit((_blocks, by) => [testApplicabilityOp(by, api.relatorioId, api.blockId, testKey, value)])
      .then((batch) => {
        if (batch !== null) api.undoable(value === null ? t.followedToast : t.appliedToast, batch);
      })
      .catch(() => undefined);
  };
}

/**
 * A test NA by the plate: its heading with the pill, then the band with the kernel's reason and
 * "Aplicar este ensaio" (none on a read-only sheet). `headEnd` is what the test's own head draws
 * at its end (a switchable measurement test's switch), kept beside the pill.
 */
export function NotApplicableTest({ api, testKey, title, applicability, headEnd }: { api: FichaApi; testKey: string; title: string; applicability: TestApplicability; headEnd?: ReactNode }) {
  const t = copy.ficha.applicability;
  const headingId = useId();
  const readOnly = useSheetReadOnly();
  const write = useApplicabilityWrite(api, testKey);
  return (
    <section className={readOnly ? 'section v13 v13-na is-readonly' : 'section v13 v13-na'} aria-labelledby={headingId} data-test-key={testKey} data-applicability="na">
      <div className="section-head">
        <h2 id={headingId}>{title}</h2>
        <span className="v13-na-pill">{t.pill}</span>
        {headEnd}
      </div>
      <div className="v13-na-band" role="status">
        <span className="band-text">
          <b>{NA_REASON_LEAD}</b> {applicability.phrase}
          <span className="band-sub">{t.bandSub}</span>
        </span>
        {readOnly ? null : (
          <Button variant="secondary" onPress={() => write(APPLICABILITY_APPLIED)}>
            {t.apply}
          </Button>
        )}
      </div>
    </section>
  );
}

/** The band over a test applied by hand: "Aplicado por você. A placa diz …" and "Seguir a placa" (none on a read-only sheet). */
export function AppliedBand({ api, testKey, applicability }: { api: FichaApi; testKey: string; applicability: TestApplicability }) {
  const t = copy.ficha.applicability;
  const readOnly = useSheetReadOnly();
  const write = useApplicabilityWrite(api, testKey);
  return (
    <div className="v13-applied-band" role="status" data-applicability="applied">
      <span className="band-text">
        <b>{t.appliedLead}</b> {applicability.appliedText}
      </span>
      {readOnly ? null : <TextButton onPress={() => write(null)}>{t.followPlate}</TextButton>}
    </div>
  );
}

/** The section classes of a test applied by hand (the mock's `.v13-na.is-applied`, which shows the applied band and the body). */
export const APPLIED_SECTION_CLASS = 'v13 v13-na is-applied';
