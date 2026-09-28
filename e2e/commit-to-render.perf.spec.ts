import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getDefinition } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';

/*
 * E7-A1/E8-A1 (Epic 9 carry-over, task 1): commit-to-render on the standard relatório
 * (the project plus the 223 `instantiateTemplate` ops), measured on its first chave
 * seccionadora sheet at 1280 x 800. Each sample runs from the input event that commits
 * (the `pointerup` of a checklist tap, the `keydown` Enter of a measurement cell) to the
 * animation frame after the DOM first reflects the committed value (a MutationObserver
 * sees the segment's `aria-checked`, or the cell's out-of-limit state, change; the time is
 * taken in the next `requestAnimationFrame`). 20 checklist taps and 20 measurement
 * entries, then the same under CDP CPU throttling at 4x. The medians and p90s go to
 * `test-results/perf/commit-to-render.json` and to the log.
 *
 * It measures; it asserts no budget. Serial group: it times the device against a render,
 * so it must not share the CPU with other workers.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const SECC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const ITEMS = SECC.checklist!;
const SAMPLES = 20;
// The insulation criterion is ">400 MΩ" and the column's unit GΩ: 0,1 GΩ is out, 5 GΩ is in,
// so each entry flips the cell's `data-state` and the DOM shows the commit.
const OUT_VALUE = '0,1';
const IN_VALUE = '5';

interface Stats {
  samples: number[];
  median: number;
  p90: number;
}

function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
  const round = (n: number) => Math.round(n * 10) / 10;
  return { samples: samples.map(round), median: round(at(0.5)), p90: round(at(0.9)) };
}

/**
 * Arms one measurement in the page: the clock starts at the first input event of `trigger`
 * (capture phase, before the app's own handlers) and stops in the frame after an element matching
 * `selector` (visible) holds `attr === expected` (null: the attribute absent).
 */
async function arm(page: Page, trigger: 'tap' | 'enter', selector: string, attr: string, expected: string | null): Promise<void> {
  await page.evaluate(
    ({ trigger, selector, attr, expected }) => {
      const w = window as unknown as { __commitToRender?: Promise<number> };
      w.__commitToRender = new Promise<number>((resolveSample, reject) => {
        let t0: number | null = null;
        const onInput = (event: Event) => {
          log.push(`input ${event.type}`);
          if (t0 !== null) return;
          if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
          t0 = performance.now();
        };
        const holds = () =>
          [...document.querySelectorAll<HTMLElement>(selector)].some((el) => el.getClientRects().length > 0 && el.getAttribute(attr) === expected);
        // A tap commits on release (the click after `pointerup`); the first of the two starts the clock.
        const events = trigger === 'tap' ? ['pointerup', 'click'] : ['keydown'];
        const stop = () => {
          observer.disconnect();
          for (const name of events) window.removeEventListener(name, onInput, true);
        };
        let calls = 0;
        const log: string[] = [`armed holds=${holds()}`];
        const observer = new MutationObserver(() => {
          calls += 1;
          log.push(`cb t0=${t0 !== null} holds=${holds()}`);
          if (t0 === null || !holds()) return;
          stop();
          clearTimeout(timer);
          const start = t0;
          requestAnimationFrame(() => resolveSample(performance.now() - start));
        });
        const timer = setTimeout(() => {
          stop();
          const seen = [...document.querySelectorAll<HTMLElement>(selector)].map((el) => `${el.getAttribute(attr)}/${el.getClientRects().length}`);
          reject(new Error(`no render of ${selector} [${attr}=${String(expected)}] within 60 s (input seen: ${t0 !== null}, callbacks: ${calls}, matches: ${seen.join(',')}; ${log.join(' | ')})`));
        }, 60_000);
        for (const name of events) window.addEventListener(name, onInput, true);
        observer.observe(document.body, { subtree: true, attributes: true, childList: true });
      });
    },
    { trigger, selector, attr, expected },
  );
}

const sample = (page: Page) => page.evaluate(() => (window as unknown as { __commitToRender: Promise<number> }).__commitToRender);

async function checklistTaps(page: Page): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const n = i % ITEMS.length;
    const row = `#ficha-step-verificacoes li.checklist-row[data-item-key="${ITEMS[n]!.key}"]`;
    // The segment not chosen now, so every tap changes the row (a row may already hold a value).
    const conforme = await page.locator(`${row} [role="radio"][aria-label="Conforme"]`).filter({ visible: true }).getAttribute('aria-checked');
    const name = conforme === 'true' ? 'Não conforme' : 'Conforme';
    // Found by the row's item key and the segment's name, so a re-render that remounts the row still matches.
    const selector = `${row} [role="radio"][aria-label="${name}"]`;
    const segment = page.locator(selector).filter({ visible: true });
    await segment.scrollIntoViewIfNeeded();
    await arm(page, 'tap', selector, 'aria-checked', 'true');
    await segment.click();
    out.push(await sample(page));
    await expect(segment).toHaveAttribute('aria-checked', 'true');
  }
  return out;
}

async function measurementEntries(page: Page): Promise<number[]> {
  const keys = await page
    .locator('input[data-cell-input^="isolacao:"]')
    .evaluateAll((inputs) => inputs.filter((el) => el.getClientRects().length > 0).map((el) => el.getAttribute('data-cell-input')!));
  expect(keys.length).toBeGreaterThanOrEqual(6);
  const out: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const key = keys[i % keys.length]!;
    const selector = `.ficha-cell[data-cell="${key}"] .measurement-field`;
    // The value whose verdict differs from the cell's now, so every entry changes its state.
    const state = await page.locator(selector).filter({ visible: true }).getAttribute('data-state');
    const out_ = state !== 'out-of-limit';
    const input = page.locator(`input[data-cell-input="${key}"]`).filter({ visible: true });
    await input.click();
    await input.fill(out_ ? OUT_VALUE : IN_VALUE);
    await arm(page, 'enter', selector, 'data-state', out_ ? 'out-of-limit' : null);
    await page.keyboard.press('Enter');
    out.push(await sample(page));
  }
  return out;
}

test('@p2 PERF-E2E-001 commit-to-render on the standard relatório: 20 checklist taps and 20 measurement entries at 1280 px, normal and 4x CPU throttled', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const sheet = built.sheets.find((row) => row.blockType === 'chave_seccionadora')!;
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  const normal = { checklist: stats(await checklistTaps(page)), measurement: stats(await measurementEntries(page)) };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let throttled: typeof normal;
  try {
    throttled = { checklist: stats(await checklistTaps(page)), measurement: stats(await measurementEntries(page)) };
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
  }

  const result = { measured_at: new Date().toISOString(), viewport: '1280x800', unit: 'ms', normal, throttled_4x: throttled };
  const file = resolve(process.cwd(), 'test-results/perf/commit-to-render.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  const line = (label: string, s: Stats) => `${label}: median ${s.median} ms, p90 ${s.p90} ms`;
  console.log(
    [
      'commit-to-render (standard relatório, chave seccionadora, 1280 px)',
      line('  checklist tap', normal.checklist),
      line('  measurement entry', normal.measurement),
      line('  checklist tap, 4x CPU', throttled.checklist),
      line('  measurement entry, 4x CPU', throttled.measurement),
    ].join('\n'),
  );
});
