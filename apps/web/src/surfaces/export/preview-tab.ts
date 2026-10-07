import { copy } from '../../copy/pt-br.ts';

/*
 * Review 2026-10-06: the tab "Pré-visualizar" opens at once stayed `about:blank` for the
 * whole job (about twenty seconds locally), which read as a broken page. The tab is
 * same-origin until it is pointed at the PDF, so the press writes a waiting page into it:
 * the step in progress, an indeterminate bar (the job reports no percentage) and a line
 * saying the PDF opens in this tab. No script runs in it; the opener updates the step.
 * Colors and type come from the opener's own tokens, so dark mode follows the app.
 */

export type PreviewTabStep = 'sending' | 'generating';

/** The tokens the waiting page reads from the app, with the light values as fallbacks. */
const TOKENS: Readonly<Record<string, string>> = {
  '--surface-base': '#F7F8FA',
  '--ink-primary': '#15181D',
  '--ink-secondary': '#454B54',
  '--primary': '#1F4E79',
  '--border-hairline': '#C9CED6',
  '--font-ui': "Inter, Roboto, 'Segoe UI', system-ui, sans-serif",
};

function tokenDeclarations(): string {
  const computed = getComputedStyle(document.documentElement);
  return Object.entries(TOKENS)
    .map(([name, fallback]) => `${name}: ${computed.getPropertyValue(name).trim() || fallback};`)
    .join(' ');
}

const STYLE = (tokens: string) => `
:root { ${tokens} color-scheme: light dark; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--surface-base); color: var(--ink-primary); font: 400 16px/1.5 var(--font-ui); }
main { width: min(420px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 12px; }
h1 { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.3; }
p { margin: 0; color: var(--ink-secondary); }
.track { position: relative; display: block; height: 4px; width: 100%; background: var(--border-hairline); border-radius: 999px; overflow: hidden; }
.track > i { position: absolute; top: 0; bottom: 0; width: 40%; background: var(--primary); border-radius: 999px; animation: slide 1.4s ease-in-out infinite; }
@keyframes slide { from { left: -40%; } to { left: 100%; } }
@media (prefers-reduced-motion: reduce) { .track > i { animation: none; left: 0; width: 100%; opacity: .5; } }
`;

const STEP_ID = 'preview-step';
const COUNT_ID = 'preview-count';

function stepTexts(step: PreviewTabStep): { heading: string; count: string } {
  const t = copy.export.previewTab;
  return step === 'sending' ? { heading: t.sending, count: t.step1 } : { heading: t.generating, count: t.step2 };
}

/** Writes the waiting page into the freshly opened tab. A tab that cannot be written stays blank. */
export function writePreviewTab(tab: Window): void {
  try {
    const doc = tab.document;
    const t = copy.export.previewTab;
    doc.title = t.title;
    const style = doc.createElement('style');
    style.textContent = STYLE(tokenDeclarations());
    doc.head.append(style);
    const main = doc.createElement('main');
    const count = doc.createElement('p');
    count.id = COUNT_ID;
    const heading = doc.createElement('h1');
    heading.id = STEP_ID;
    heading.setAttribute('aria-live', 'polite');
    const track = doc.createElement('span');
    track.className = 'track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', t.title);
    track.append(doc.createElement('i'));
    const note = doc.createElement('p');
    note.textContent = t.note;
    main.append(count, heading, track, note);
    doc.body.replaceChildren(main);
    doc.documentElement.lang = 'pt-BR';
    setPreviewTabStep(tab, 'sending');
  } catch {
    // A tab of another origin or already closed: it stays as the browser opened it.
  }
}

/** Moves the waiting page to the step the press is on. */
export function setPreviewTabStep(tab: Window, step: PreviewTabStep): void {
  try {
    const texts = stepTexts(step);
    const heading = tab.document.getElementById(STEP_ID);
    const count = tab.document.getElementById(COUNT_ID);
    if (heading !== null) heading.textContent = texts.heading;
    if (count !== null) count.textContent = texts.count;
  } catch {
    // The tab went away or navigated; nothing to update.
  }
}
