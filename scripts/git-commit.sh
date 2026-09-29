#!/bin/bash
# ─── Auto-commit & push script for Cryptsk ISP Platform ───
# HARD RULE: Every code change or bug fix MUST be committed and pushed.
# Usage: ./scripts/git-commit.sh "commit message"

set -euo pipefail

REPO_DIR="/home/z/my-project"
COMMIT_MSG="${1:-chore: auto-commit changes}"
BRANCH="main"

cd "$REPO_DIR"

# Check if there are changes to commit
if git diff --quiet && git diff --cached --quiet; then
    echo "✅ No changes to commit."
    exit 0
fi

# Stage all changes (except .env and node_modules which are in .gitignore)
git add -A

# Remove .env if accidentally staged
git reset HEAD .env 2>/dev/null || true

# Check again
if git diff --cached --quiet; then
    echo "✅ No meaningful changes to commit."
    exit 0
fi

# Commit
git commit -m "$COMMIT_MSG" --author="chiranjitk <chiranjitk@outlook.com>"

# Push
git push origin "$BRANCH" 2>&1

echo "✅ Committed and pushed to GitHub successfully!"
echo "   Commit: $(git log --oneline -1)"
echo "   Branch: $BRANCH"
echo "   Remote: https://github.com/chiranjitk/CRYPTSKINTELLIGENT-ISP-PLATFORM"
