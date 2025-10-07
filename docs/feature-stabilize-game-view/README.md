# Stabilize Game View Backend Tasks

This note tracks the backend actions completed while working on branch `feature/stabilize-game-view`.

## Implemented changes
- Normalised `src/firebaseClient.js` to ASCII-only helpers, exporting `getFirebaseDb`, `getFirebaseAuth`, and wiring emulator toggles so the client boots cleanly in development.
- Added `src/repositories/localRunRepository.js` and updated `runRepository` to fall back to the local implementation when Firebase config is missing (offline/demo support).
- Introduced Firestore security rule tests under `tests/firestore.rules.test.js` together with the `npm run test:rules` script that uses the emulator for validation.
- Added documentation touch points (`BACKEND_STRATEGI.md`, `RELEASE_CHECKLIST.md`) to reflect the new baseline and required checks.

## Testing notes
- `npm run test:rules` spins up the Firestore emulator via `firebase emulators:exec`. It requires JDK 11+ to be available on the host (firebase-tools refuses older Java versions).
- React tests remain available via `npm`.

## Follow-up ideas
- Expand the local repository with persistence beyond process lifetime (IndexedDB) so manual browser refresh keeps participants in offline mode.
- Extend Firestore rule tests to cover `messages`, `analytics`, and `feedback` collections once their schemas stabilise.
