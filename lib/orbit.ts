export const FIXED_DT = 1 / 60;
export const MU = 72_000;
export const SPARK_HIT_RADIUS = 19;
export const HAZARD_NEAR_MISS_RADIUS = 58;
export const HAZARD_NEAR_MISS_MIN = 22;
export const HAZARD_COLLISION_RADIUS = 21;
export const SAFE_ORBIT_MIN = 70;
export const SAFE_ORBIT_MAX = 306;

export type HazardContact = "collision" | "buffer" | "near-miss" | "clear";
export type TerminalReason = "collision" | "escape" | "well" | null;

export type Vec2 = { x: number; y: number };

export type OrbitState = {
  position: Vec2;
  velocity: Vec2;
  frame: number;
};

export function hashSeed(seed: number): number {
  let value = seed | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return value >>> 0;
}

export function seededUnit(seed: number, index: number): number {
  return hashSeed(seed + Math.imul(index + 1, 0x9e3779b9)) / 4_294_967_295;
}

export function length(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

export function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector) || 1;
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

export function stepOrbit(state: OrbitState, tethered: boolean, releaseBoost = 0): OrbitState {
  const radius = length(state.position);
  const radial = normalize(state.position);
  const tangent = { x: -radial.y, y: radial.x };
  const gravity = MU / Math.max(radius * radius, 1);
  const acceleration = { x: -radial.x * gravity, y: -radial.y * gravity };
  const nextVelocity = {
    x: state.velocity.x + acceleration.x * FIXED_DT,
    y: state.velocity.y + acceleration.y * FIXED_DT,
  };

  if (tethered) {
    const nextRadius = Math.max(118, radius - 7 * FIXED_DT);
    const orbitalSpeed = Math.sqrt(MU / nextRadius) * 1.05;
    return {
      frame: state.frame + 1,
      position: {
        x: radial.x * nextRadius,
        y: radial.y * nextRadius,
      },
      velocity: {
        x: tangent.x * (orbitalSpeed + releaseBoost),
        y: tangent.y * (orbitalSpeed + releaseBoost),
      },
    };
  }

  const updatedVelocity = {
    x: nextVelocity.x + tangent.x * releaseBoost,
    y: nextVelocity.y + tangent.y * releaseBoost,
  };
  return {
    frame: state.frame + 1,
    position: {
      x: state.position.x + updatedVelocity.x * FIXED_DT,
      y: state.position.y + updatedVelocity.y * FIXED_DT,
    },
    velocity: updatedVelocity,
  };
}

export function makeOrbit(seed: number): OrbitState {
  const angle = seededUnit(seed, 0) * Math.PI * 2;
  const radius = 164;
  const speed = Math.sqrt(MU / radius) * 1.05;
  const radial = { x: Math.cos(angle), y: Math.sin(angle) };
  return {
    frame: 0,
    position: { x: radial.x * radius, y: radial.y * radius },
    velocity: { x: -radial.y * speed, y: radial.x * speed },
  };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function classifyHazardGap(gap: number): HazardContact {
  if (gap < HAZARD_COLLISION_RADIUS) return "collision";
  if (gap < HAZARD_NEAR_MISS_MIN) return "buffer";
  if (gap < HAZARD_NEAR_MISS_RADIUS) return "near-miss";
  return "clear";
}

export function isSparkHit(gap: number): boolean {
  return gap < SPARK_HIT_RADIUS;
}

export function isOutsideSafeOrbit(radius: number): boolean {
  return radius > SAFE_ORBIT_MAX || radius < SAFE_ORBIT_MIN;
}

export function resolveTerminal(gap: number, radius: number): TerminalReason {
  const contact = classifyHazardGap(gap);
  if (contact === "collision") return "collision";
  if (radius > SAFE_ORBIT_MAX) return "escape";
  if (radius < SAFE_ORBIT_MIN) return "well";
  return null;
}

export function awardSpark(score: number, multiplier: number) {
  const nextMultiplier = Math.min(6, multiplier + 0.35);
  return { score: score + 100 * nextMultiplier, multiplier: nextMultiplier };
}

export function awardNearMiss(score: number, multiplier: number) {
  const nextMultiplier = Math.min(6, multiplier + 0.7);
  return { score: score + 75 * nextMultiplier, multiplier: nextMultiplier };
}
