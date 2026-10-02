#!/usr/bin/env bash
# ============================================================
# CRYPTSK Nexus — Auto-Commit Cron Script
# Runs on prod every 5 minutes to commit local changes
# This prevents data loss when agents do `git pull` or `git reset --hard`
#
# CRITICAL RULE: This script NEVER pushes to GitHub (to avoid conflicts).
# It only commits locally so local changes are preserved.
# A separate process (manual or CI/CD) handles pushing to GitHub.
#
# Install: crontab -e
#   */5 * * * * /opt/ispplatform/scripts/auto-commit-cron.sh >> /var/log/auto-commit.log 2>&1
# ============================================================

set -euo pipefail

REPO_DIR="/opt/ispplatform"
cd "$REPO_DIR" || exit 1

# Skip if a build is in progress (don't interfere with compilation)
if pgrep -f "next build" > /dev/null 2>&1; then
    echo "[$(date)] Build in progress — skipping auto-commit"
    exit 0
fi

# Skip if a git operation is already in progress (merge, rebase, pull)
if [ -d "$REPO_DIR/.git/MERGE_HEAD" ] || [ -d "$REPO_DIR/.git/rebase-merge" ] || [ -d "$REPO_DIR/.git/rebase-apply" ]; then
    echo "[$(date)] Git operation in progress — skipping auto-commit"
    exit 0
fi

# Check if there are any changes (staged, unstaged, or untracked)
CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$CHANGES" -eq 0 ]; then
    echo "[$(date)] No changes — skipping"
    exit 0
fi

# Ensure git config is set (needed for commit)
git config user.email 2>/dev/null || git config user.email "admin@cryptsk.com"
git config user.name 2>/dev/null || git config user.name "CRYPTSK Auto-Commit"

# Check if we're in the middle of a merge/rebase conflict
if [ -f "$REPO_DIR/.git/MERGE_MSG" ]; then
    echo "[$(date)] Merge in progress — resolving automatically (keep local)..."
    git checkout --ours . 2>/dev/null || true
    git add -A 2>/dev/null || true
    git commit --no-edit 2>/dev/null || true
    echo "[$(date)] Merge resolved — local changes preserved"
    exit 0
fi

# Stage ALL changes (modified + untracked)
git add -A 2>/dev/null

# Commit with a descriptive message
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S %Z")
COMMIT_MSG="auto-commit: preserve local changes at $TIMESTAMP

This commit was created by the auto-commit cron to prevent data loss.
If an agent does git pull or git reset --hard, these changes are preserved
in git history and can be recovered via: git log --oneline

Changed files: $CHANGES"

git commit -m "$COMMIT_MSG" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "[$(date)] ✅ Auto-committed $CHANGES file(s) — local changes preserved"
    # Log what was committed (first 5 changed files)
    git show --stat HEAD --format="" 2>/dev/null | head -5
else
    # If commit failed, it might be because there's nothing to commit
    # (e.g., only whitespace changes, or .gitignore'd files)
    echo "[$(date)] Nothing to commit (changes may be in .gitignore)"
fi

# Also try to push to GitHub (non-blocking — if it fails, local commit still protects the changes)
# This is OPTIONAL — uncomment to enable auto-push
# git push origin main 2>/dev/null && echo "[$(date)] ✅ Pushed to GitHub" || echo "[$(date)] ⚠ Push failed (local commit still protects changes)"

echo "[$(date)] Auto-commit cron complete"
