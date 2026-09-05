import {
  FIXED_DT,
  HAZARD_COLLISION_RADIUS,
  HAZARD_NEAR_MISS_MIN,
  HAZARD_NEAR_MISS_RADIUS,
  SAFE_ORBIT_MAX,
  SAFE_ORBIT_MIN,
  SPARK_HIT_RADIUS,
  awardNearMiss,
  awardSpark,
  classifyHazardGap,
  distance,
  isOutsideSafeOrbit,
  isSparkHit,
  makeOrbit,
  resolveTerminal,
  stepOrbit,
} from "../lib/orbit.ts";

const start = makeOrbit(35);
let state = start;
for (let frame = 0; frame < 3600; frame += 1) {
  state = stepOrbit(state, frame % 180 < 45, frame % 180 === 45 ? 16 : 0);
  if (![state.position.x, state.position.y, state.velocity.x, state.velocity.y].every(Number.isFinite)) {
    throw new Error(`non-finite orbit at frame ${frame}`);
  }
}

if (state.frame !== 3600) throw new Error("fixed-step frame count drifted");
if (distance(start.position, start.position) !== 0) throw new Error("distance identity failed");
if (FIXED_DT !== 1 / 60) throw new Error("fixed-step interval changed");
if (!(SPARK_HIT_RADIUS < HAZARD_COLLISION_RADIUS && HAZARD_COLLISION_RADIUS < HAZARD_NEAR_MISS_MIN && HAZARD_NEAR_MISS_MIN < HAZARD_NEAR_MISS_RADIUS)) throw new Error("collision boundary ordering failed");
if (!(SAFE_ORBIT_MIN < SAFE_ORBIT_MAX)) throw new Error("safe orbit boundary ordering failed");
if (HAZARD_COLLISION_RADIUS !== 21 || HAZARD_NEAR_MISS_MIN !== 22) throw new Error("hazard boundary fixture failed");
if (!isSparkHit(SPARK_HIT_RADIUS - 0.01) || isSparkHit(SPARK_HIT_RADIUS) || isSparkHit(SPARK_HIT_RADIUS + 0.01)) throw new Error("spark threshold fixture failed");
if (classifyHazardGap(HAZARD_COLLISION_RADIUS - 0.01) !== "collision" || classifyHazardGap(HAZARD_COLLISION_RADIUS) !== "buffer" || classifyHazardGap(HAZARD_NEAR_MISS_MIN) !== "near-miss" || classifyHazardGap(HAZARD_NEAR_MISS_RADIUS) !== "clear") throw new Error("hazard threshold fixture failed");
if (isOutsideSafeOrbit(SAFE_ORBIT_MIN - 0.01) !== true || isOutsideSafeOrbit(SAFE_ORBIT_MIN) || isOutsideSafeOrbit(SAFE_ORBIT_MAX) || isOutsideSafeOrbit(SAFE_ORBIT_MAX + 0.01) !== true) throw new Error("safe orbit threshold fixture failed");
if (resolveTerminal(HAZARD_COLLISION_RADIUS - 0.01, SAFE_ORBIT_MAX + 1) !== "collision" || resolveTerminal(HAZARD_NEAR_MISS_RADIUS, SAFE_ORBIT_MAX + 1) !== "escape" || resolveTerminal(HAZARD_NEAR_MISS_RADIUS, SAFE_ORBIT_MIN - 1) !== "well") throw new Error("terminal precedence fixture failed");
const sparkAward = awardSpark(0, 1);
if (sparkAward.multiplier !== 1.35 || sparkAward.score !== 135) throw new Error("spark score fixture failed");
const nearMissAward = awardNearMiss(sparkAward.score, sparkAward.multiplier);
if (nearMissAward.multiplier !== 2.05 || nearMissAward.score !== 288.75) throw new Error("near-miss score fixture failed");

console.log("orbit fixtures: ok (3600 deterministic steps + exact collision/score boundaries)");
