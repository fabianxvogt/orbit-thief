# QA and acceptance

## Scope

Reference build: Orbit Thief v1, static browser distribution from `dist/client`.

| Contract | Evidence | Status |
| --- | --- | --- |
| Interactive onboarding | Safe tutorial requires a real press and release before its fixed 9-second success window; death returns to retry without certifying | Implemented; human acceptance pending |
| Complete play loop | Four modes, spark collection, near-miss multiplier, hazard death, completion, score banking, instant retry | Implemented; browser journey pending serialized QA |
| Deterministic simulation | `FIXED_DT = 1/60`, seeded orbit generation, fixed input event frames, bounded alternating event validation, re-simulation comparison | Implemented; physics fixture passes |
| Trajectory replay | Saved input events are re-simulated; displayed trajectory is the verified replay path | Implemented; browser journey pending |
| Progression | Medal counts persist locally; Redline, Black Halo, and Night Shift unlock from attainable medal totals | Implemented |
| Persistence | localStorage stores settings, progress, scores, and latest replay | Implemented; storage failure is surfaced |
| Portability | Version 1 JSON export/import, numeric clamping, replay-shape validation, malformed input error | Implemented |
| Settings/recovery | Sound toggle, reduced motion toggle, pause, reset confirmation, retry | Implemented |
| Physics fixtures | 3,600 fixed steps plus named spark/hazard/safe-orbit boundary ordering | PASS |
| Build | `npm run build`; static route prerendered to `dist/client/index.html` | PASS |
| Lint | `npm run lint`; project-owned `app`, `lib`, and `scripts` | PASS |

## Browser/device evidence

- Desktop Chromium: fresh page loaded and accessibility tree showed the start screen, tutorial control, locked progression, settings, and save controls. Full action/retry/import journey is pending serialized browser access because concurrent browser sessions caused timeouts.
- Narrow mobile viewport: not yet measured.
- Safari: not tested.
- Five-player first-session acceptance: pending; do not treat implementation evidence as a substitute.

## Classification

`INCREMENTAL / EMPIRICAL` for a complete browser game implementation. No novelty or market-demand claim is made.
