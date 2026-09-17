import { creatureCapabilities } from './creature-capabilities';
import type { CreatureAnatomy } from './creature-anatomy';
import { bodyWidth } from './body-shape';
import { computeStats, functionalProfile, has } from './genome';
import { reefConditions } from './reef-layout';
import type { Genome, Stage, Vec3, World } from './types';

export interface LocomotionProfile {
  /** Horizontal metres/s, already including the medium and ability to walk. */
  speed: number;
  turnRate: number;
  acceleration: number;
  steeringGrip: number;
  verticalThrust: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pairedLegOutput = -Math.expm1(-1.6 * .65);

/**
 * Water and historical saves retain their established movement exactly. New
 * terrestrial bodies push against the ground with legs: aquatic propulsion and
 * fin steering cannot improve their gait, but every retained organ still weighs
 * what computeStats says it weighs. Sprint and exhaustion are applied by callers.
 */
export function locomotionProfile(genome: Genome, stage: Stage, legacy = false, derived?: CreatureAnatomy): LocomotionProfile {
  if (genome.version === 2 && stage >= 2) return { ...creatureCapabilities(genome, derived).walk, verticalThrust: 0 };
  const stats = computeStats(genome, derived), aquatic = functionalProfile(genome, derived);
  if (stage < 2 || legacy) {
    const medium = stage === 2 ? Math.max(.35, stats.walk) : Math.max(.6, stats.swim);
    const mobility = stage === 2 && !has(genome, 'legs') ? .08 : 1;
    return { speed: stats.speed * medium * mobility, turnRate: aquatic.turnRate, acceleration: aquatic.acceleration, steeringGrip: aquatic.steeringGrip, verticalThrust: aquatic.verticalThrust };
  }

  let legs = 0, stance = 0;
  for (const part of genome.parts) {
    if (part.kind !== 'legs') continue;
    const tissue = part.scale * (part.mirrored ? 1.6 : 1);
    // A lateral stance near the body's centre plants turns more securely than
    // attachments concentrated at one tip. Every legal attachment remains usable.
    const central = 1 - Math.abs(part.axial), lateral = Math.abs(Math.sin(part.angle));
    legs += tissue;
    stance += tissue * (.82 + .18 * central) * (.88 + .12 * lateral);
  }
  if (legs === 0) return { speed: 0, turnRate: 1.35, acceleration: 7, steeringGrip: 7, verticalThrust: 0 };

  // One ordinary mirrored pair is the reference gait. Extra tissue helps with
  // diminishing returns; it also adds its existing mass, rather than buying a cap.
  const drive = -Math.expm1(-legs * .65) / pairedLegOutput;
  const footing = stance / legs;
  const excessLoad = Math.max(0, stats.mass - 1.2);
  const load = 1 + excessLoad * .15 + Math.max(0, bodyWidth(genome) - 1) * .12;
  const yawLoad = 1 + excessLoad * .24 + Math.max(0, genome.length - 1) * .45;
  const acceleration = clamp((7 + 5 * drive) * footing / load, 2, 18);
  return {
    speed: clamp((3 + 2.15 * drive) / load, 1.6, 6.8),
    turnRate: clamp((3.1 + 2.4 * drive) * footing / yawLoad, 1.35, 7),
    acceleration,
    steeringGrip: acceleration + 2.5 * drive * footing,
    verticalThrust: 0,
  };
}

/**
 * Oxygen percentage points/s for a current-journey reef body. Gills exchange
 * with the local water: clear water supplies oxygen, while a vent's visible gas
 * both displaces that oxygen and enters exposed gill tissue. Stored air avoids
 * most of that uptake but cannot refill underwater. Existing surface breathing
 * and the separate planted-root recovery remain available escape routes.
 */
export function reefRespiration(genome: Genome, world: World, pos: Vec3, effort: number, oxygenUse = reefConditions(world, pos).oxygenUse): number {
  if (world.stage !== 1) return 0;
  if (pos.y > 10.5) return 6;
  const stats = computeStats(genome), exchange = functionalProfile(genome).gillExchange;
  const gas = oxygenUse;
  const oxygenAvailability = clamp(1 - gas / 5, 0, 1);
  const exertion = Number.isFinite(effort) ? clamp(effort, 0, 1) : 0;
  const supply = exchange * oxygenAvailability;
  const demand = .4 * stats.metabolism + .8 * exertion + gas * (.2 + 1.2 * exchange / 6);
  return (supply - demand) * 100 / stats.oxygen;
}
