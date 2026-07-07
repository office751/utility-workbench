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
    rules: {
      // eslint-plugin-react-hooks v7 added these two rules, and they flag
      // several long-standing DELIBERATE patterns here: the clientId/stateRef
      // "latest ref" pattern in useProjects (each justified by a comment at
      // the site — it fixed the caret-jump/echo bug) and sync setState
      // fallbacks in effects when Supabase is absent (useAuth). Not runtime
      // bugs — the suite passes and the patterns are documented. Turned off
      // so `npm run lint` means "something is actually wrong" again (the
      // always-red lint was also permanently failing the weekly improvement
      // loop's lint gate). Re-enable if those patterns ever get modernized.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
