import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const bannedImport = (group, message) => ({ group, message });

const fetchSelectors = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message: 'fetch is allowed only in apps/web/src/{sync,files,api}.',
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='fetch'][callee.object.name=/^(window|globalThis|self)$/]",
    message: 'fetch is allowed only in apps/web/src/{sync,files,api}.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '_bmad/**',
      '_bmad-output/**',
      'docs/**',
      '.claude/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // The app-shell service worker (AD-8): plain JS, copied verbatim into the bundle, and
  // running in a worker global where `self`, `caches` and `clients` are the vocabulary.
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  // Import direction (AR-1, AR-12): domain imports no app; web and api never import each other.
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            bannedImport(['@app/web', '@app/web/*', '@app/api', '@app/api/*'], 'packages/domain must not import apps/*.'),
            { regex: '(^|/)apps/', message: 'packages/domain must not import apps/*.' },
            { regex: '^(\\.\\./){3,}(web|api)(/|$)', message: 'packages/domain must not import apps/*.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            bannedImport(['@app/api', '@app/api/*'], 'apps/web must not import apps/api.'),
            { regex: '(^|/)apps/api(/|$)', message: 'apps/web must not import apps/api.' },
            { regex: '^(\\.\\./){3,}api(/|$)', message: 'apps/web must not import apps/api.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            bannedImport(['@app/web', '@app/web/*'], 'apps/api must not import apps/web.'),
            { regex: '(^|/)apps/web(/|$)', message: 'apps/api must not import apps/web.' },
            { regex: '^(\\.\\./){3,}web(/|$)', message: 'apps/api must not import apps/web.' },
          ],
        },
      ],
    },
  },
  // Gate integrity (TST-V1, review 2026-10-08): a focused Playwright test or an action whose
  // promise is never awaited lets the gate pass on less than it claims. `forbidOnly` in
  // `playwright.config.ts` and the scan in `scripts/e2e.test.ts` back these up.
  // A fixed `waitForTimeout` waits for nothing in particular, so it is a warning: each new
  // one shows in the lint output, and the existing ones are TST-7's to shrink or size.
  {
    files: ['e2e/**/*.ts'],
    plugins: { playwright },
    rules: {
      'playwright/no-focused-test': 'error',
      'playwright/missing-playwright-await': 'error',
      'playwright/no-wait-for-timeout': 'warn',
    },
  },
  // The `no-wait-for-timeout` allow-list: files whose fixed waits are the gesture or the
  // schedule under test, never a wait for the app.
  {
    files: [
      // The press's hold (`TAP_HOLD_MS`): how long a human finger stays down.
      'e2e/support/taps.ts',
      // `waitUntil` lands each tap at its scheduled delay; that timing is what the spec measures.
      'e2e/lost-taps.durability.spec.ts',
    ],
    rules: { 'playwright/no-wait-for-timeout': 'off' },
  },
  // Fetch location (AR-1): the network is touched only by sync, files and api.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/{sync,files,api}/**'],
    rules: { 'no-restricted-syntax': ['error', ...fetchSelectors] },
  },
  // Store boundary (AD-1, AD-3): raw Dexie tables and useLiveQuery are reached only through src/db.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/db/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            bannedImport(['@app/api', '@app/api/*'], 'apps/web must not import apps/api.'),
            { regex: '(^|/)apps/api(/|$)', message: 'apps/web must not import apps/api.' },
            { regex: '^(\\.\\./){3,}api(/|$)', message: 'apps/web must not import apps/api.' },
            bannedImport(['dexie', 'dexie/*', 'dexie-react-hooks'], 'dexie is imported only in apps/web/src/db.'),
          ],
        },
      ],
    },
  },
);
