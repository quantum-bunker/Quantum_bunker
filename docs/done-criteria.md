# Definition of Done

A change is complete when all of the following are true:

## Code Quality
- TypeScript compiles without errors (`npm run lint` passes — `tsc --noEmit`)
- No `any` types introduced
- No magic numbers — all limits referenced from `src/backend/core/constants.ts`
- All new use-case logic covered by unit tests; new adapters covered by integration tests

## Correctness
- WS connections do not loop, leak, or leave open handles on test teardown
- Session cleanup logic is verified against all three expiry conditions (TTL, inactivity, empty)
- Zero-knowledge invariant untouched: no payload inspection anywhere in the backend

## UI
- UI matches the active theme aesthetic (see `docs/ui-aesthetic.md`)
- No inline `style={}` except for strictly dynamic values
- Responsive — tested on mobile breakpoint

## Documentation
- `docs/*.md` updated if the feature changes observable behavior, API shape, or protocol
- `usage/*.md` updated if the user-visible flow changes
- `CLAUDE.md` updated if the architecture, limits, or feature list changes
- ADR written if architectural boundaries are crossed in a new way

## Tests pass
- `npm test` passes with no failures or skipped tests that cover changed code
