# Test Plan

Goal: build confidence that the plugin's delete logic (`cleanDigests.ts`,
and the regenerate-on-change path in `readBackup.ts`) can never touch a
file it shouldn't, before release.

## Status

- [x] Blocked: `npm i -D vitest` fails with an `ERESOLVE` peer conflict
      (`vitest@4` wants `@types/node@^20 || ^22 || >=24`, project pins
      `@types/node@^16.11.6`). Fix: bump `@types/node` to a satisfying
      version (dev-only, type-checking has no effect on the runtime bundle).

## Roadmap

- [x] **1. Get Vitest running on nothing**
    - Install `vitest` as a dev dependency
    - Add `test` (and optionally `test-watch`) scripts to `package.json`
    - Add a `vitest.config.ts` (reference `supernote-typescript/vite.config.ts`
      for what fields exist, not to copy verbatim)
    - Write one throwaway trivial test and get it green, to prove the runner
      itself works before testing anything real

- [x] **2. Learn test anatomy**
    - `describe` / `it` / `expect`
    - Arrange-Act-Assert pattern

- [x] **3. Build fakes for the `obsidian` objects the code touches**
    - `obsidian` ships types only, no runtime — can't import the real thing
    - Need fake/stub versions of: `App`, `Vault` (with a spyable
      delete/trash call), `TFile`, `TFolder`, `metadataCache`

- [x] **4. Write the first real test**
    - Simplest possible case for `cleanDigests.ts`: a folder with one tagged
      file and one untagged file — assert only the tagged one is deleted

- [x] **5. Add edge cases one at a time**
    - Mixed tagged/untagged files in the same folder
    - Folder path doesn't exist (renamed/deleted since settings were saved)
      — confirm no throw
    - Files in subfolders — confirm current non-recursive behavior (document
      it either way, even if not "fixed")
    - `readBackup.ts`'s regenerate-on-next/previous-change delete — confirm
      it only deletes the one atomic note being replaced, nothing else

- [ ] **6. Refactor fakes into reusable test helpers**
    - Once duplication shows up across test files, extract shared mock
      builders

- [ ] **7. Wire `npm test` into CI**
    - Add a test step alongside the existing `.github/workflows/lint.yml`

## Notes / reminders from the code review

- Prefer `app.vault.trash()` (or `app.fileManager.trashFile()`) over
  `app.vault.delete()` at both call sites — makes accidental deletions
  recoverable instead of permanent. Worth a test asserting _which_ method
  gets called, once the swap is made.
- Remove leftover `console.log(combinedFiles)` in `cleanDigests.ts`.
- Manual testing pass: use a disposable test vault, never the real one.
