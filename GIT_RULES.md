# GIT RULES — HARD RULES (NON-NEGOTIABLE)

> **Scope:** Every agent, cron job, subagent, and human working in this repository — no exceptions.
> This file is **git-tracked** so it survives sandbox resets. Read it before ANY git operation.

---

## HARD RULE 1 — NEVER HARD RESET TO ORIGIN

The following commands are **FORBIDDEN** in this repo:

```bash
git reset --hard origin/main        # FORBIDDEN
git reset --hard                    # FORBIDDEN
git fetch && git reset --hard ...   # FORBIDDEN
git checkout origin/main -- .       # FORBIDDEN (bulk destructive restore)
git push --force / -f               # FORBIDDEN (without explicit user approval)
git clean -fdx                      # FORBIDDEN on working files
```

**Why:** This project lives in a sandbox that resets periodically. Git-tracked files are the
only thing that reliably survives. A hard reset to origin throws away local commits that may
not yet be pushed — that is permanent loss of shipped work (Phase 1/2/3 Reports, captive
portal engine, session hardening all went through messy-but-necessary merge flows).

Local commits are **always** recoverable; hard resets are not. If state looks wrong,
**stop and investigate** — do not reset.

---

## HARD RULE 2 — THE MANDATORY SAFE FLOW (IN ORDER)

Always sync with origin in this exact order:

### Step 1 — COMMIT LOCAL CHANGES FIRST

Never leave shippable local work uncommitted before pulling.

```bash
git add <specific files only>       # NEVER: ecosystem*.cjs, .env, dev.pid, dev.log,
                                    # runtime-applications/, *.db, node_modules/
                                    # next.config.ts IS allowed (tracked since a914b6/b61bc44)
git commit -m "feat|fix|chore(scope): message"
```

If part of the work is genuinely WIP and uncommitable, the fallback is:

```bash
git stash push -m "wip <desc>" -- <files>
git pull --rebase
git stash pop                        # resolve any pop-conflicts, then commit
```

…but committing first is the PREFERRED path.

### Step 2 — PULL WITH REBASE (never plain merge-pull by default)

```bash
git pull --rebase origin main
```

### Step 3 — IF CONFLICTS: MERGE CAREFULLY

1. **Read both sides** of every conflict hunk. Understand what each side does.
2. **Preserve BOTH feature sets** unless they are literally duplicates of the same thing.
   - Precedent: `captive-portal` (SSH-pushed from prod) coexists with local `nav-config`
     / `reports` / `radius-sync` work — resolutions kept both.
   - `worklog.md` conflicts: **keep BOTH appends** (dedupe by Task ID only, never drop an entry).
3. Remove **ALL** conflict markers, then verify zero remain before committing:

```bash
grep -rn '^<<<<<<<\|^=======$\|^>>>>>>>' <resolved-files>   # MUST return nothing
```

   (History lesson: conflict markers were accidentally committed into `radius-sync.ts`
   once and needed two follow-up commits to clean. Never again — grep before commit.)

4. Verify the resolved code actually works: scoped `bunx eslint <files>` (and
   `bunx tsc --noEmit` only if the surface is large) before continuing.
5. Continue the rebase:

```bash
git add <resolved files>
git rebase --continue            # or: git commit (if mid-merge), then re-run pull --rebase
```

   If the rebase becomes genuinely unresolvable, use
   `git rebase --abort` (returns you to your committed local state — SAFE)
   and escalate to the user. Never `rebase --abort` into a hard reset; never
   "resolve" by taking origin wholesale (`git checkout --theirs/--ours .` on whole trees).

### Step 4 — PUSH

```bash
git push origin main
```

Commit messages: conventional (`feat|fix|chore|merge(scope): ...`). Merge/conflict
resolution commits say what was preserved, e.g. `merge: resolve conflicts — keep captive
portal + nav changes` (see 59fa4ea, 4543015).

---

## HARD RULE 3 — PROTECTED / NEVER-TRACK FILES

Never `git add` these, no matter what:

- `ecosystem.config.cjs`, `ecosystem*.cjs` (template at `scripts/ecosystem.config.cjs.template` is tracked; the real file is NOT)
- `.env` (must contain the postgres `DATABASE_URL` locally, but never be committed)
- `dev.pid`, `dev.log`, `.zscripts/`
- `runtime-applications/` (PG binaries + data — hundreds of MB, machine-specific)
- `node_modules/`, `*.db`, any credential/secret file

---

## HARD RULE 4 — THE ONLY SANDBOX-RESET RECOVERY PATH

If the sandbox resets and the app/DB is gone, recovery is **`bash scripts/fresh-setup.sh`**
(NOT git reset). Git-tracked files come back automatically via clone/pull; everything else
(PG binaries, seed, ecosystem) is rebuilt by the script. See `FRESH-SETUP-GUIDE.md`.

---

**Conflict philosophy:** merges here are expected and normal (parallel SSH pushes from prod
happen). Conflicts are not failures — blind resolutions are. When in doubt, keep both sides,
verify with lint, and document the resolution in the commit message.
