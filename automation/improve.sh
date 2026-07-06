#!/bin/zsh
# improve.sh — the weekly improvement loop wrapper (com.ironshield.improver).
#
# What it does, start to finish:
#   1. builds a THROWAWAY git worktree on a fresh improve/<date> branch
#      (Adam's real checkout is never touched)
#   2. runs headless Claude Code inside it with an ALLOWLISTED tool set
#      (edit/test/commit yes — push/merge/main no) following
#      automation/improve-prompt.md: propose (3 lenses) → judge → build|recommend
#   3. if the agent committed something: pushes ONLY the improve/<date> branch
#      (Vercel builds a preview for branches — production main is untouched)
#   4. emails the agent's report to Adam (needs the one-time Mail.Send grant;
#      until then the report still lands in scanner/logs/)
#   5. removes the worktree
#
# First run should be SUPERVISED: just run  automation/improve.sh  in a
# terminal and watch. When happy, install the launchd job (see automation/README.md).
set -uo pipefail

REPO="/Users/Construction/Documents/Claude/Projects/Lodestar/construction-lodestar"
NODE_BIN="/Users/Construction/.nvm/versions/node/v24.16.0/bin"
export PATH="$NODE_BIN:$PATH"
STAMP=$(date +%Y-%m-%d)
BRANCH="improve/$STAMP"
WT="$REPO/.improve-worktree"
LOGS="$REPO/scanner/logs"
REPORT="$LOGS/improve-$STAMP.md"
TO_EMAIL="admin@mrocalabuyshouses.com"

mkdir -p "$LOGS"
cd "$REPO"

command -v claude >/dev/null || { echo "claude CLI not found — run: npm i -g @anthropic-ai/claude-code, then 'claude' + /login once." | tee "$REPORT"; exit 78; }

# --- 1. throwaway worktree on a fresh branch off local main ---------------
git worktree remove --force "$WT" 2>/dev/null || true
git branch -D "$BRANCH" 2>/dev/null || true
git worktree add -b "$BRANCH" "$WT" main --quiet || { echo "worktree add failed" | tee "$REPORT"; exit 1; }
cd "$WT"
npm ci --no-audit --no-fund --silent || { echo "npm ci failed in worktree" | tee "$REPORT"; git -C "$REPO" worktree remove --force "$WT"; exit 1; }

# --- 2. the agent: allowlisted tools, prompt = the orchestration doc -------
# Allowlist notes: git add/commit only (no push/merge/checkout at the tool
# layer); npm/npx cover tests + build; Task enables the proposer/judge agents.
claude -p "$(cat "$REPO/automation/improve-prompt.md")" \
  --add-dir "$LOGS" \
  --allowedTools \
    "Read" "Glob" "Grep" "Edit" "Write" "Task" "TodoWrite" \
    "Bash(npm test:*)" "Bash(npm run build:*)" "Bash(npx vitest:*)" "Bash(npx tsc:*)" \
    "Bash(node:*)" "Bash(ls:*)" "Bash(grep:*)" "Bash(wc:*)" "Bash(cat:*)" \
    "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" \
    "Bash(git add:*)" "Bash(git commit:*)" "Bash(git rev-parse:*)" "Bash(git checkout -- :*)" \
  > "$REPORT" 2> "$LOGS/improver.err.log"
AGENT_EXIT=$?
[ -s "$REPORT" ] || echo "VERDICT: FAILED — the agent produced no report (exit $AGENT_EXIT). See improver.err.log." > "$REPORT"

# --- 3. push the branch ONLY if the agent committed work --------------------
COMMITS=$(git rev-list main..HEAD --count 2>/dev/null || echo 0)
if [ "$COMMITS" -gt 0 ]; then
  git push -u origin "$BRANCH" --quiet \
    && echo "\n[wrapper] pushed $BRANCH ($COMMITS commit(s)) — review with: git fetch && git checkout $BRANCH" >> "$REPORT" \
    || echo "\n[wrapper] PUSH FAILED — the branch only exists locally: $BRANCH" >> "$REPORT"
fi

# --- 4. email the report (graceful until the Mail.Send grant is done) ------
SUBJECT="🔧 Lodestar improvement loop — $(head -1 "$REPORT" | cut -c1-80)"
cd "$REPO"
npx tsx scripts/send-mail.ts --to "$TO_EMAIL" --subject "$SUBJECT" --file "$REPORT" \
  || echo "[wrapper] email failed — report saved at $REPORT"

# --- 5. cleanup: worktree goes, the branch (if it has commits) stays --------
git worktree remove --force "$WT" 2>/dev/null || true
[ "$COMMITS" -eq 0 ] && git branch -D "$BRANCH" 2>/dev/null || true
echo "[wrapper] done — report: $REPORT"
