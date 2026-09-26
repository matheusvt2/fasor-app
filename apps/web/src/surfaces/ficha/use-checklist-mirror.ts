import type { BlockDefinition, BlockRow } from '@app/domain';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { ChecklistBulk } from './checklist-section.tsx';
import { useOnScreen } from './use-on-screen.ts';

/** The checklist on screen: whether the Sticky action bar mirrors its bulk action. */
export function useChecklistMirror(block: BlockRow, definition: BlockDefinition, bulk: ChecklistBulk): { checklistEl: RefObject<HTMLElement | null>; showMirror: boolean } {
  // --- the checklist on screen: the Sticky action bar mirrors its bulk action --------------
  const checklistEl = useRef<HTMLElement | null>(null);
  const checklistOnScreen = useOnScreen(checklistEl, block.id);
  // J-15: the mirror only while something is left to mark. When it leaves holding the focus
  // (its own keyboard press marked the last items), the focus goes to the list head's action,
  // still there with its reason, never to the page body.
  const showMirror = checklistOnScreen && definition.checklist !== null && block.not_tested === null && bulk.unset > 0;
  const mirrorFocused = useRef(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      mirrorFocused.current = event.target instanceof Element && event.target.closest('.sticky-action-bar .bulk-action-bar') !== null;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  useLayoutEffect(() => {
    if (showMirror || !mirrorFocused.current) return;
    mirrorFocused.current = false;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    document.querySelector<HTMLElement>('#ficha-step-verificacoes .bulk-action-bar button')?.focus({ preventScroll: true });
  }, [showMirror]);
  return { checklistEl, showMirror };
}
