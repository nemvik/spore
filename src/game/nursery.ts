import type { GameState, Resource, Species, Vec3 } from './types';
import type { EcologySite } from './journey-types';
import { speciesById } from './content';
import { speciesGroundClearance } from './anatomy';
import { distance, groundHeight, horizontalDistance } from './random';
import { obstacleSegmentEntry } from './obstacle-geometry';
import { spawnCreature, WORLD_BOUND } from './world';

const LOCAL_SPECIES: Readonly<Record<number, string>> = { 0: 'veil', 3: 'sail', 4: 'sail', 6: 'bell', 7: 'bell', 8: 'gloom' };

/** Local extinction, rather than a timer or a vacancy elsewhere, enables care.
 * Historical campaigns retain their original recovery and population rules. */
export function nurserySpecies(s: GameState, site: EcologySite): string | null {
  if (s.journey.version !== 3 || s.journey.legacy || s.campaign.won || s.player.health <= 0 || s.deathReason || !site.observed
    || site.stage !== s.stage || s.world.stage !== s.stage || !s.journey.sites.includes(site)) return null;
  const species = LOCAL_SPECIES[site.id];
  if (!species || site.id === 4 && (!s.journey.canopy || s.journey.canopy.releasedAt === null)) return null;
  return s.world.creatures.some(c => c.species === species && c.patch === site.patch && c.health > 0) ? null : species;
}

// Do not import interactions here: its journey affordance imports this module.
// The microscopic world uses infinite columns; later worlds have finite caps.
function blocked(s: GameState, from: Vec3, to: Vec3, padding = 0): boolean {
  return s.world.obstacles.some(o => obstacleSegmentEntry(from, to,
    s.stage === 0 ? { ...o, pos: { ...o.pos, y: 0 }, height: 2.2 } : o, padding) !== null);
}

/** Ordinary cargo represents one previously debited portion. Cultures remain
 * intact; a mother or nearby real meal can instead fund the new animal. */
export function nurseryFood(s: GameState, site: EcologySite): Resource | 'carried' | null {
  const id = nurserySpecies(s, site); if (!id) return null;
  const species = speciesById(id), cargo = s.journey.cargo;
  if (cargo?.purpose === 'food' && species.diet.includes(cargo.kind)) return 'carried';
  return s.world.resources.filter(r => r.amount >= 1 && species.diet.includes(r.kind)
    && distance(r.pos, site.source) < 4 && !blocked(s, site.source, r.pos))
    .sort((a, b) => Number(b.id === site.sourceId) - Number(a.id === site.sourceId) || a.id - b.id)[0] ?? null;
}

function nurseryPosition(s: GameState, site: EcologySite, species: Species): Vec3 | null {
  const radius = species.size * .6;
  // Keep recovery at the mother, including while the reef canopy rises.
  for (const ring of [1.2, 2.6, 4.2]) for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const p = { x: site.source.x + Math.cos(angle) * ring, y: site.source.y, z: site.source.z + Math.sin(angle) * ring };
    if (Math.abs(p.x) > WORLD_BOUND - radius || Math.abs(p.z) > WORLD_BOUND - radius) continue;
    if (s.stage === 0) p.y = 1.1;
    else if (s.stage === 2) p.y = groundHeight(p.x, p.z, 2) + speciesGroundClearance(species);
    else if (p.y < groundHeight(p.x, p.z, 1) + 1.3 || p.y > 12) continue;
    if (s.player.health > 0 && distance(s.player.pos, p) < radius + Math.max(.6, s.player.genome.width * .8) + .1) continue;
    if (s.world.creatures.some(c => c.health > 0 && distance(c.pos, p) < radius + speciesById(c.species).size * .6 + .1)) continue;
    if (s.world.obstacles.some(o => horizontalDistance(p, o.pos) < o.radius + radius
      && (s.stage === 0 || p.y > o.pos.y - radius && p.y < o.pos.y + o.height + radius))) continue;
    if (!blocked(s, site.source, p, radius)) return p;
  }
  return null;
}

/** The caller projects the player's ordinary T reach and sightline. Find space
 * before consuming anything: failed care never spends food, ids or saved RNG. */
export function awakenNursery(s: GameState, site: EcologySite): boolean {
  const id = nurserySpecies(s, site);
  if (!id || s.world.creatures.length >= 48) return false;
  const food = nurseryFood(s, site); if (!food) return false;
  const position = nurseryPosition(s, site, speciesById(id)); if (!position) return false;
  const child = spawnCreature(s.world, id, site.patch);
  child.pos = position; child.hunger = 70; child.velocity = { x: 0, y: 0, z: 0 };
  if (food === 'carried') s.journey.cargo = null; else food.amount -= 1;
  s.world.creatures.push(child); s.world.births++;
  return true;
}

export const NURSERY_COPY: Readonly<Record<string, { label: string; help: string; noFood: string; born: string }>> = {
  veil: {
    label: 'Probudit zárodek závojníka',
    help: 'T · jedno skutečné sousto řasy vyživí zárodek u mateřského porostu.',
    noFood: 'Zárodek potřebuje sousto řasy. Přines je klávesou T nebo nabídni řasu u matky klávesou E.',
    born: 'U mateřské řasy se rozvinul mladý závojník. Potřebuje bezpečnou pastvu.',
  },
  sail: {
    label: 'Probudit zárodek plachtovce',
    help: 'T · jedno skutečné sousto řasy nebo nektaru vyživí zárodek u matky.',
    noFood: 'Zárodek potřebuje sousto řasy nebo nektaru. Přines je klávesou T nebo nabídni potravu u matky klávesou E.',
    born: 'U matky se vylíhl plachtovec. Otevři mu bezpečnou cestu k pastvě.',
  },
  bell: {
    label: 'Probudit zárodek zvonkonoše',
    help: 'T · jedno skutečné sousto nektaru nebo řasy vyživí zárodek u mateřských kořenů.',
    noFood: 'Zárodek potřebuje sousto nektaru nebo řasy. Přines je klávesou T nebo nabídni potravu u kořenů klávesou E.',
    born: 'U kořenů se probudil zvonkonoš. Žrouti a lovci zůstávají součástí jeho světa.',
  },
  gloom: {
    label: 'Probudit zárodek prachokřídlíka',
    help: 'T · jedno skutečné sousto detritu nebo nektaru vyživí zárodek u matky. Živou kulturu si ponecháš.',
    noFood: 'Zárodek potřebuje sousto detritu nebo nektaru. Přines je klávesou T nebo nabídni potravu u matky klávesou E.',
    born: 'U mateřského porostu vyletěl prachokřídlík. Světlo kultury jej přiláká; domov musí skutečně navštívit.',
  },
};
