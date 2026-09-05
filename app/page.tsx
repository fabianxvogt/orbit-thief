"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  distance,
  FIXED_DT,
  HAZARD_COLLISION_RADIUS,
  HAZARD_NEAR_MISS_MIN,
  HAZARD_NEAR_MISS_RADIUS,
  hashSeed,
  makeOrbit,
  SAFE_ORBIT_MAX,
  SAFE_ORBIT_MIN,
  seededUnit,
  SPARK_HIT_RADIUS,
  stepOrbit,
  type OrbitState,
  type Vec2,
} from "@/lib/orbit";

type Screen = "menu" | "tutorial" | "play" | "dead";
type ArenaId = "driftway" | "redline" | "black-halo" | "endless";
type RunOutcome = "dead" | "cleared";

type ArenaConfig = {
  id: ArenaId;
  eyebrow: string;
  name: string;
  description: string;
  color: string;
  seed: number;
  goalFrames: number | null;
  sparkCount: number;
  hazardCount: number;
  thresholds: [number, number];
};

type SaveData = {
  version: 1;
  progress: { tutorialDone: boolean; medals: Record<ArenaId, number> };
  settings: { sound: boolean; reducedMotion: boolean };
  bestScores: Partial<Record<ArenaId, number>>;
  lastReplay?: ReplayData;
};

type ReplayData = {
  arena: ArenaId;
  seed: number;
  score: number;
  outcome?: RunOutcome;
  inputEvents: InputEvent[];
  trail: Vec2[];
};

type InputEvent = { frame: number; type: "press" | "release" };
type Spark = Vec2 & { index: number; pulse: number };
type Hazard = Vec2 & { index: number; nearMissed: boolean };

type Runtime = {
  kind: "tutorial" | "run";
  arena: ArenaId;
  seed: number;
  frame: number;
  orbit: OrbitState;
  tethered: boolean;
  pressed: boolean;
  pendingRelease: boolean;
  inputEvents: InputEvent[];
  sparks: Spark[];
  hazards: Hazard[];
  collected: Set<number>;
  trail: Vec2[];
  score: number;
  multiplier: number;
  nearMisses: number;
  collectedCount: number;
  outcome: RunOutcome | null;
  deathReason: string;
  lastTetherFrame: number;
  paused: boolean;
  replayTrail?: Vec2[];
  replayVerified?: boolean;
};

const STORAGE_KEY = "orbit-thief-save-v1";
const ARENAS: Record<ArenaId, ArenaConfig> = {
  driftway: {
    id: "driftway",
    eyebrow: "01 / SAFE FLIGHT",
    name: "Driftway",
    description: "Learn the pull. Thread the quiet side of the planet.",
    color: "#72e1c1",
    seed: 35,
    goalFrames: 60 * 30,
    sparkCount: 13,
    hazardCount: 4,
    thresholds: [500, 900],
  },
  redline: {
    id: "redline",
    eyebrow: "02 / PRESSURE",
    name: "Redline",
    description: "The orbit tightens. Your near-misses are now your engine.",
    color: "#ff9f68",
    seed: 2035,
    goalFrames: 60 * 36,
    sparkCount: 18,
    hazardCount: 7,
    thresholds: [850, 1400],
  },
  "black-halo": {
    id: "black-halo",
    eyebrow: "03 / DEEP SPACE",
    name: "Black Halo",
    description: "Heavy gravity, narrow lanes, no wasted release.",
    color: "#be9cff",
    seed: 9035,
    goalFrames: 60 * 42,
    sparkCount: 22,
    hazardCount: 10,
    thresholds: [1250, 1900],
  },
  endless: {
    id: "endless",
    eyebrow: "∞ / SEEDED CHALLENGE",
    name: "Night Shift",
    description: "A daily orbit. Your route is the proof you were here.",
    color: "#f6d477",
    seed: 0,
    goalFrames: null,
    sparkCount: 25,
    hazardCount: 12,
    thresholds: [1100, 2200],
  },
};

const EMPTY_SAVE: SaveData = {
  version: 1,
  progress: {
    tutorialDone: false,
    medals: { driftway: 0, redline: 0, "black-halo": 0, endless: 0 },
  },
  settings: { sound: true, reducedMotion: false },
  bestScores: {},
};

