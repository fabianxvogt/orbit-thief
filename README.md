# Orbit Thief

Orbit Thief is a one-button gravitational score-attack game. Hold to tether into a tighter orbit, release to slingshot, collect sparks, flirt with hazards, and bank the route.

## v1 status

Complete browser implementation in verification. The v1 includes an interactive safe tutorial, three escalating arenas, a seeded endless challenge, fixed-step physics, deterministic input replays, near-miss multipliers, medals and unlocks, immediate retry, trajectory replay, pause/settings, local saves, and versioned portable save/replay export/import.

Human five-player acceptance remains pending; no player research result is claimed.

## Run locally

```sh
npm install
npm run dev
```

Open the printed local URL. The production distribution is static and is emitted to `dist/client`.

Useful checks:

```sh
npm run test:physics
npm run lint
npm run build
```

## Persistence and privacy

Progress, settings, scores, and the latest replay stay in browser localStorage. Export creates a versioned JSON file; import validates the schema, clamps progress values, rejects malformed files, and never sends data to a server. The static host has no account, database, analytics, or paid API dependency.

## Controls

Space, Enter, pointer down, or touch-and-hold tethers the ship. Release to sling. `P` or `Escape` pauses and freezes simulation time. Retry is available immediately after a death or completed run.

## License

Original source is MIT licensed. See [LICENSE](LICENSE).
