import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useToast } from '../../state/toast.tsx';

export interface GenerateActionProps {
  /** The id of the foot's `.btn-reason` (`generateReason`), which describes the button. */
  reasonId: string;
  /** True when a blocking Sumário row stops the generation. */
  blocked: boolean;
}

/**
 * The foot's primary "Gerar relatório" (`40-relatorio-overview.html`). The body of this
 * batch shows one toast: the generate job, the revisions and the Export dialog are Story
 * 4.8's, which replaces this file's press handler and keeps its shape.
 *
 * Gerar relatório wiring: stub, owner batch D (`deferred-work.md`).
 */
export function GenerateAction({ reasonId, blocked }: GenerateActionProps) {
  const { showToast } = useToast();
  return (
    <Button
      variant="primary"
      // One pointer at the reason either way: the shared-reason prop while blocked, a plain
      // description otherwise (Button joins the two, so naming both would repeat the id).
      aria-describedby={blocked ? undefined : reasonId}
      isDisabled={blocked}
      disabledReasonId={blocked ? reasonId : undefined}
      onPress={() => showToast(copy.sumario.generateStub)}
    >
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-doc" />
      </svg>
      {copy.sumario.generate}
    </Button>
  );
}
