# QA and acceptance

## Scope

Reference build: Orbit Thief v1, static browser distribution from `dist/client`.

| Contract | Evidence | Status |
| --- | --- | --- |
| Interactive onboarding | Safe tutorial requires a real press and release before its fixed 9-second success window; death returns to retry without certifying | Implemented; human acceptance pending |
| Complete play loop | Four modes, spark collection, near-miss multiplier, hazard death, completion, score banking, instant retry | Implemented; browser journey pending serialized QA |
| Deterministic simulation | `FIXED_DT = 1/60`, seeded orbit generation, fixed input event frames, bounded alternating event validation, re-simulation comparison | Implemented; physics fixture passes |
| Trajectory replay | Saved input events are re-simulated; displayed trajectory is the verified replay path | Finite-arena model replay checked; browser journey pending |
| Progression | Medal counts persist locally; bounded model evidence reaches finite-arena clears and the documented unlock sequence | Model checked; browser campaign and human acceptance pending |
| Persistence | localStorage stores settings, progress, scores, and latest replay | Implemented; storage failure is surfaced |
| Portability | Version 1 JSON export/import, numeric clamping, replay-shape validation, malformed input error | Implemented |
| Settings/recovery | Sound toggle, reduced motion toggle, pause, reset confirmation, retry | Implemented |
| Physics fixtures | 3,600 fixed steps plus named spark/hazard/safe-orbit boundary ordering | PASS |
| Build | `npm run build`; static route prerendered to `dist/client/index.html` | PASS |
| Lint | `npm run lint`; project-owned `app`, `lib`, and `scripts` | PASS |

## Bounded campaign model evidence

The reviewed source is published at <https://orbit-thief.fabian523417.chatgpt.site> from SHA `2ab90f2a92dc2628f22fd8da52e986e9fcfe17ba`.

A focused production-model probe reached these finite-arena outcomes:

| Arena | Goal | Model result | Medal result |
| --- | ---: | --- | ---: |
| Driftway | 30 seconds | Clear, score 1066 | 3 |
| Redline | 36 seconds | Clear, score 868 | 2 |
| Black Halo | 42 seconds | Clear, score 263 | 1 |

Fresh retry simulations matched terminal frame, score, sparks, near-misses, and outcome for all three finite arenas. Valid replay-shaped data re-simulated to the same score and trajectory; same-tick press/release ordering also matched. This is model evidence only. It is not a browser campaign, human playthrough, device test, or proof that Redline and Black Halo higher medal tiers are attainable.

Night Shift is an endless mode with no clear state and correctly presents a terminal run as `SIGNAL LOST`. Its base-medal behavior remains an explicit design and playtest question; this documentation does not classify it as a correctness blocker and does not change the game rule.

## Browser/device evidence

- Desktop Chromium: the bounded preview snapshot showed the start screen, tutorial movement, pause/resume, hazard retry, replay affordance, save export affordance, reload recovery, and reachable controls. Full campaign and imported-save browser journey remain pending a serialized QA pass.
- Narrow mobile viewport: not yet measured.
- Safari: not tested.
- Five-player first-session acceptance: pending; do not treat implementation evidence as a substitute.

## Classification

`INCREMENTAL / EMPIRICAL` for a complete browser game implementation. No novelty or market-demand claim is made.
