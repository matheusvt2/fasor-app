import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test-axe.ts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Button, TextButton } from './button.tsx';
import { StatusPill } from './status-pill.tsx';
import { OverflowMenu } from './overflow-menu.tsx';
import { ConfirmDialog } from './confirm-dialog.tsx';
import { Chip, FilterChipGroup } from './chip.tsx';
import { Toggle, LockedToggle } from './toggle.tsx';
import { Checkbox } from './checkbox.tsx';
import { SegmentedControl } from './segmented-control.tsx';
import { Tabs } from './tabs.tsx';
import { Combobox } from './combobox.tsx';
import { PhotoRow } from './photo-row.tsx';

/**
 * jsdom does not resolve `var()` in computed styles (verified against jsdom 30: a
 * `background: var(--x)` rule never reaches `getComputedStyle(...).backgroundColor`, even
 * one level deep), so this gallery cannot render the CSS and read the resulting box colors
 * the way a real browser would. It reads the underlying custom properties themselves
 * instead — `getComputedStyle` DOES resolve which value a plain `--token` cascades to for a
 * given `[data-theme]`, which is exactly what the I/O matrix names ("resolves the dark hex
 * chain, e.g. `--fora-do-limite`/`--fora-do-limite-fill` dark values"). `tokens.css` and
 * `components.css` are injected verbatim (read from disk, not retyped) so this exercises
 * the real shipped cascade, not a hand copy.
 */
const stylesDir = resolve(__dirname, '../styles');
let styleEl: HTMLStyleElement;

beforeAll(() => {
  const tokens = readFileSync(resolve(stylesDir, 'tokens.css'), 'utf8');
  const components = readFileSync(resolve(stylesDir, 'components.css'), 'utf8');
  styleEl = document.createElement('style');
  styleEl.textContent = `${tokens}\n${components}`;
  document.head.appendChild(styleEl);
});

afterAll(() => {
  styleEl.remove();
  document.documentElement.removeAttribute('data-theme');
});

function setTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
}

function rootToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// --- WCAG 2.2 contrast: relative luminance / contrast ratio over sRGB hex colors ---
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

const THEME_OPTIONS = [
  { value: 'system', label: 'Sistema' },
  { value: 'dark', label: 'Escuro' },
] as const;

const TAB_ITEMS = [
  { id: 'empresa', label: 'Empresa', panel: <p>Dados da empresa</p> },
  { id: 'clientes', label: 'Clientes', panel: <p>Lista de clientes</p> },
];

