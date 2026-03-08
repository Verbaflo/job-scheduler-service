Commit all staged and unstaged changes with a clear commit message.

Steps:

1. Run `git status` to see all changes (staged, unstaged, untracked)
2. Run `git diff` to review what changed
3. Run `git log --oneline -5` to match the repo's commit message style
4. Stage all relevant changed files (prefer specific files over `git add -A`)
5. Draft a concise commit message summarizing the "why" not the "what"
6. Create the commit

If the user provided arguments, use them as the commit message: $ARGUMENTS

Do not push to remote unless explicitly asked.
