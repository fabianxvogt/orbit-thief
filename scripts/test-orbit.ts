import {
  FIXED_DT,
  HAZARD_COLLISION_RADIUS,
  HAZARD_NEAR_MISS_MIN,
  HAZARD_NEAR_MISS_RADIUS,
  SAFE_ORBIT_MAX,
  SAFE_ORBIT_MIN,
  SPARK_HIT_RADIUS,
  distance,
  makeOrbit,
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

console.log("orbit fixtures: ok (3600 deterministic fixed steps + collision boundaries)");