/** One instance of every shared component this story built, in one tree. */
function Gallery() {
  return (
    <div className="frame">
      <div className="stack">
        <Button>Continuar</Button>
        <Button variant="destructive">Remover</Button>
        <Button isDisabled disabledReason="Entrar precisa de conexão">
          Entrar
        </Button>
        <TextButton tone="red">Remover ficha</TextButton>

        <StatusPill status="em_campo" />

        <OverflowMenu
          name="SEC-C09"
          items={[{ id: 'up', label: 'Subir', onAction: () => {} }]}
          destructiveItems={[{ id: 'remove', label: 'Remover', onAction: () => {} }]}
        />

        <div data-testid="confirm-dialog-host">
          <ConfirmDialog
            trigger={<Button variant="destructive">Remover ficha</Button>}
            title="Remover ficha SEC-C09 e seus dados?"
            description="Dá para desfazer em seguida."
            confirmLabel="Remover ficha"
            isDestructive
            onConfirm={() => {}}
          />
        </div>

        <div className="chip-row">
          <Chip onPress={() => {}}>Sinais de aquecimento</Chip>
          <Chip isSelected onSelectedChange={() => {}}>
            <span className="t-value">3.700</span>
            <span className="t-label"> MΩ</span>
          </Chip>
        </div>
        <FilterChipGroup
          options={[
            { id: 'all', label: 'Todas' },
            { id: 'enel', label: 'Cubículo Enel' },
          ]}
          selectedId="all"
          onChange={() => {}}
          aria-label="Filtrar por cabine"
        />

        <Toggle isSelected aria-label="Localização nas fotos" />
        <LockedToggle aria-label="Lista de verificação" />

        <Checkbox isSelected onChange={() => {}}>
          Megôhmetro digital DMG10Ki
        </Checkbox>

        <SegmentedControl value="system" onChange={() => {}} options={THEME_OPTIONS} aria-label="Tema" />

        <Tabs items={TAB_ITEMS} selectedId="empresa" onSelectionChange={() => {}} aria-label="Cadastros" />

        <Combobox
          label="Fabricante"
          options={[
            { id: 'schneider', label: 'Schneider' },
            { id: 'instrum', label: 'Instrum' },
          ]}
        />

        <div className="photo-list">
          <PhotoRow label="Foto 1" caption="Detalhe da verificação de contatos realizada na chave seccionadora do Cubículo Enel" thumb={null} state="pending" />
          <PhotoRow label="Foto 2" caption="Detalhe da chave seccionadora do Cubículo Enel" thumb={null} state="error" onRetry={() => {}} />
          <PhotoRow label="Foto 3" caption={null} thumb={null} state="uploaded" />
        </div>
        {/* Stories 6.3/6.5: the gallery variant -- the tile opens the viewer, number badge, stamp, "Legendar". */}
        <div className="gallery-grid">
          <PhotoRow
            label="Foto 4, abrir"
            number={4}
            stamp={{ text: '06/09 14:32', gps: true }}
            caption="Detalhe da chave seccionadora do Cubículo Enel"
            thumb={null}
            state="pending"
            onOpen={() => {}}
            onCaption={() => {}}
          />
          <PhotoRow label="Foto 5, abrir" number={5} stamp={{ text: '06/09 14:40', gps: false }} caption={null} thumb={null} state="uploaded" onOpen={() => {}} />
        </div>
      </div>
    </div>
  );
}

/**
 * `OverflowMenu`'s popover and `ConfirmDialog`'s modal render nothing until opened, so a
 * gallery scan that never opens them never exercises their `.menu-item`/`.dialog-title`
 * content. These open one at a time (never both together): react-aria's overlays apply
 * `aria-hidden` to everything outside the currently open one, so a second overlay's trigger
 * would itself become inaccessible while the first stays open. Each renders into a portal
 * attached to `document.body`, outside the `render()` container, so checks against the open
 * state must look at `document.body`, not the container.
 */
async function openOverflowMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C09' }));
  await screen.findByRole('menu');
}

async function closeOverflowMenu() {
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
}

async function openConfirmDialog() {
  const dialogHost = screen.getByTestId('confirm-dialog-host');
  await userEvent.click(within(dialogHost).getByRole('button', { name: 'Remover ficha' }));
  await screen.findByRole('dialog');
}

/**
 * Scanning `document.body` (needed to reach portal-rendered overlay content) activates
 * axe's page-level "region" rule, which expects the whole document to sit inside landmarks
 * (`<main>`, `<header>`, …). This fixture is a component gallery, not a page layout, so that
 * rule is out of scope here — the original scan of just the render `container` never
 * triggered it because axe treats a sub-container scan as partial and skips page-level rules.
 */
async function expectNoAxeViolations() {
  const results = await axe(document.body, { rules: { region: { enabled: false } } });
  expect(results).toHaveNoViolations();
}

