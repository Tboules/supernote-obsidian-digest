# "Generate button does nothing" — diagnosis & fix plan

## Symptom
Three users report the **Generate** button does nothing. Cannot reproduce on
the author's Mac (Obsidian 1.12.7, official plugin) — a full fresh flow (reset
settings → atomic → Browse → pick file → Generate) works there.

## What we ruled out
- **`file.path` / Electron `webUtils`** — verified working on 1.12.7 (Browse
  populates the path correctly). Not the cause.

## Root problem: failures are invisible + input assumptions are brittle
Two independent things combine so that any failure looks like "the button does
nothing," with zero feedback:

1. **Silent empty-result path** (`src/readBackup.ts:188-201`). The
   `knowledge.json` lookup is an exact string match on
   `PATH_TO_KNOWLEDGE_FILE = "backup/DIGEST/knowledge.json"`. If a `.snbak`
   doesn't contain that exact path (different casing, prefix, or layout — e.g.
   a web-app/cloud export vs. on-device export, or a different firmware), then:
   - `knowledgeBytes` is `undefined` → `knowledgeJson` falls back to `"[]"`
   - parses to an empty array → the `Array.isArray` guard does NOT fire
   - loop runs zero times → returns with no notes, no error, no progress.
2. **No error surfacing.** The Generate `onClick`
   (`src/settings.ts:226-236`) has no `try/catch`, so a genuine throw (bad
   path, unreadable file, unexpected structure) vanishes silently too.

### Why this matches the reports
- The `.snbak` layout is **undocumented and officially "unstable"** (per
  Ratta / supernote-typescript README) and was reverse-engineered from the
  author's Manta. Other users' files (esp. the confirmed web-app-export user)
  can legitimately differ, hitting the silent empty-result path above.

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
