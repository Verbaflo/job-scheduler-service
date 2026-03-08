Implement code from a ClickUp document specification.

ClickUp document URL: $ARGUMENTS

Steps:

1. **Fetch the document**
   Use the ClickUp MCP server to fetch the document content from the provided URL.
   - Extract the doc ID from the URL (the last segment, e.g., `abcd-5678` from `https://app.clickup.com/.../abcd-5678`).
   - Use the MCP tools to read the document content.
   - If the document cannot be fetched, ask the user to paste the content manually.

2. **Parse the document**
   Read the entire document and extract whatever information is present. Documents may not follow a rigid structure — sections may be named differently, combined, interleaved, or implied rather than explicit. Look for any of the following (by content, not just by heading):
   - Functional requirements or feature descriptions
   - Non-functional requirements (performance, scalability, security constraints)
   - API contracts (endpoints, request/response schemas, status codes)
   - Folder or file structure suggestions
   - HLD (High-Level Design) or architectural overviews
   - LLD (Low-Level Design) or detailed component breakdowns
   - DB schemas (new collections/tables, field definitions)
   - DB schema changes (modifications to existing collections/tables)
   - Index requirements
     Not all of these will be present, and the document may contain information that doesn't fit neatly into any of these categories. Capture everything relevant — use the document's own structure rather than forcing it into a template.

3. **Ask clarifying questions**
   Before producing any plan, thoroughly review the document and ask the user about anything that is unclear or ambiguous. Do NOT assume. Common things to clarify:
   - Missing or vague acceptance criteria
   - Ambiguous field names, types, or validations
   - Unspecified error handling or edge cases
   - Missing relationships between entities
   - Unclear API authentication/authorization requirements
   - Which existing services or modules this integrates with
   - Any dependencies on other features or services not described
   - If folder structure is not provided, propose one and ask for confirmation
     Ask as many rounds of questions as needed until everything is crystal clear. Do not proceed until all ambiguity is resolved.

4. **Produce an implementation plan**
   Enter plan mode and create a detailed, step-by-step implementation plan that covers:
   - **Files to create or modify** — list every file with its full path
   - **Types/interfaces** — request, response, and internal DTOs in `types.ts` or dedicated type files
   - **DB schemas** — Mongoose models for new collections, schema changes, index definitions
   - **Service layer** — controller → service → repository call chain, following job-scheduler-service conventions
   - **Cross-service interactions** — how this feature communicates with other services (via HTTP, never direct DB access across domains)
   - **SQS producers/consumers** — if the feature needs async job processing
   - **Cron jobs** — if the feature needs scheduled processing
   - **Tests** — test files and key test cases to cover (note: no test framework exists yet — propose one if needed)
   - **Constants** — any new constants, enums, or magic values to extract
     Follow all conventions from the project CLAUDE.md strictly:
     - Max 4 params per function (group into interface/type if more)
     - Max 20 logical lines per function
     - No bare `any` types
     - Named constants, no magic values
       Wait for the user to approve the plan before proceeding.

5. **Implement the code**
   After plan approval, write all the code following the approved plan:
   - Create files in the order specified by the plan
   - Follow the controller → service → repository layer pattern
   - Add type annotations and return types on all functions
   - Use async/await for all I/O operations
   - Write tests if a test framework is available

6. **Post-implementation**
   After all code is written:
   - Run `npm run lint` and `npm run format` to lint and format
   - Run any relevant tests to verify they pass
   - Ask the user if they want to commit and/or create PRs
