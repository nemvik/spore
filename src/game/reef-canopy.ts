import type { Creature, GameState, Resource, Vec3 } from './types';
import { distance, groundHeight, horizontalDistance } from './random';
import { lineBlocked } from './interactions';
import { awakenNursery, nurseryFood, nurserySpecies } from './nursery';

export const CANOPY_COPY = {
  closed: 'Řasu drží jedlá krusta pod stropem. Filtr nebo recyklátor ji spase; štítojem ji najde po cestě za detritem či minerály.',
  attached: 'Krusta je přirostlá. Mezerník · spást vhodnými ústy, nebo přilákat divokého štítojema.',
  released: 'Krusta povolila. Baldachýn se rozevírá a proud unáší řasu komínem. Plachtovci následují její světlo.',
  moving: 'Uvolněná řasa stoupá komínem. Zachyť vzorek cestou vzhůru; nemusíš čekat na hladinu.',
  planted: 'Novou pastvu musí bezpečně ochutnat plachtovec. Horní opora dává přehled; boční zátoka kryje příchod před lovcem.',
  established: 'Plachtovec se nasytil. Živá stuha teď čistí vodu a vede proud od zvolené opory k nočnímu průduchu.',
  approaches: 'Pod široký okraj lze vplout z boku. Úzká štěrbina mezi kořeny je zkratka pro štíhlé tělo.',
  worker: 'Štítojem následuje detrit i minerály. V lůžku tě chrání; krustu může spást jen jako divoký tvor.',
  awaken: 'Probudit zárodek plachtovce',
  awakenHelp: 'T · jedno skutečné sousto řasy vyživí zárodek u matky. Mladý plachtovec pak musí sám doplout k pastvě.',
  noNurseryFood: 'Zárodek potřebuje sousto řasy. Přines řasu klávesou T nebo ji nabídni u matky klávesou E.',
  born: 'Ze živené řasy se vylíhl plachtovec. Otevři mu bezpečnou cestu k nové pastvě.',
};

export function canopyNeedsGrazer(s: GameState): boolean {
  const site = s.journey.sites.find(site => site.id === 4);
  return !!site && nurserySpecies(s, site) === 'sail';
}

export function canopyNurseryFood(s: GameState): Resource | 'carried' | null {
  const site = s.journey.sites.find(site => site.id === 4);
  return site ? nurseryFood(s, site) : null;
}

/** Canopy care uses the same food and collision rules as every living nursery. */
export function awakenCanopyGrazer(s: GameState): boolean {
  const site = s.journey.sites.find(site => site.id === 4);
  return !!site && awakenNursery(s, site);
}

