import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // These pages are restored from the finalized Git main Work UI. Keep the
    // source behavior unchanged while the V3 adapter supplies current data.
    files: [
      'src/pages/ManagementWorkPage.tsx',
      'src/pages/EmployeeWorkPage.tsx',
      'src/pages/WorkReportsMainPage.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    // The parity adapter intentionally accepts both the legacy main contracts
    // and current V3 API payloads at one isolated translation boundary.
    files: ['src/services/work-main-parity.service.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
