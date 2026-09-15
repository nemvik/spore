import { attachmentAngles, attachmentPoint } from './anatomy';
import { computeStats, functionalProfile } from './genome';
import { reefConditions } from './reef-layout';
import { locomotionProfile, reefRespiration } from './physiology';
import type { LocomotionProfile } from './physiology';
import type { Genome, Vec3, World } from './types';

export interface ReefBodyProfile {
  /** Ordinary water controls after drag; speeds are metres/s, turn is radians/s. */
  motion: LocomotionProfile;
  /** Maximum local fraction of gas removed, before spatial falloff; never oxygen creation. */
  purification: number;
  /** Metres from the body centre; zero when the filter is closed or absent. */
  filterRadius: number;
  /** Additional energy/s while pumping, separate from ordinary metabolism and meals. */
  pumpEnergy: number;
  /** Upward metres/s, to add after controlled vertical thrust. Shells reduce this lift. */
  buoyancy: number;
  /** Relative oxygen volume, in the same units as computeStats().oxygen. */
  breathCapacity: number;
  /** Horizontal diameter in metres, including spread fins and an open filter.
   * This is a presentation/clearance measure, not permission to treat soft fins as rigid walls. */
  span: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Opt-in reef physiology only. The caller owns campaign/version routing; this
 * function never changes global stats, prices, a saved genome, or other stages.
 * Validated genomes are expected. Pumping is a continuous latch in [0, 1], not
 * an organ requirement: every body can swim and dive without a filter or lungs.
 */
export function reefBodyProfile(genome: Genome, pumping = 0): ReefBodyProfile {
  const opening = Number.isFinite(pumping) ? clamp(pumping, 0, 1) : 0;
  const base = locomotionProfile(genome, 1, false), stats = computeStats(genome);
  let filterArea = 0, filterLever = 0, finArea = 0, stabilization = 0;
  let gillArea = 0, air = 0, bladder = 0, shell = 0;
  let halfSpan = .68 * genome.width;
  for (const part of genome.parts) {
    const pair = part.mirrored ? 1.6 : 1;
    const tissue = part.scale * pair, area = part.scale * part.scale * pair;
    if (part.kind === 'filter') {
      // A forward crown meets the water; one tucked beside the tail is partly
      // shadowed by the trunk. Both work, at every legal attachment position.
      const exposedArea = area * (.6 + .4 * (part.axial + 1) / 2);
      filterArea += exposedArea;
      filterLever += exposedArea * Math.abs(part.axial);
    }
    if (part.kind === 'fins') {
      const lateral = .55 + .45 * Math.abs(Math.sin(part.angle));
      finArea += area * lateral;
      stabilization += tissue * lateral * (1.2 - .45 * (part.axial + 1) / 2);
    }
    if (part.kind === 'gills') gillArea += area;
    if (part.kind === 'lungs') air += tissue;
    if (part.kind === 'bladder') bladder += tissue;
    if (part.kind === 'shell') shell += tissue;
    if (part.kind === 'filter' || part.kind === 'fins') {
      for (const angle of attachmentAngles(part)) {
        const point = attachmentPoint(part.axial, angle, genome.length, genome.width);
        const extension = part.kind === 'filter' ? part.scale * (.18 + .7 * opening) : .85 * part.scale * Math.abs(Math.sin(angle));
        halfSpan = Math.max(halfSpan, Math.abs(point.x) + extension);
      }
    }
  }
  const openArea = filterArea * opening;
  // Surface grows faster than tissue investment. Large fins give control but
  // cannot buy ever faster travel; an opened crown is a substantial water brake.
  const passiveDrag = .17 * finArea + .045 * gillArea;
  const pumpDrag = 1.2 * openArea;
  const grip = 1 + .24 * stabilization / (1 + stabilization);
  const lift = .95 * -Math.expm1(-air * .75) + .45 * -Math.expm1(-bladder * .75);
  return {
    motion: {
      speed: base.speed / (1 + passiveDrag + pumpDrag),
      turnRate: base.turnRate / (1 + .18 * passiveDrag + .25 * filterLever * opening),
      acceleration: base.acceleration / (1 + .4 * passiveDrag + .75 * pumpDrag),
      steeringGrip: base.steeringGrip * grip / (1 + .22 * pumpDrag),
      verticalThrust: base.verticalThrust / (1 + .3 * passiveDrag + .65 * pumpDrag),
    },
    purification: .9 * -Math.expm1(-openArea * .95),
    filterRadius: 3.2 * Math.sqrt(openArea),
    pumpEnergy: .8 * openArea,
    buoyancy: lift / (1 + shell * 1.25),
    // A modest extra air reserve complements buoyancy and gas avoidance; it is
    // not an infinite underwater refill or the sole advantage of an air body.
    breathCapacity: stats.oxygen + air * 35,
    span: halfSpan * 2,
  };
}

/** Oxygen percentage points/s. Dense gas crosses exposed gills disproportionately;
 * clear water still supports indefinite gill breathing. This makes concentration,
 * local filtration and air storage consequential without an organ requirement.
 * The caller supplies locally purified oxygenUse. The filter does not make oxygen
 * by itself. A larger reservoir changes percentage rates, including surface refill. */
export function reefBodyRespiration(genome: Genome, world: World, pos: Vec3, effort: number, oxygenUse?: number): number {
  if (world.stage !== 1) return 0;
  const capacity = reefBodyProfile(genome).breathCapacity;
  const gas = oxygenUse ?? reefConditions(world, pos).oxygenUse;
  const uptake = pos.y > 10.5 ? 0 : gas * gas * functionalProfile(genome).gillExchange * .3;
  return (reefRespiration(genome, world, pos, effort, gas) * computeStats(genome).oxygen - uptake * 100) / capacity;
}
