# "Generate button does nothing" — diagnosis & fix plan

## Fix plan (priority order)

### 1. Surface all failures (highest priority, lowest risk)
- Wrap the Generate `onClick` body in `try/catch`; on error show
  `new Notice(...)` with the message (import `Notice` from obsidian).
- Immediately converts "does nothing" into an actionable message for the 3
  users, regardless of the underlying cause.

### 2. Fail loudly when digest data isn't found
- In `src/readBackup.ts`, if the `knowledge.json` entry isn't found, throw a
  clear `Error` (e.g. "Couldn't find digest data (knowledge.json) in this
  backup — it may be from an unsupported Supernote export or firmware
  version.") instead of silently treating it as an empty array.
- Combined with #1, the user gets a visible Notice.

### 3. Emit the actual archive structure for diagnosis
- When the expected entry isn't found, include the archive's real entry names
  (`Object.keys(unzipSync(backupBuffer))`) in the thrown error / console so an
  affected user can report exactly what paths their `.snbak` contains. This is
  how we confirm the web-app-export structure without their file in hand.

### 4. Tolerant path matching (actually fix structure mismatches)
- Replace the exact-match filter for `knowledge.json` with a case-insensitive
  "entry name ends with `knowledge.json`" match.
- Do the same for mark files (`src/readBackup.ts:314-318`): match the
  handwrite entry by case-insensitive suffix on
  `handwrite/<commentHandwriteName>` (or basename) rather than the hardcoded
  `PATH_TO_MARK_FILES + name`.
- Keep matches unambiguous (knowledge.json should be unique; guard against
  multiple matches).

### 5. Fix the stale disabled-button trap (secondary)
- `src/settings.ts:238` `.setDisabled(pathToBackup == "")` is evaluated only
  at render. Typing a path into the text field updates the setting but never
  re-renders, so Generate stays disabled → "does nothing."
- Replace silent disable with: keep the button enabled and, at click time,
  show a `Notice` if the path is empty (folds into #1). Matches the first
  user's "I tried putting the file in / outside the vault" fiddling.

### 6. Tests / regression fixture
- Unit-test the tolerant lookup helper with mock zip entries covering
  `DIGEST` vs `Digest` casing and prefix variations.
- Ask one affected user for their `.snbak` (or just a listing of the zip
  entry paths) to confirm the real structure and build a regression fixture.

## Non-code follow-up
- Request a failing `.snbak` (or its internal path listing) from one of the 3
  users — turns theory #4 from a guess into a confirmed, testable fix.
