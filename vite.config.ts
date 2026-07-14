import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Claude Code parks throwaway git WORKTREES under .claude/worktrees/
    // (agent isolation). Without this exclude, vitest sweeps those full repo
    // copies in and silently runs every suite twice — same tests, double the
    // count, and a stale worktree could even mask a real failure.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
