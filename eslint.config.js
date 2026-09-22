import js from '@eslint/js';
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
  // Fetch location (AR-1): the network is touched only by sync, files and api.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/{sync,files,api}/**'],
    rules: { 'no-restricted-syntax': ['error', ...fetchSelectors] },
  },
);
