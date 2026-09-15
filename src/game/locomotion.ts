import type { FunctionalProfile } from './genome';
import type { Vec3 } from './types';

export interface PlanarMotion {
  heading: number;
  velocity: { x: number; z: number };
}

/** Rotate an anatomical feeding origin into the same space as resources and prey. */
export function mouthWorldPosition(profile: Pick<FunctionalProfile, 'mouthOrigin'>, position: Vec3, heading: number): Vec3 {
  const { x, y, z } = profile.mouthOrigin, sine = Math.sin(heading), cosine = Math.cos(heading);
  return { x: position.x + x * cosine + z * sine, y: position.y + y, z: position.z - x * sine + z * cosine };
}

/**
 * Pure, camera-independent planar steering. Input is the requested world direction;
 * speed is the caller's final water/land/sprint speed. Movement follows the turning
 * body rather than strafing instantly toward input. Low-speed steering is more
 * responsive, and changing direction never applies an artificial stop multiplier.
 * The caller retains vertical velocity, currents, position integration and collision.
 * dt is a simulation step, bounded to 50 ms to tolerate a resumed browser frame.
 */
export function advanceLocomotion(
  state: PlanarMotion,
  input: { x: number; z: number },
  speed: number,
  profile: Pick<FunctionalProfile, 'turnRate' | 'acceleration' | 'steeringGrip'>,
  dt: number,
): PlanarMotion {
  if (!Number.isFinite(dt) || dt <= 0) return { heading: state.heading, velocity: { ...state.velocity } };
  const step = Math.min(.05, dt), demand = Math.min(1, Math.hypot(input.x, input.z));
  const cruisingSpeed = Math.max(0, speed), currentSpeed = Math.hypot(state.velocity.x, state.velocity.z);
  let heading = state.heading, turnAngle = 0, turnDuration = 0;
  if (demand > .001) {
    const targetHeading = Math.atan2(input.x, input.z);
    const error = Math.atan2(Math.sin(targetHeading - heading), Math.cos(targetHeading - heading));
    const launchAssist = 1 + .65 * (1 - Math.min(1, currentSpeed / Math.max(.1, cruisingSpeed)));
    const maxTurn = profile.turnRate * launchAssist * step;
    turnAngle = Math.max(-maxTurn, Math.min(maxTurn, error));
    turnDuration = Math.min(step, Math.abs(error) / (profile.turnRate * launchAssist));
    heading += turnAngle;
    heading = Math.atan2(Math.sin(heading), Math.cos(heading));
  }
  const nextSpeed = currentSpeed + (cruisingSpeed * demand - currentSpeed) * -Math.expm1(-profile.acceleration * step);
  if (nextSpeed < .0001) return { heading, velocity: { x: 0, z: 0 } };
  // Grip aligns existing momentum with the body without deleting speed during a turn.
  const velocityHeading = currentSpeed > .0001 ? Math.atan2(state.velocity.x, state.velocity.z) : state.heading;
  let lag = Math.atan2(Math.sin(velocityHeading - state.heading), Math.cos(velocityHeading - state.heading));
  // Exact exponential response to the body's constant-rate turn, then to its held
  // heading after reaching the requested direction. Endpoint-only interpolation
  // otherwise makes coarse simulation steps corner noticeably earlier.
  if (turnDuration > 0) {
    const response = -Math.expm1(-profile.steeringGrip * turnDuration);
    lag = lag * (1 - response) - turnAngle / turnDuration * response / profile.steeringGrip;
  }
  lag *= Math.exp(-profile.steeringGrip * (step - turnDuration));
  const direction = heading + lag;
  return { heading, velocity: { x: Math.sin(direction) * nextSpeed, z: Math.cos(direction) * nextSpeed } };
}
