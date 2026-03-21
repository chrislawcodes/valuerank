# Tasks

## Current Status

The coverage matrix pair-orientation spec, plan, and quickstart are finalized under `specs/coverage-matrix-pair-orientation/`. The implementation is complete in the API and web surfaces, and the targeted tests/builds passed.

## Task List

- [x] Normalize domain coverage value dimensions to canonical PascalCase keys before lookup
- [x] Make backend coverage pair keys directional instead of sorted
- [x] Make the coverage grid lookup use `col::row` orientation on the web page
- [x] Add a focused API unit test for value-dimension normalization
- [x] Update the web regression test to prove the mirror-orientation lookup behavior
- [x] Run targeted API and web tests
- [x] Run API and web lint/build verification
