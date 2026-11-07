# Reader notebook recovery acceptance

November 7, 2026. AI-assisted implementation and verification. This small public-site correction protects chapter notes when a confirmed Clear cannot be saved.

## Behavior and compatibility

Previously, the notebook emptied its textarea before the guarded browser-storage write. A quota error or another tab's conflicting update could therefore leave the visible notes and their Markdown download empty while the older saved version remained untouched.

The confirmed Clear now writes the empty-note candidate first. Only a successful write empties the textarea. A refusal keeps the current notes and reading marker available, reports that clearing did not succeed and recommends downloading the current notes. Confirmation resets after the attempt, so another clear attempt requires the same two clicks. An edit after the first click still cancels confirmation.

The storage key remains `charitology-reading-<chapter id>`, with the same `{ read: boolean, notes: string }` JSON shape. Clear changes only the notes; the reading marker, ordinary autosave and existing Markdown format stay compatible. Malformed or unreadable saved data is not replaced. No storage migration, new network call, account, OS change, provider operation or publication of private notes is introduced.

## Focused verification

`node scripts/check-reader-notebook.mjs` renders the actual Astro component and executes its actual inline module using the existing fictional DOM/storage harness. Six mounted groups cover:

- A quota refusal, recoverable current Markdown and a later explicitly confirmed successful retry.
- Another tab's saved revision, a newer unsaved local draft and preservation of both after refused Clear.
- Malformed saved notes and a new recoverable draft.
- A blocked initial storage read and a new recoverable draft.
- Successful confirmed Clear with the original storage key, exact JSON shape and retained reading marker.
- An edit between the two clicks, which cancels confirmation without losing its ordinary autosave.

The original component failed the first regression: its textarea became empty instead of retaining the fictional Unicode/newline notes after quota refusal. The corrected component passes all six groups. The test checks that generating the current Markdown does not save it or overwrite the competing version. These six groups use simulated storage and download capture; they do not themselves establish native saved-file behavior, screen-reader operation or actual storage-quota injection.

`npm run check:types` includes both the existing strict publication-script check and this regression script. The focused strict check reports zero diagnostics across ten inline modules, completion models and guarded draft handling.

## Actual local browser check

The built first textbook chapter was also exercised in two real in-app-browser tabs on a temporary loopback origin. Tab A saved a newer version after tab B loaded the original. B then edited its own unsaved notes and confirmed Clear. The actual storage guard refused the stale write, preserving B's complete Unicode/newline/space text and reading marker. Its click-triggered Markdown download was saved and reopened: **161 bytes**, SHA-256 `ad839556a13afc38bdacf3ee83bc24f76bbb3c4585b9a1dd950940f8663f44ca`, exactly matching the current notes and reading marker. Reloading B recovered A's newer saved text unchanged. A subsequent ordinary unchecked-marker save and confirmed Clear succeeded on the fictional notes. Bounded application warning/error logs were empty.

This establishes that local in-app-browser conflict/download path only. Quota refusal remains simulated. Native Chrome, screen-reader announcements, other browsers, native print/PDF and public publication are not established by this check. The task-created Downloads copy was removed after its exact comparison; the private evidence copy stays outside Git.

## Release boundary

The isolated candidate at code commit `4fc1c2094186cb67bf42994e9f64d96d54a7b463` passes the full local `npm test` with Node 24.22.1 and pinned Astro 7.4.7: **579 HTML pages and 51,181 internal links/assets, none broken**. Its six notebook mounted groups and strict publication typing also pass within the normal check command. The later acceptance/HANDOFF additions record these results without changing the tested component or bundled notebook code.

Exact-head push/PR CI, review and public publication remain separate gates; their final identities belong to the release PR. This correction does not establish course completion, independent review, certification or organizational benefit. The original mega list, charity-system framing and unrelated service/release histories remain unchanged.