/** A single authored food/terrain relationship. Old worlds are never rebuilt. */
export function authorCanopy(s: GameState): void {
  if (s.stage !== 1 || s.journey.version !== 3 || s.journey.legacy || s.journey.canopy) return;
  const site = s.journey.sites.find(site => site.id === 4);
  if (!site || site.observed || site.resolved) return;
  const w = s.world, center = w.patches[1].center;
  const at = (x: number, y: number, z: number): Vec3 => ({ x: center.x + x, y, z: center.z + z });
  // The existing outer pillars remain. Below the roof there is a broad open
  // approach for every body; the chimney is a useful consequence, not the exit.
  w.obstacles = w.obstacles.filter(o => horizontalDistance(o.pos, center) >= o.radius + 15);
  const roofIds: number[] = [];
  for (const [x, z] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) {
    const id = w.nextId++; roofIds.push(id);
    w.obstacles.push({ id, kind: 'rock', pos: at(x, 1.5, z), radius: 6, height: 1.4 });
  }
  const capId = w.nextId++;
  w.obstacles.push({ id: capId, kind: 'rock', pos: at(0, 1.5, 0), radius: 4.3, height: 1.4 });
  for (const z of [-3.05, 3.05]) {
    const pos = at(-13, 0, z); pos.y = groundHeight(pos.x, pos.z, 1);
    w.obstacles.push({ id: w.nextId++, kind: 'rock', pos, radius: 1.9, height: 1.5 - pos.y });
  }
  const crustId = w.nextId++;
  // One real bite severs the attachment. The remainder is visible debris, with
  // no regeneration and no invisible extra work or cooldown requirement.
  w.resources.push({ id: crustId, kind: 'mineral', pos: at(0, -.25, 0), amount: 1, max: 1, regen: 0, patch: 1 });
  s.journey.canopy = { crustId, capId, roofIds, releasedAt: null };
  site.refuges = [at(0, 10.8, -2), at(-19, Math.max(-2.6, groundHeight(center.x - 19, center.z + 9, 1) + 2), 9)];
  // Keep naturally spawned food clear of a newly authored finite roof. Food
  // already beneath it is valid; no actor/food is teleported on later release.
  for (const r of w.resources) {
    if (r.id === crustId) continue;
    if (w.obstacles.some(o => (roofIds.includes(o.id) || o.id === capId) && horizontalDistance(r.pos, o.pos) < o.radius + 1.2 && r.pos.y > o.pos.y - 1.2 && r.pos.y < o.pos.y + o.height + 1.2)) r.pos.y = 4.2;
  }
  // A wild worker starts outside the attached crust's short scent range. It
  // needs a deliberate food trail, while the other approach is a feeding organ.
  w.creatures.filter(c => c.patch === 1 && c.species === 'mender').forEach((c, i) => {
    c.pos = at(-18 - i * 2, Math.max(-2.6, groundHeight(center.x - 18 - i * 2, center.z + 6, 1) + 2), 6);
    c.velocity = { x: 0, y: 0, z: 0 }; c.target = null;
  });
}

export function isAttachedCrust(s: GameState, id: number): boolean {
  return s.stage === 1 && s.journey.canopy?.releasedAt === null && s.journey.canopy.crustId === id;
}

/** Attached mineral can be bitten, but cannot be picked up as an ordinary lure. */
export function canopyForageTarget(s: GameState, c: Creature): Resource | null {
  const canopy = s.journey.canopy;
  if (s.stage !== 1 || !canopy || canopy.releasedAt !== null || c.species !== 'mender') return null;
  const crust = s.world.resources.find(r => r.id === canopy.crustId && r.amount >= .5);
  return crust && distance(c.pos, crust.pos) < 7 && !lineBlocked(s, c.pos, crust.pos) ? crust : null;
}

/** Returns true exactly on the bite that physically opens the roof. */
export function releaseCanopyAfterMeal(s: GameState, r: Resource): boolean {
  const canopy = s.journey.canopy;
  if (!isAttachedCrust(s, r.id) || !canopy || r.amount >= 1) return false;
  canopy.releasedAt = s.world.time;
  s.world.obstacles = s.world.obstacles.filter(o => o.id !== canopy.capId);
  return true;
}

/** The source itself rises. Picking it up is possible throughout the movement. */
export function stepCanopy(s: GameState): void {
  const canopy = s.journey.canopy;
  if (s.stage !== 1 || !canopy || canopy.releasedAt === null) return;
  const site = s.journey.sites.find(site => site.id === 4)!;
  const center = s.world.patches[1].center, startY = groundHeight(center.x, center.z, 1) + 3;
  const elapsed = Math.max(0, s.world.time - canopy.releasedAt);
  const y = Math.min(7.8, startY + elapsed * 1.15);
  const spread = Math.max(0, Math.min(1, (y - 4.8) / 3));
  Object.assign(site.source, { x: center.x + Math.sin(elapsed * .22) * 1.6 * spread, y, z: center.z + Math.cos(elapsed * .22) * 1.6 * spread });
  Object.assign(s.world.resources.find(r => r.id === site.sourceId)!.pos, site.source);
}

export function canopyFlow(s: GameState, pos: Vec3): Vec3 {
  const canopy = s.journey.canopy;
  if (s.stage !== 1 || !canopy || canopy.releasedAt === null) return { x: 0, y: 0, z: 0 };
  const center = s.world.patches[1].center;
  const weight = Math.max(0, 1 - horizontalDistance(pos, center) / 3.4) * Math.max(0, Math.min(1, (10.5 - pos.y) / 3));
  return { x: 0, y: 1.8 * weight, z: 0 };
}