describe('component gallery', () => {
  // E3-A4: one axe pass per component state (closed, menu open, dialog open), not one per
  // theme as well. jsdom resolves no `var()` color, so a pass under data-theme=dark saw the
  // same tree as the light one and checked nothing more; each theme's contrast is the token
  // tests' below and `styles/contrast.test.ts`'s, which read the resolved hex values.
  it('renders every shared component, closed and with each overlay open, with zero WCAG 2.2 AA violations', async () => {
    setTheme('light');
    render(<Gallery />);
    await expectNoAxeViolations();

    await openOverflowMenu();
    await expectNoAxeViolations();
    await closeOverflowMenu();

    await openConfirmDialog();
    await expectNoAxeViolations();
  });

  it('resolves the dark hex chain for the Suggestion amber tokens (never the light value)', () => {
    setTheme('light');
    const lightInk = rootToken('--fora-do-limite');
    const lightFill = rootToken('--fora-do-limite-fill');
    expect(lightInk).toBe('#8A4B00');
    expect(lightFill).toBe('#FDEBD0');

    setTheme('dark');
    const darkInk = rootToken('--fora-do-limite');
    const darkFill = rootToken('--fora-do-limite-fill');
    expect(darkInk).toBe('#F2B85C');
    expect(darkFill).toBe('#3A2A10');

    // Fails loudly if data-theme="dark" resolved to the light value.
    expect(darkInk).not.toBe(lightInk);
    expect(darkFill).not.toBe(lightFill);
  });

  it.each(['light', 'dark'] as const)('the Suggestion amber ink on its own fill contrasts at least 4.5:1 in %s', (theme) => {
    setTheme(theme);
    const ink = rootToken('--fora-do-limite');
    const fill = rootToken('--fora-do-limite-fill');
    expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it('every typography size token is at least 14px, with label and meta exactly at the floor', () => {
    setTheme('light');
    const sizes: Array<[string, string]> = [
      ['display', rootToken('--t-display-size')],
      ['title', rootToken('--t-title-size')],
      ['heading', rootToken('--t-heading-size')],
      ['body', rootToken('--t-body-size')],
      ['field-input', rootToken('--t-field-input-size')],
      ['value', rootToken('--t-value-size')],
      ['label', rootToken('--t-label-size')],
      ['meta', rootToken('--t-meta-size')],
    ];
    const pxByRole = new Map<string, number>();
    for (const [role, raw] of sizes) {
      const px = Number.parseFloat(raw);
      expect(px, `${role} (${raw}) should resolve to a size`).not.toBeNaN();
      expect(px, `${role} is ${px}px, below the 14px floor`).toBeGreaterThanOrEqual(14);
      pxByRole.set(role, px);
    }
    expect(pxByRole.get('label')).toBe(14);
    expect(pxByRole.get('meta')).toBe(14);
  });

  it('touch-min and touch-field tokens meet the 48px / 56px hit-area floor', () => {
    setTheme('light');
    expect(Number.parseFloat(rootToken('--touch-min'))).toBeGreaterThanOrEqual(48);
    expect(Number.parseFloat(rootToken('--touch-field'))).toBeGreaterThanOrEqual(56);
  });

  it('every rendered interactive control carries a class the CSS gives a sufficient hit area', async () => {
    setTheme('light');
    render(<Gallery />);
    const sufficientHitAreaClasses = [
      'btn', // .btn: min-height touch-min
      'chip', // .chip: min-height touch-min
      'tab', // .tab: min-height touch-field
      'seg', // .segmented .seg / .seg: min-height touch-min / touch-field
      'toggle', // .toggle: min-height touch-min
      'checkbox', // .checkbox: min-height touch-field
      'overflow-trigger', // .overflow-trigger: width/height touch-min
      'menu-item', // .overflow-menu .menu-item: min-height touch-min
      'input', // .input (combobox field): min-height touch-field
      'combobox-chevron', // .combobox-chevron: width touch-min
      'tab-select-trigger', // .tab-select-trigger (app.css, Tabs' phone selector): min-height touch-field
      'upload-pill', // .upload-pill[data-state="error"]: min-height touch-min (the retry pill)
      'photo-tile', // .photo-tile: width thumb-grid (96px), a square (Story 6.3's viewer opener)
    ];
    const hitAreaSelector = sufficientHitAreaClasses.map((c) => `.${c}`).join(', ');
    const roles = ['button', 'switch', 'checkbox', 'radio', 'tab', 'combobox', 'menuitem'] as const;

    function checkHitAreas() {
      const interactive = roles
        .flatMap((role) => screen.queryAllByRole(role))
        // React Aria's Modal/Popover inject an invisible `aria-label="Dismiss"` button for
        // screen-reader-only "click outside to close": it has no visual box and is never a
        // tappable affordance, so the 48px hit-area floor does not apply to it. A Popover
        // renames it "Fechar" (`relabelDismissButtons`); it stays out of the tab order.
        .filter((el) => !(el.getAttribute('tabindex') === '-1' && ['Dismiss', 'Fechar'].includes(el.getAttribute('aria-label') ?? '')));
      for (const el of interactive) {
        // React Aria's Switch/Checkbox/Radio put the accessible role on a visually hidden
        // native input nested inside the styled `.toggle`/`.checkbox`/`.seg` label, so the
        // hit-area class lives on an ancestor, not the role element itself.
        const carrier = el.matches(hitAreaSelector) ? el : el.closest(hitAreaSelector);
        expect(carrier, `<${el.tagName.toLowerCase()} role="${el.getAttribute('role')}"> has no ancestor with a known hit-area class`).not.toBeNull();
      }
    }

    checkHitAreas();
    await openOverflowMenu();
    checkHitAreas();
    await closeOverflowMenu();
    await openConfirmDialog();
    checkHitAreas();
  });

  it('renders a value and its unit in separate text slots, never one concatenated string', () => {
    render(
      <Chip isSelected onSelectedChange={() => {}}>
        <span className="t-value">3.700</span>
        <span className="t-label"> MΩ</span>
      </Chip>,
    );
    const value = screen.getByText('3.700');
    const unit = screen.getByText('MΩ', { exact: false });
    expect(value).not.toBe(unit);
    expect(value.className).toBe('t-value');
    expect(unit.className).toBe('t-label');
  });

  it('no rendered label text sits inside an element the CSS clips with overflow: hidden', async () => {
    setTheme('light');
    render(<Gallery />);
    const labelSelectors = ['.toggle-word', '.chip', '.tab', '.dialog-title', '.menu-item', '.field-label', '.status-pill'];

    function checkNoClipping() {
      for (const selector of labelSelectors) {
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
          expect(getComputedStyle(el).overflow, `${selector} must not clip its label text`).not.toBe('hidden');
        }
      }
    }

    checkNoClipping();
    await openOverflowMenu();
    checkNoClipping();
    await closeOverflowMenu();
    await openConfirmDialog();
    checkNoClipping();
  });

  it('chip rows wrap at 8px gaps and never scroll sideways (I/O matrix: chip row overflow)', () => {
    setTheme('light');
    render(<Gallery />);
    // jsdom does not resolve `var()` through getComputedStyle (see the file-level comment),
    // so the 8px gap is verified against the `--sp-2` token itself, the same way every other
    // test in this file reads a themed value, rather than against the unresolved `gap`
    // shorthand (which reads back empty in jsdom even though `components.css` sets it).
    expect(Number.parseFloat(rootToken('--sp-2'))).toBe(8);
    for (const row of document.querySelectorAll<HTMLElement>('.chip-row')) {
      const style = getComputedStyle(row);
      expect(style.flexWrap, '.chip-row must wrap, not stay on one line').toBe('wrap');
      expect(style.overflowX, '.chip-row must never scroll sideways').not.toBe('scroll');
    }
  });

  it('no shared component this story built runs a CSS animation (I/O matrix: reduced motion)', () => {
    // None of the 11 components this story built declare a `transition`/`animation` in
    // components.css (verified by inspection: only `.dictation-btn`, a later story's
    // component, animates, already guarded by an existing `prefers-reduced-motion` rule).
    // This test protects that fact going forward: if a future edit adds an animation to any
    // of these components without also adding a `prefers-reduced-motion: reduce` guard, it
    // fails here rather than shipping silently.
    setTheme('light');
    render(<Gallery />);
    for (const el of document.querySelectorAll<HTMLElement>('.frame *')) {
      expect(getComputedStyle(el).animationName, `${el.className || el.tagName} must not animate`).toBe('none');
    }
  });
});