function sanitizeReplay(value: unknown): ReplayData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const replay = value as Partial<ReplayData>;
  if (!ARENAS[replay.arena as ArenaId] || !Number.isFinite(replay.seed) || !Number.isFinite(replay.score) || !Array.isArray(replay.inputEvents) || !Array.isArray(replay.trail)) return undefined;
  const inputEvents = replay.inputEvents.filter((event): event is InputEvent => Boolean(event) && typeof event === "object" && Number.isInteger((event as InputEvent).frame) && (((event as InputEvent).type === "press") || ((event as InputEvent).type === "release")));
  const trail = replay.trail.filter((point): point is Vec2 => Boolean(point) && typeof point === "object" && Number.isFinite((point as Vec2).x) && Number.isFinite((point as Vec2).y)).slice(-3600);
  return { arena: replay.arena as ArenaId, seed: replay.seed as number, score: Math.max(0, Math.round(replay.score as number)), outcome: replay.outcome === "dead" || replay.outcome === "cleared" ? replay.outcome : undefined, inputEvents, trail };
}

function sanitizeSave(value: Partial<SaveData>): SaveData {
  const medals = { ...EMPTY_SAVE.progress.medals };
  (Object.keys(medals) as ArenaId[]).forEach((arena) => {
    const candidate = value.progress?.medals?.[arena];
    if (typeof candidate === "number" && Number.isFinite(candidate)) medals[arena] = Math.max(0, Math.min(3, Math.floor(candidate)));
  });
  const bestScores: Partial<Record<ArenaId, number>> = {};
  (Object.keys(medals) as ArenaId[]).forEach((arena) => {
    const candidate = value.bestScores?.[arena];
    if (typeof candidate === "number" && Number.isFinite(candidate)) bestScores[arena] = Math.max(0, Math.round(candidate));
  });
  return {
    version: 1,
    progress: { tutorialDone: Boolean(value.progress?.tutorialDone), medals },
    settings: { sound: value.settings?.sound !== false, reducedMotion: Boolean(value.settings?.reducedMotion) },
    bestScores,
    lastReplay: sanitizeReplay(value.lastReplay),
  };
}

function readSave(): SaveData {
  if (typeof window === "undefined") return structuredClone(EMPTY_SAVE);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_SAVE);
    const value = JSON.parse(raw) as Partial<SaveData>;
    if (value.version !== 1 || !value.progress || !value.settings) return structuredClone(EMPTY_SAVE);
    return sanitizeSave(value);
  } catch {
    return structuredClone(EMPTY_SAVE);
  }
}

function writeSave(value: SaveData) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function todaySeed() {
  const date = new Date().toISOString().slice(0, 10);
  return hashSeed(Number(date.replaceAll("-", "")) + 8035);
}

