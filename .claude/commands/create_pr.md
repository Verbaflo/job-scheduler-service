Create pull requests for the current branch against multiple target branches.

Target branches: $ARGUMENTS (default to all three: `testing`, `preproduction`, `main` if not specified. User may specify a subset, e.g., `testing preproduction`)

**STRICT RULE**: NEVER commit or push directly to `testing`, `preproduction`, or `main`. If the current branch IS one of these protected branches, STOP immediately and ask the user to create a feature/fix branch first (e.g., `fix/foo`, `feature/bar`). All changes must go through pull requests.

Steps:

1. **Validate current branch**
   Check the current branch name. If it is `testing`, `preproduction`, or `main`:
   - Automatically create a new branch from the current HEAD. The branch name must be meaningful and describe the feature or bug being addressed — NOT a random hash, commit ID, or verbatim commit message. Use `fix/<concise-description>` for bug fixes and `feature/<concise-description>` for new features (e.g., `fix/messages-count-empty-leads`, `feature/dynamic-rbac`).
   - `git checkout -b <new-branch>`
   - Continue with the new branch as the source branch for all subsequent steps.

2. **Check for uncommitted changes**
   Run `git status` — if uncommitted changes exist, ask the user whether to commit them first.

3. **Identify the source branch and commits**
   - Determine the current branch and which upstream branch it tracks (e.g., `origin/main`, `origin/testing`).
   - Identify the commits on this branch that are not yet on the tracked upstream: `git log origin/<tracked-branch>..HEAD --oneline`.
   - These are the commits that need to be PRed.

4. **Check for existing PRs and branches**
   For each target branch, determine the expected head branch name:
   - For the tracked upstream: the current branch name itself (e.g., `feature/foo`)
   - For other targets: `<current-branch>-<target-suffix>` (e.g., `feature/foo-testing`, `feature/foo-preprod`)

   For each expected head branch, check if an open PR already exists:
   `gh pr list --head <head-branch> --base <target-branch> --state open --json number,url`

   Record which targets have existing PRs (to **update**) vs. which need new PRs (to **create**).

5. **Process the tracked upstream branch**
   - Push the current branch to origin with `-u` flag.
   - **If no open PR exists**: create a PR using `gh pr create --base <tracked-branch>`.
   - **If an open PR exists**: skip PR creation — the push already updated it. Log the existing PR URL.

6. **For each remaining target branch**, do steps 7–10:

7. **Prepare the cherry-pick branch**
   - **If the branch already exists** (check `git branch -r --list 'origin/<branch>'`):
     - `git checkout <branch>` (or `git checkout -b <branch> origin/<branch>` if only remote exists).
     - `git pull origin <branch>` to ensure it's up to date.
     - Identify only the **new commits** to cherry-pick: compare commits on the source branch against what's already on this branch. Use commit message or patch-id matching to avoid re-cherry-picking commits that are already present.
   - **If the branch does not exist**:
     - `git checkout -b <branch> origin/<target-branch>` to create it fresh.
     - All commits from step 3 need to be cherry-picked.

8. **Cherry-pick the commits**
   - Cherry-pick the identified commits (new ones only if updating) onto this branch: `git cherry-pick <sha1> <sha2> ...`
   - If there are no new commits to cherry-pick (branch is already up to date), skip to step 9.
   - If cherry-pick conflicts occur:
     - Attempt to meaningfully resolve simple/obvious conflicts automatically (e.g., one side added, other side unchanged).
     - For ambiguous conflicts (both sides modified the same logic, semantic disagreements), **stop and ask the user** how to resolve. Do NOT guess or assume.
     - If conflicts cannot be resolved, abort the cherry-pick, inform the user, and skip this target. Continue with remaining branches.

9. **Push and create/update the PR**
   - Push the branch to origin with `-u` flag.
   - **If no open PR exists**: create a PR using `gh pr create --base <target-branch>`.
   - **If an open PR already exists**: skip PR creation — the push already updated it. Log the existing PR URL.

10. **PR title and body** (only when creating a new PR)
    - **Title**: Keep under 70 characters. Prefix with the target environment:
      - `[testing]` for the testing branch
      - `[preprod]` for the preproduction branch
      - `[main]` for the main branch
      - Example: `[testing] Add user authentication flow`
    - **Body**: Write a summary section with bullet points covering the cherry-picked commits. Add a test plan section. If cherry-pick required conflict resolution, note what was resolved in the body.

11. **Verify content parity across all PR branches**
    For each changed file, diff the file content across all successfully created PR branches to confirm they are identical:
    `diff <(git show <branch-1>:<file>) <(git show <branch-2>:<file>)`
    If any files differ, flag it to the user before proceeding.

12. **Return to original branch**
    After processing all targets, switch back to the original branch.

13. **Summary**
    Return a summary listing:
    - PR URLs for each target, marked as **Created** or **Updated**
    - Content parity verification result (all identical, or list discrepancies)
    - Any branches that were skipped (already up to date, or unresolvable conflicts)
