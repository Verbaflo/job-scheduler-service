Compact the CLAUDE.md file in the current repository without changing its meaning.

Target file: `CLAUDE.md` (or `$ARGUMENTS` if a different path is provided)

Steps:

1. **Read the file in full**
   Read the entire CLAUDE.md and note its current line count.

2. **Identify compaction candidates**
   Scan every rule/section for genuine verbosity. A candidate qualifies ONLY when:
   - The same constraint is stated in multiple sentences that can collapse into one without ambiguity.
   - Examples or rationale are restated redundantly after the rule is already clear.
   - Content is structurally misplaced (e.g., test runner config inside a Style rule).

   Do NOT compact if shortening would require the reader to infer something not already obvious. Do NOT force compaction — if a section is already tight, leave it alone.

3. **Apply changes one at a time**
   Use precise string replacements. For each change, ensure:
   - Every keyword and constraint from the original text survives in the new text.
   - No new rules or meanings are accidentally introduced.
   - The compacted text reads naturally.

4. **Verify equivalence**
   After all edits, run a verification script that:
   - Extracts key constraint phrases from the original (before) version.
   - Checks each phrase is still present in the new (after) version.
   - Reports PASS/FAIL for each check.
   - If any check fails, fix it immediately and re-run until all pass.

   Example verification approach:

   ```python
   checks = [
       ("pattern_from_original", "label"),
       ...
   ]
   for pattern, label in checks:
       found = pattern in content  # or regex
       print(f"[{'PASS' if found else 'FAIL'}] {label}")
   ```

5. **Report results**
   Print a summary:
   - Line count: before → after
   - Number of rules compacted vs. left untouched
   - Confirmation that all constraint checks passed
