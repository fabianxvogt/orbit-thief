# Orbit Thief

Orbit Thief is a one-button gravitational score-attack game. Hold to tether into a tighter orbit, release to slingshot, collect sparks, flirt with hazards, and bank the route.

## Public preview status

The reviewed public preview is live at <https://orbit-thief.fabian523417.chatgpt.site> from source SHA `2ab90f2a92dc2628f22fd8da52e986e9fcfe17ba`. It includes the safe tutorial, three finite arenas, the seeded Night Shift challenge, fixed-step physics, deterministic input replays, medals and unlocks, retry, trajectory replay, pause/settings, local saves, and versioned portable save/replay export/import.

A bounded production-model check reached finite-arena clears and matched retry and imported replay state for Driftway, Redline, and Black Halo. It is not a browser campaign, human playtest, device validation, or proof that every higher medal tier is attainable. Night Shift has no clear state by design; its terminal medal behavior remains a design and playtest question.

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
