/*
 * Review fixes 2026-10-08 (batch r8lay): the word-split check of `review-layout-copy-3.spec.ts`
 * (`railRows`, F-07) as a shared helper. Runs in the page: for every drawn element given, the
 * words of its text (runs of non-space characters) whose glyphs the browser drew on more than one
 * line. A visually hidden text (`.visually-hidden`, a 1 px clipped box that wraps every letter)
 * is not drawn text and is skipped. Self-contained, so `locator.evaluateAll(splitWordsIn)` can
 * serialize it.
 */
export function splitWordsIn(elements: Element[]): { text: string; split: string[] }[] {
  const out: { text: string; split: string[] }[] = [];
  for (const element of elements) {
    if (element.getClientRects().length === 0) continue;
    const split: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || parent.closest('.visually-hidden') !== null || parent.getClientRects().length === 0) continue;
      for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
        const word = document.createRange();
        word.setStart(node, match.index);
        word.setEnd(node, match.index + match[0].length);
        const lines = new Set([...word.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
        if (lines.size > 1) split.push(match[0]);
      }
    }
    out.push({ text: (element.textContent ?? '').trim(), split });
  }
  return out;
}