function createRuntime(kind: "tutorial" | "run", arena: ArenaId, seed: number): Runtime {
  const config = kind === "tutorial" ? { ...ARENAS.driftway, sparkCount: 7, hazardCount: 1 } : ARENAS[arena];
  const sparks = Array.from({ length: config.sparkCount }, (_, index) => {
    const ring = 132 + seededUnit(seed, index + 10) * 86;
    const angle = seededUnit(seed, index + 30) * Math.PI * 2 + index * 0.31;
    return { index, pulse: seededUnit(seed, index + 50), x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
  });
  const hazards = Array.from({ length: config.hazardCount }, (_, index) => {
    const ring = 142 + seededUnit(seed, index + 70) * 108;
    const angle = seededUnit(seed, index + 90) * Math.PI * 2 + index * 0.61;
    return { index, nearMissed: false, x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
  });
  return {
    kind,
    arena,
    seed,
    frame: 0,
    orbit: makeOrbit(seed),
    tethered: false,
    pressed: false,
    pendingRelease: false,
    inputEvents: [],
    sparks,
    hazards,
    collected: new Set(),
    trail: [],
    score: 0,
    multiplier: 1,
    nearMisses: 0,
    collectedCount: 0,
    outcome: null,
    deathReason: "",
    lastTetherFrame: -999,
    paused: false,
  };
}

function replayRecordedRun(data: ReplayData) {
  const replay = createRuntime("run", data.arena, data.seed);
  const events = [...data.inputEvents].sort((a, b) => a.frame - b.frame);
  let eventIndex = 0;
  const frameLimit = Math.max(1, data.trail.length);
  for (let frame = 0; frame < frameLimit && replay.outcome === null; frame += 1) {
    while (events[eventIndex]?.frame <= replay.frame) {
      const event = events[eventIndex];
      replay.pressed = event.type === "press";
      replay.tethered = event.type === "press";
      if (event.type === "release") replay.pendingRelease = true;
      eventIndex += 1;
    }
    const releaseBoost = replay.pendingRelease ? 17 : 0;
    replay.pendingRelease = false;
    replay.orbit = stepOrbit(replay.orbit, replay.tethered, releaseBoost);
    replay.frame = replay.orbit.frame;
    replay.trail.push({ ...replay.orbit.position });
    replay.sparks.forEach((spark) => {
      if (!replay.collected.has(spark.index) && distance(replay.orbit.position, spark) < SPARK_HIT_RADIUS) {
        replay.collected.add(spark.index);
        replay.collectedCount += 1;
        replay.multiplier = Math.min(6, replay.multiplier + 0.35);
        replay.score += 100 * replay.multiplier;
      }
    });
    replay.hazards.forEach((hazard) => {
      const gap = distance(replay.orbit.position, hazard);
      if (!hazard.nearMissed && gap < HAZARD_NEAR_MISS_RADIUS && gap >= HAZARD_NEAR_MISS_MIN) {
        hazard.nearMissed = true;
        replay.nearMisses += 1;
        replay.multiplier = Math.min(6, replay.multiplier + 0.7);
        replay.score += 75 * replay.multiplier;
      }
      if (gap < HAZARD_COLLISION_RADIUS) replay.outcome = "dead";
    });
    const radius = Math.hypot(replay.orbit.position.x, replay.orbit.position.y);
    if (radius > SAFE_ORBIT_MAX || radius < SAFE_ORBIT_MIN) replay.outcome = "dead";
    replay.multiplier = Math.max(1, replay.multiplier - 0.0025);
    if (!replay.outcome && ARENAS[replay.arena].goalFrames && replay.frame >= (ARENAS[replay.arena].goalFrames ?? 0)) replay.outcome = "cleared";
  }
  return { score: Math.round(replay.score), trail: replay.trail, collectedCount: replay.collectedCount, nearMisses: replay.nearMisses };
}

function medalCount(config: ArenaConfig, runtime: Runtime): number {
  if (runtime.outcome !== "cleared" && config.id !== "endless") return 0;
  let medals = 1;
  if (runtime.score >= config.thresholds[0]) medals += 1;
  if (runtime.score >= config.thresholds[1] || runtime.nearMisses >= 5) medals += 1;
  return medals;
}

function formatScore(score: number) {
  return Math.round(score).toLocaleString("en-US");
}

function formatTime(frame: number) {
  const seconds = Math.floor(frame / 60);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  runtime: Runtime | null,
  screen: Screen,
  time: number,
  replayCursor: number,
  reducedMotion: boolean,
) {
  const width = 720;
  const height = 480;
  const center = { x: width / 2, y: height / 2 };
  const config = runtime ? ARENAS[runtime.arena] : ARENAS.driftway;
  const glow = config.color;
  ctx.clearRect(0, 0, width, height);
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#111d2a");
  background.addColorStop(0.55, "#101522");
  background.addColorStop(1, "#080b13");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 76; index += 1) {
    const x = (hashSeed(index * 73 + 17) % 700) + 10;
    const y = (hashSeed(index * 151 + 31) % 450) + 15;
    const pulse = 0.24 + (hashSeed(index + 11) % 70) / 180;
    const drift = reducedMotion ? 0 : Math.sin(time * 0.0005 + index) * 1.6;
    ctx.fillStyle = `rgba(214, 238, 255, ${pulse})`;
    ctx.fillRect(x + drift, y, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1);
  }

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.strokeStyle = "rgba(171, 221, 255, 0.08)";
  ctx.lineWidth = 1;
  [112, 166, 224, 286].forEach((radius) => {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([3, 8]);
  ctx.strokeStyle = "rgba(173, 228, 255, 0.18)";
  ctx.beginPath();
  ctx.arc(0, 0, 166, -0.58, Math.PI * 1.35);
  ctx.stroke();
  ctx.setLineDash([]);

  const planetGlow = ctx.createRadialGradient(0, 0, 18, 0, 0, 84);
  planetGlow.addColorStop(0, `${glow}99`);
  planetGlow.addColorStop(0.4, `${glow}33`);
  planetGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = planetGlow;
  ctx.beginPath();
  ctx.arc(0, 0, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1e3447";
  ctx.beginPath();
  ctx.arc(0, 0, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.66;
  ctx.beginPath();
  ctx.arc(-8, -8, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.74)";
  ctx.beginPath();
  ctx.arc(-13, -14, 3, 0, Math.PI * 2);
  ctx.fill();

  if (runtime) {
    runtime.sparks.forEach((spark) => {
      if (runtime.collected.has(spark.index)) return;
      const alpha = 0.42 + Math.sin(time * 0.006 + spark.pulse * 4) * 0.18;
      ctx.save();
      ctx.translate(spark.x, spark.y);
      ctx.rotate(time * 0.001 + spark.pulse);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });
    runtime.hazards.forEach((hazard) => {
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      ctx.rotate(time * 0.001 + hazard.index);
      ctx.fillStyle = "rgba(255, 116, 108, 0.17)";
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff736e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });
  }

  if (runtime && runtime.trail.length > 1) {
    const sourceTrail = runtime.replayTrail ?? runtime.trail;
    const trail = screen === "dead" ? sourceTrail.slice(0, replayCursor) : sourceTrail;
    ctx.strokeStyle = screen === "dead" ? "rgba(246, 212, 119, 0.7)" : `${glow}88`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }

  if (runtime && screen !== "menu" && runtime.outcome === null) {
    const player = runtime.orbit.position;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (runtime.tethered) {
      ctx.strokeStyle = `${glow}cc`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-player.x, -player.y);
      ctx.stroke();
    }
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#f4fbff";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  if (screen === "menu") {
    ctx.fillStyle = "rgba(7, 11, 19, 0.26)";
    ctx.fillRect(0, 0, width, height);
  }
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const screenRef = useRef<Screen>("menu");
  const replayCursorRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [screen, setScreenState] = useState<Screen>("menu");
  const [save, setSave] = useState<SaveData>(() => readSave());
  const [runtimeView, setRuntimeView] = useState<Runtime | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [hudTick, setHudTick] = useState(0);

  const setScreen = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const announce = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? "" : current)), 2600);
  }, []);

  const beep = useCallback(
    (frequency: number, duration = 0.07) => {
      if (!save.settings.sound || typeof window === "undefined") return;
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current ??= new AudioContextClass();
        const oscillator = audioRef.current.createOscillator();
        const gain = audioRef.current.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.035, audioRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioRef.current.currentTime + duration);
        oscillator.connect(gain).connect(audioRef.current.destination);
        oscillator.start();
        oscillator.stop(audioRef.current.currentTime + duration);
      } catch {
        // Audio is an enhancement; a blocked context never blocks the run.
      }
    },
    [save.settings.sound],
  );

  const persist = useCallback((next: SaveData) => {
    setSave(next);
    if (!writeSave(next)) setError("Local storage is unavailable; use Export save to keep a portable copy.");
  }, []);

  const startRun = useCallback(
    (arena: ArenaId) => {
      const seed = arena === "endless" ? todaySeed() : ARENAS[arena].seed;
      const nextRuntime = createRuntime("run", arena, seed);
      runtimeRef.current = nextRuntime;
      setRuntimeView({ ...nextRuntime });
      replayCursorRef.current = 0;
      setError("");
      setNotice("");
      setScreen("play");
    },
    [setScreen],
  );

  const startTutorial = useCallback(() => {
    const nextRuntime = createRuntime("tutorial", "driftway", 12035);
    runtimeRef.current = nextRuntime;
    setRuntimeView({ ...nextRuntime });
    replayCursorRef.current = 0;
    setError("");
    setNotice("");
    setScreen("tutorial");
  }, [setScreen]);

  const startReplay = useCallback(() => {
    if (!save.lastReplay) return;
    const replay = replayRecordedRun(save.lastReplay);
    const replayRuntime = createRuntime("run", save.lastReplay.arena, save.lastReplay.seed);
    replayRuntime.outcome = save.lastReplay.outcome ?? "cleared";
    replayRuntime.deathReason = replayRuntime.outcome === "dead" ? "Loaded saved trajectory." : "";
    replayRuntime.score = replay.score;
    replayRuntime.replayTrail = replay.trail;
    replayRuntime.replayVerified = replay.score === save.lastReplay.score;
    replayRuntime.inputEvents = save.lastReplay.inputEvents;
    replayRuntime.trail = save.lastReplay.trail;
    replayRuntime.collectedCount = replay.collectedCount;
    replayRuntime.nearMisses = replay.nearMisses;
    runtimeRef.current = replayRuntime;
    setRuntimeView({ ...replayRuntime });
    replayCursorRef.current = 0;
    setError("");
    setScreen("dead");
    announce(replayRuntime.replayVerified ? "Deterministic replay verified." : "Replay loaded with a score mismatch.");
  }, [announce, save.lastReplay, setScreen]);

  const finishTutorial = useCallback(() => {
    const next = { ...save, progress: { ...save.progress, tutorialDone: true } };
    persist(next);
    runtimeRef.current = null;
    setRuntimeView(null);
    setScreen("menu");
    announce("Safe orbit certified. Driftway is ready.");
  }, [announce, persist, save, setScreen]);

  const handleActionDown = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.paused || (screenRef.current !== "play" && screenRef.current !== "tutorial") || runtime.pressed) return;
    runtime.pressed = true;
    runtime.tethered = true;
    runtime.lastTetherFrame = runtime.frame;
    runtime.inputEvents.push({ frame: runtime.frame, type: "press" });
    beep(410, 0.05);
  }, [beep]);

  const handleActionUp = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.paused || !runtime.pressed) return;
    runtime.pressed = false;
    runtime.tethered = false;
    runtime.pendingRelease = true;
    runtime.inputEvents.push({ frame: runtime.frame, type: "release" });
    beep(680, 0.09);
  }, [beep]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        handleActionDown();
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        if (screenRef.current === "play" || screenRef.current === "tutorial") {
          const runtime = runtimeRef.current;
          if (runtime) {
            runtime.paused = !runtime.paused;
            if (runtime.paused) {
              runtime.pressed = false;
              runtime.tethered = false;
              runtime.pendingRelease = false;
            }
            setRuntimeView({ ...runtime });
            setNotice(runtime.paused ? "Paused" : "Flight resumed");
          }
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        handleActionUp();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", handleActionUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", handleActionUp);
    };
  }, [handleActionDown, handleActionUp]);

  const finishRun = useCallback(
    (runtime: Runtime) => {
      const config = ARENAS[runtime.arena];
      const medals = medalCount(config, runtime);
      const previous = save.progress.medals[runtime.arena] ?? 0;
      const replayData: ReplayData = {
        arena: runtime.arena,
        seed: runtime.seed,
        score: Math.round(runtime.score),
        outcome: runtime.outcome ?? "dead",
        inputEvents: runtime.inputEvents,
        trail: runtime.trail.slice(-3600),
      };
      const replay = replayRecordedRun(replayData);
      runtime.replayTrail = replay.trail;
      runtime.replayVerified = replay.score === replayData.score;
      const next: SaveData = {
        ...save,
        progress: {
          ...save.progress,
          medals: { ...save.progress.medals, [runtime.arena]: Math.max(previous, medals) },
        },
        bestScores: {
          ...save.bestScores,
          [runtime.arena]: Math.max(save.bestScores[runtime.arena] ?? 0, Math.round(runtime.score)),
        },
        lastReplay: {
          ...replayData,
        },
      };
      persist(next);
      beep(runtime.outcome === "cleared" ? 820 : 160, runtime.outcome === "cleared" ? 0.18 : 0.22);
    },
    [beep, persist, save],
  );

  const advanceRuntime = useCallback(
    (runtime: Runtime) => {
      if (runtime.outcome) return;
      const config = runtime.kind === "tutorial" ? { ...ARENAS.driftway, goalFrames: 60 * 9 } : ARENAS[runtime.arena];
      const releaseBoost = runtime.pendingRelease ? 17 : 0;
      runtime.pendingRelease = false;
      runtime.orbit = stepOrbit(runtime.orbit, runtime.tethered, releaseBoost);
      runtime.frame = runtime.orbit.frame;
      runtime.trail.push({ ...runtime.orbit.position });
      if (runtime.trail.length > 3600) runtime.trail.shift();

      const player = runtime.orbit.position;
      runtime.sparks.forEach((spark) => {
        if (!runtime.collected.has(spark.index) && distance(player, spark) < SPARK_HIT_RADIUS) {
          runtime.collected.add(spark.index);
          runtime.collectedCount += 1;
          runtime.multiplier = Math.min(6, runtime.multiplier + 0.35);
          runtime.score += 100 * runtime.multiplier;
          beep(740 + runtime.collectedCount * 14, 0.06);
        }
      });
      runtime.hazards.forEach((hazard) => {
        const gap = distance(player, hazard);
        if (!hazard.nearMissed && gap < HAZARD_NEAR_MISS_RADIUS && gap >= HAZARD_NEAR_MISS_MIN) {
          hazard.nearMissed = true;
          runtime.nearMisses += 1;
          runtime.multiplier = Math.min(6, runtime.multiplier + 0.7);
          runtime.score += 75 * runtime.multiplier;
          beep(520, 0.05);
        }
        if (gap < HAZARD_COLLISION_RADIUS) {
          runtime.outcome = "dead";
          runtime.deathReason = "A hazard clipped your wake.";
        }
      });
      const radius = Math.hypot(player.x, player.y);
      if (radius > SAFE_ORBIT_MAX || radius < SAFE_ORBIT_MIN) {
        runtime.outcome = "dead";
        runtime.deathReason = radius > SAFE_ORBIT_MAX ? "You escaped the safe orbit." : "You fell into the gravity well.";
      }
      runtime.multiplier = Math.max(1, runtime.multiplier - 0.0025);
      if (!runtime.outcome && config.goalFrames && runtime.frame >= config.goalFrames && (runtime.kind !== "tutorial" || runtime.inputEvents.length >= 2)) runtime.outcome = "cleared";
      if (runtime.outcome) {
        if (runtime.kind === "tutorial") finishTutorial();
        else {
          finishRun(runtime);
          replayCursorRef.current = 0;
          setRuntimeView({ ...runtime });
          setScreen("dead");
        }
      }
    },
    [beep, finishRun, finishTutorial, setScreen],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 720;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      if (screenRef.current === "play" || screenRef.current === "tutorial") {
        accumulator += elapsed;
        const activeRuntime = runtimeRef.current;
        while (accumulator >= FIXED_DT && activeRuntime && activeRuntime.outcome === null && !activeRuntime.paused) {
          advanceRuntime(activeRuntime);
          accumulator -= FIXED_DT;
        }
        if (activeRuntime && activeRuntime.frame % 6 === 0) {
          setHudTick((value) => value + 1);
          setRuntimeView({ ...activeRuntime });
        }
      } else if (screenRef.current === "dead") {
        const activeRuntime = runtimeRef.current;
        if (activeRuntime) replayCursorRef.current = Math.min(activeRuntime.trail.length, replayCursorRef.current + 2);
      }
      drawScene(context, runtimeRef.current, screenRef.current, now, replayCursorRef.current, save.settings.reducedMotion);
      animationFrame = window.requestAnimationFrame(loop);
    };
    animationFrame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [advanceRuntime, save.settings.reducedMotion]);

  const runtime = runtimeView;
  const currentConfig = runtime ? ARENAS[runtime.arena] : ARENAS.driftway;
  const totalMedals = Object.values(save.progress.medals).reduce((sum, count) => sum + count, 0);
  const unlocked = useMemo(
    () => ({
      redline: save.progress.tutorialDone && save.progress.medals.driftway >= 1,
      "black-halo": save.progress.medals.redline >= 2,
      endless: totalMedals >= 3,
    }),
    [save.progress.medals, save.progress.tutorialDone, totalMedals],
  );
  const currentMedals = runtime ? medalCount(currentConfig, runtime) : 0;

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    handleActionDown();
  };

  const resetProgress = () => {
    if (!window.confirm("Reset all local Orbit Thief progress and replays?")) return;
    persist(structuredClone(EMPTY_SAVE));
    runtimeRef.current = null;
    setRuntimeView(null);
    setScreen("menu");
    announce("Local progress reset.");
  };

  const exportSave = () => {
    const payload = JSON.stringify({ ...save, exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "orbit-thief-save.json";
    link.click();
    URL.revokeObjectURL(url);
    announce("Save file exported.");
  };

  const importSave = async (file: File) => {
    setError("");
    try {
      const value = JSON.parse(await file.text()) as Partial<SaveData>;
      if (value.version !== 1 || !value.progress || !value.settings || typeof value.progress.tutorialDone !== "boolean" || !value.progress.medals || typeof value.progress.medals.driftway !== "number") throw new Error("This save is not an Orbit Thief v1 file.");
      const next = sanitizeSave(value);
      persist(next);
      announce("Save imported. Your orbit is portable.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not read that save file.");
    }
  };

  const toggleSound = () => persist({ ...save, settings: { ...save.settings, sound: !save.settings.sound } });
  const toggleMotion = () => persist({ ...save, settings: { ...save.settings, reducedMotion: !save.settings.reducedMotion } });

  return (
    <main className="orbit-app">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("menu")} aria-label="Return to Orbit Thief menu"><span className="brand-mark">◈</span><span>ORBIT <i>{"//"}</i> THIEF</span></button>
        <div className="topbar-meta"><span className="status-dot" /><span>LOCAL FLIGHT DATA</span><span className="version-chip">v1.0</span></div>
      </header>

      {notice && <output className="toast">{notice}</output>}
      {error && <div className="error-toast" role="alert">{error}</div>}

      <div className="orbit-layout">
        <section className="stage-column">
          <div className="stage-heading"><div><p className="kicker">GRAVITY IS A SUGGESTION</p><h1>{screen === "menu" ? "Take the long way around." : currentConfig.name}</h1></div><div className="live-readout"><span>BEST</span><strong>{formatScore(save.bestScores[runtime?.arena ?? "driftway"] ?? 0)}</strong></div></div>

          <div className={`stage-shell ${screen === "play" || screen === "tutorial" ? "is-live" : ""}`}>
            <canvas ref={canvasRef} className="orbit-canvas" aria-label="Orbit Thief play field" onPointerDown={handleCanvasPointerDown} onPointerUp={handleActionUp} onPointerCancel={handleActionUp} />
            <div className="stage-corner stage-corner-top">{screen === "menu" ? "FLIGHT DECK / READY" : currentConfig.eyebrow}</div>
            <div className="stage-corner stage-corner-bottom">FIXED STEP 60HZ <span>•</span> SEED {runtime?.seed ?? "—"}</div>

            {screen === "menu" && <div className="stage-overlay menu-overlay"><span className="overlay-index">FIELD NOTE 035</span><h2>Steal momentum.<br /><em>Leave no orbit clean.</em></h2><p>Hold to tether. Release to sling. Every close call pays better than a safe one.</p><button className="primary-button" onClick={save.progress.tutorialDone ? () => startRun("driftway") : startTutorial}><span>{save.progress.tutorialDone ? "Launch Driftway" : "Run the safe tutorial"}</span><b>↗</b></button>{save.lastReplay && <button className="ghost-button replay-menu" onClick={startReplay}>Replay last flight · {formatScore(save.lastReplay.score)}</button>}</div>}
            {screen === "tutorial" && <div className="stage-overlay live-overlay"><div className="live-label"><span className="pulse-dot" /> SAFE TUTORIAL / {formatTime(runtime?.frame ?? 0)}</div><p>Hold <kbd>SPACE</kbd> to tether</p><p>Release to slingshot</p></div>}
            {screen === "play" && runtime && <div className="hud-row" aria-live="polite"><div><span>SCORE</span><strong>{formatScore(runtime.score)}</strong></div><div><span>MULTIPLIER</span><strong className="accent-text">×{runtime.multiplier.toFixed(1)}</strong></div><div><span>SPARKS</span><strong>{runtime.collectedCount}/{runtime.sparks.length}</strong></div><div><span>TIME</span><strong>{formatTime(runtime.frame)}</strong></div></div>}
            {screen === "play" && runtime?.paused && <div className="stage-overlay pause-overlay"><span className="result-badge">FLIGHT PAUSED</span><h2>Hold position.</h2><p>Press <kbd>P</kbd> or <kbd>ESC</kbd> to resume.</p></div>}
            {screen === "dead" && runtime && <div className="stage-overlay result-overlay"><span className={`result-badge ${runtime.outcome === "cleared" ? "cleared" : ""}`}>{runtime.outcome === "cleared" ? "ORBIT COMPLETE" : "SIGNAL LOST"}</span><h2>{runtime.outcome === "cleared" ? "Clean escape." : "The orbit got away."}</h2><p>{runtime.outcome === "cleared" ? "Your trajectory is banked. That route is yours now." : runtime.deathReason}</p><div className="result-score"><span>FINAL SCORE</span><strong>{formatScore(runtime.score)}</strong></div><div className="result-stats"><span><b>{currentMedals}</b> medals</span><span><b>{runtime.nearMisses}</b> near-misses</span><span><b>{runtime.collectedCount}</b> sparks</span></div><div className="result-actions"><button className="primary-button" onClick={() => startRun(runtime.arena)}>Retry run <b>↻</b></button><button className="ghost-button" onClick={() => setScreen("menu")}>Flight deck</button></div><div className="replay-note"><span>↝</span> {runtime.replayVerified ? "Deterministic replay verified" : "Replay score needs review"}</div></div>}
          </div>
          <div className="stage-footer"><span>ONE BUTTON / FULL COMMITMENT</span><span>NO ACCOUNT · SAVES STAY ON THIS DEVICE</span></div>
        </section>

        <aside className="control-panel">
          <div className="panel-section launch-section"><div className="section-label"><span>01</span> LAUNCH PAD</div><p className="panel-copy">Pick a lane. You only need one button, but you’ll need a feel for the release.</p><div className="arena-list">{(Object.keys(ARENAS) as ArenaId[]).map((arenaId) => { const arena = ARENAS[arenaId]; const locked = arenaId === "redline" ? !unlocked.redline : arenaId === "black-halo" ? !unlocked["black-halo"] : arenaId === "endless" ? !unlocked.endless : false; const medals = save.progress.medals[arenaId] ?? 0; return <button key={arenaId} className={`arena-card ${locked ? "locked" : ""} ${runtime?.arena === arenaId && screen !== "menu" ? "selected" : ""}`} disabled={locked} onClick={() => startRun(arenaId)}><span className="arena-color" style={{ background: arena.color }} /><span className="arena-copy"><small>{arena.eyebrow}</small><strong>{arena.name}</strong><em>{locked ? `Unlock at ${arenaId === "redline" ? "1 Driftway medal" : arenaId === "black-halo" ? "2 Redline medals" : "3 total medals"}` : arena.description}</em></span><span className="arena-medals" aria-label={`${medals} of 3 medals`}>{locked ? "⌁" : "✦".repeat(medals) || "·"}</span></button>; })}</div></div>

          <div className="panel-section score-section"><div className="section-label"><span>02</span> BANKED SCORE</div><div className="score-row"><span>Driftway</span><strong>{formatScore(save.bestScores.driftway ?? 0)}</strong></div><div className="score-row"><span>Redline</span><strong>{formatScore(save.bestScores.redline ?? 0)}</strong></div><div className="score-row"><span>Black Halo</span><strong>{formatScore(save.bestScores["black-halo"] ?? 0)}</strong></div><div className="score-row total"><span>Medals collected</span><strong>{totalMedals}<small>/ 12</small></strong></div></div>

          <div className="panel-section controls-section"><div className="section-label"><span>03</span> FLIGHT SYSTEMS</div><div className="setting-row"><span>Sound feedback</span><button className={`toggle ${save.settings.sound ? "on" : ""}`} onClick={toggleSound} aria-pressed={save.settings.sound}>{save.settings.sound ? "ON" : "OFF"}</button></div><div className="setting-row"><span>Reduced motion</span><button className={`toggle ${save.settings.reducedMotion ? "on" : ""}`} onClick={toggleMotion} aria-pressed={save.settings.reducedMotion}>{save.settings.reducedMotion ? "ON" : "OFF"}</button></div><div className="data-actions"><button onClick={exportSave}>Export save</button><button onClick={() => importRef.current?.click()}>Import save</button><input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSave(file); event.target.value = ""; }} /></div><button className="reset-link" onClick={resetProgress}>Reset local progress</button></div>

          <div className="help-card"><div className="help-icon">◌</div><div><strong>One-button flight</strong><p>Hold to tether into a tighter orbit. Release to sling past danger. A close call raises your multiplier.</p></div></div>
        </aside>
      </div>

      <footer className="site-footer"><span>ORBIT THIEF / A BROWSER SCORE ATTACK</span><span>LOCAL SAVE FORMAT 01 · PORTABLE REPLAYS</span><span>PRESS SPACE TO FLY</span></footer>
      <span className="visually-hidden" aria-live="polite">{hudTick}</span>
    </main>
  );
}
