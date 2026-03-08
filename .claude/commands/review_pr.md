Review a pull request and add inline comments on GitHub.

PR link or number: $ARGUMENTS

Steps:

1. Fetch the PR diff using `gh pr diff $ARGUMENTS`
2. Fetch PR metadata using `gh pr view $ARGUMENTS`
3. Fetch ALL existing review comments on the PR using:
   `gh api repos/{owner}/{repo}/pulls/{number}/comments` — note the file path, line number, and body of each existing comment.
   Also fetch general PR comments using: `gh api repos/{owner}/{repo}/issues/{number}/comments`
4. Read the project `CLAUDE.md` (and parent `CLAUDE.md` if it exists) to load the full Code Rules, AI Review Format categories, and verification checklist — these are the authoritative review criteria
5. Read every changed file in full to understand the surrounding context — do not review the diff in isolation
6. Analyze all changes against the CLAUDE.md rules, including but not limited to:
   - Bugs and logic errors
   - Security issues
   - Performance problems (N+1 queries, missing indexes, unindexed query paths)
   - Idempotency of retryable operations (SQS consumers, cron jobs, HTTP callbacks)
   - Design issues (layer violations, cross-domain boundary violations, missing error handling, magic values)
   - Function design (max 4 args, max 20 lines, return types, no bare `any`)
   - Style violations per CLAUDE.md conventions (ESLint/Prettier, naming, structured logging)
7. Before posting any comment, check it against the existing comments fetched in step 3. Skip any finding that:
   - Was already raised in a previous review comment (same file, same or nearby lines, same concern)
   - Was already discussed or addressed in the PR conversation
   - Overlaps substantially with an existing suggestion, even if worded differently
8. For each NEW finding only, add an inline comment on the PR using:
   `gh api repos/{owner}/{repo}/pulls/{number}/comments` with the correct commit SHA, file path, and line number
9. Tag each comment with severity: CRITICAL, WARNING, or SUGGESTION
10. Skip auto-fixable style issues (formatting, import order)
11. After posting all comments, provide a summary to the user listing all NEW findings by category (using the CLAUDE.md AI Review Format categories). If any findings were skipped because they duplicated existing comments, mention that briefly at the end.
