Solve a bug reported in a ClickUp task using a TDD approach.

ClickUp task ID or URL: $ARGUMENTS

Steps:

1. **Parse the ClickUp task reference**
   Extract the task ID from the provided input.
   - If a URL is provided, extract the task ID from it (e.g., `https://app.clickup.com/t/<task_id>` or similar formats — the task ID is typically the last path segment or query parameter).
   - If a raw task ID is provided (e.g., `86abcdef`), use it directly.
   - If the input cannot be parsed, ask the user to provide the task ID manually.

2. **Read the ClickUp task and comments**
   Use ClickUp MCP tools to read the full bug report:
   - Use `mcp__clickup__getTaskById` or `mcp__claude_ai_ClickUp__clickup_get_task` with the task ID to read the task details (title, description, status, assignees, priority, custom fields).
   - Use `mcp__claude_ai_ClickUp__clickup_get_task_comments` with the task ID to read all comments and discussion.
   - Extract: the original bug report from the task description, any error logs or reproduction steps in comments, attached files or screenshots mentioned, and any attempted fixes discussed.
   - If ClickUp reading fails, ask the user to paste the bug report content manually.

3. **Summarize the bug report**
   Present a structured summary to the user:
   - **Reporter**: who created the task
   - **Summary**: one-line description
   - **Reproduction steps**: numbered steps if available
   - **Expected behavior**: what should happen
   - **Actual behavior**: what actually happens
   - **Errors / stack traces**: any error messages or logs
   - **Environment**: staging/production, client code, browser, etc.
   - **Affected area**: which service, endpoint, or feature
     Note any missing information explicitly.

4. **Ask clarifying questions**
   Do NOT assume anything. Ask the user to clarify before proceeding. Common questions:
   - Which service and module is affected?
   - Is this reproducible locally?
   - Is this a regression? If so, when did it start?
   - What is the expected correct behavior?
   - Was there a recent deploy or PR that could have introduced this?
   - What is the priority/severity?
     Ask as many rounds of questions as needed until every ambiguity is resolved. Do not proceed until the bug is fully understood.

5. **Query Sentry for traces and errors**
   Use the Sentry API to gather observability data related to the bug. Sentry auth tokens and project details are in `~/.claude/CLAUDE.md`.
   - Ask the user which **environment** the bug was observed in (testing, preprod, prod-uk, prod-us) and the **approximate date/time range** (to keep queries small).
   - Query for **errors** related to the affected endpoint or error message:
     ```
     curl -s -H "Authorization: Bearer <token>" "<sentry_url>/api/0/organizations/sentry/events/?project=<project_id>&query=<endpoint_or_error>&statsPeriod=<range>&per_page=5&field=title&field=timestamp&field=event.type&field=message"
     ```
   - Query for **transactions** on the affected endpoint to check for latency or failures:
     ```
     curl -s -H "Authorization: Bearer <token>" "<sentry_url>/api/0/organizations/sentry/events/?project=<project_id>&query=transaction:<endpoint>&statsPeriod=<range>&per_page=5&field=title&field=timestamp&field=transaction.duration&field=transaction.status"
     ```
   - Keep `per_page` low (5–10) and `statsPeriod` tight (e.g., `1h`, `30m`) to avoid loading large data.
   - Extract: error messages, stack traces, transaction durations, HTTP status codes.
   - If Sentry returns no results, note it and proceed — the bug may not produce Sentry events.

6. **Explore the codebase**
   Investigate the affected code thoroughly:
   - Read the full call chain: controller → service → repository for the affected endpoint(s)
   - Read related models, types, constants, and middleware
   - Check `git log` for recent changes to the affected files
   - Grep for error strings, status codes, or keywords from the bug report
   - Read existing tests for the affected module to understand current coverage

7. **Identify root cause**
   Present your diagnosis to the user:
   - **Root cause**: what exactly is wrong and why
   - **Affected files**: list every file involved
   - **Impact scope**: what else could be affected by this bug or by the fix
   - **Proposed fix**: describe the minimal change needed
     Wait for the user to confirm the diagnosis before writing any code.

8. **Write failing tests FIRST (TDD)**
   Before touching any production code, write test(s) that reproduce the bug.
   **Note**: This service has no test framework yet. If tests are needed:
   - Propose a test setup (Jest is recommended for TypeScript/Express) and ask the user for approval before adding dependencies
   - Place tests alongside source files or in a `__tests__/` directory
   - Mock all external services (MongoDB, Redis, SQS, APIs) — no real network calls
   - The test must FAIL against the current code — run it to confirm the failure
   - If the test passes (bug not reproduced in test), revisit the root cause analysis

9. **Fix the bug**
   Make the minimal code change needed to fix the root cause:
   - Follow the controller → service → repository layer pattern — never skip layers
   - Max 4 params per function (group into interface/type if more)
   - Max 20 logical lines per function body
   - No magic values — extract constants to `constants.ts` or use enums
   - No bare `catch (err: any)` without re-throw — use specific error classes
   - Type annotations and return types on all functions
   - If the fix touches a MongoDB query, verify index coverage
   - Cross-service: never directly access another service's DB — use HTTP

10. **Run tests until green**
    - Run the bug-reproducing test(s) — they must now PASS
    - Run the broader test suite for the affected module to check for regressions
    - If any test fails, iterate on the fix until all tests pass
    - Do not move on until the test suite is fully green

11. **Format and lint**
    Run the standard formatting and linting pipeline:
    - `npm run format` to format with Prettier
    - `npm run lint` to check ESLint
    - Fix any issues raised by the linters

12. **Summary and commit**
    Present a final summary to the user:
    - **Bug**: what was reported
    - **Root cause**: what was wrong
    - **Fix**: what was changed and why
    - **Tests added**: list new test functions
    - **Files changed**: list all modified/created files
      Ask the user if they want to commit the changes.
