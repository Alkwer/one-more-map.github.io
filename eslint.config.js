import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores([
    'dist/',
    'coverage/',
    'staging/',
    'playwright-report/',
    'test-results/',
    '.codex-remote-attachments/',
    '.sites/',
    '**/.worktrees/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite()],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          allowExportNames: ['displayValue', 'showPoeTooltip', 'hidePoeTooltip', 'tooltipProps'],
        },
      ],
    },
  },
  {
    files: [
      'tests/**/*.ts',
      'e2e/**/*.ts',
      'benchmarks/**/*.ts',
      'playwright.config.ts',
      'vite.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
)
