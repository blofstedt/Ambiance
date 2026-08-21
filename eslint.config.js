// BUILD-07: the repo had no linting at all.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/*
 * BUILD-09: `globals` was a hand-maintained list of about twenty browser names.
 * Every DOM type the code actually uses — File, KeyboardEvent, HTMLElement,
 * AbortSignal, URLSearchParams, React — was missing from it, so `npm run lint`
 * failed with 33 no-undef errors and `npm run verify` could never pass.
 *
 * The list is not the fix. `no-undef` is the wrong rule for TypeScript: tsc
 * already rejects undefined identifiers, with the real lib.dom.d.ts to check
 * against, and typescript-eslint's own docs say to switch it off. Keeping both
 * means maintaining a shadow copy of the DOM by hand forever.
 */
export default [
  {
    ignores: ['dist/**', 'android/**', 'node_modules/**', 'firmware/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // See BUILD-09 above. tsc owns undefined-identifier checking.
      'no-undef': 'off',

      // WEB-04/WEB-06/WEB-12: every one of those bugs was a stale-closure or
      // missing-cleanup problem in a useEffect. This rule is the single highest
      // value lint rule for this codebase, so it is an error, not a warning.
      'react-hooks/exhaustive-deps': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-alert': 'error', // WEB-17
    },
  },
  {
    // Developer tooling that runs in Node and is expected to talk to a terminal.
    files: ['mock/**/*.ts', 'server.ts', 'vite.config.ts', 'capacitor.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
