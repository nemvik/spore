import { speciesGroundClearance } from './anatomy';
import { worldSpecies } from './npc-genome';
import { recordEcologyContact, recordEcologyMeal } from './ecology-catalog';
import { isOrganismStage, worldStageFor } from './stage';
import type { Creature, FoodKind, GameState, Resource, Vec3 } from './types';
import type { EcologySite } from './journey-types';
import { SITE_STORIES, JOURNEY_COPY, siteOutcome } from './journey-content';
import { hunterThreatening } from './hunter-appetite';
import { nurserySpecies, nurseryFood, awakenNursery, NURSERY_COPY } from './nursery';
import { canopyGuidance } from './canopy-guidance';
import { PROGRESSION_COPY } from './progression-copy.cs';
import { clamp, distance, groundHeight, horizontalDistance } from './random';
import { computeStats, functionalProfile, has } from './genome';
import { FOOD_LABEL, SPECIES } from './content';
import { lineBlocked } from './interactions';
import { surfaceY, spawnCreature } from './world';
import { authorVortex, vortexSourceAt } from './journey-layout';
import { reefWater, streamEffect, livingStreams } from './journey-network';
import { authorReef } from './reef-layout';
import { authorLandCrossing } from './land-crossing';
import { terraceGuidance } from './terrace-guidance';
import { landSiteSupport, livingLandNetwork, livingRootStrength } from './climate';
import { migrationActive, migrationTarget, wildCarriers, MIGRATION_COPY } from './migration';
import { authorCanopy, CANOPY_COPY, canopyForageTarget, canopyFlow, isAttachedCrust, releaseCanopyAfterMeal, stepCanopy } from './reef-canopy';
import { recordRootDispersalMeal, stepRootDispersal, ROOT_DISPERSAL_COPY } from './root-dispersal';

export function journeyNotice(s: GameState, text: string) {
  if (s.messages.at(-1)?.text === text && s.world.time - s.messages.at(-1)!.time < 3) return;
  s.messages.push({ id: Math.max(s.tick, s.messages.at(-1)?.id ?? 0) + 1, text, time: s.world.time });
  if (s.messages.length > 6) s.messages.shift();
}
export function insight(s: GameState, id: string, dna: number, text: string): boolean {
  if (s.journey.insights.includes(id)) return false;
  s.journey.insights.push(id); s.player.dna += dna; s.player.totalDna += dna;
  journeyNotice(s, `${text} +${dna} DNA`); return true;
}
export const activeSites = (s: GameState) => s.journey.sites.filter(site => site.stage === s.stage);
const location = (s: GameState, [x, y, z]: number[]): Vec3 => ({ x, y: s.stage === 0 ? 1.1 : s.stage === 2 ? surfaceY(2, x, z) : Math.max(y, groundHeight(x, z, 1) + 1.5), z });

/** Add authored relationships only to a fresh stage. Legacy worlds are never regenerated. */
export function initializeJourneyStage(s: GameState) {
  if (!isOrganismStage(s.stage)) return;
  if (s.journey.legacy || activeSites(s).length) return;
  const w = s.world;
  for (let patch = 0; patch < 3; patch++) {
    const id = s.stage * 3 + patch, story = SITE_STORIES[id];
    const source = location(s, story.source), refuges = story.refuges.map(p => location(s, p));
    const resource: Resource = { id: w.nextId++, kind: story.kind, pos: { ...source }, amount: 12, max: 12, patch, regen: .08 };
    w.resources.push(resource);
    const site: EcologySite = { id, stage: s.stage, patch, source, refuges, sourceId: resource.id, plantedId: null, vitality: 100, observed: false, resolved: false, method: null, threatIds: [], phase: 0 };
    s.journey.sites.push(site);
    // An uninterrupted body-width approach at every living node. Shelter lies alongside it.
    w.obstacles = w.obstacles.filter(o => ![source, ...refuges].some(p => horizontalDistance(p, o.pos) < o.radius + 4));
    const addStone = (p: Vec3, dx: number, dz: number, radius: number, height: number) => {
      const x = p.x + dx, z = p.z + dz;
      if (w.obstacles.some(o => horizontalDistance(o.pos, { x, z }) < o.radius + radius + .5)) return;
      w.obstacles.push({ id: w.nextId++, pos: { x, y: groundHeight(x, z, s.stage), z }, radius, height, kind: s.stage === 0 ? 'rock' : s.stage === 1 ? 'coral' : 'tree' });
    };
    for (const refuge of refuges) { addStone(refuge, -4.3, -1.5, 2.2, s.stage === 1 ? 7 : 8); addStone(refuge, 3.6, 3.5, 1.8, s.stage === 1 ? 5 : 7); }
    if (patch === 1) for (const offset of [[-10, -8], [11, 6], [-8, 11], [7, -12]]) addStone(source, offset[0], offset[1], 2.8, 7);
    if (patch === 2) for (let i = 0; i < 5; i++) addStone(location(s, [i % 2 ? 15 : -15, 4, 24 - i * 15]), 0, 0, 3.2, 8);
  }
  const vortex = activeSites(s).find(site => site.id === 1); if (vortex) authorVortex(w, vortex);
  if (s.stage === 1) authorReef(w, activeSites(s));
  // Each place has a food web instead of three copies of the entire species catalogue.
  w.creatures = w.creatures.filter((c, index) => {
    const role = worldSpecies(s.world,c.species).role;
    if (role === 'predator' || role === 'invasive') return true;
    if (role === 'partner') return c.patch === 2 || s.stage === 1 && c.patch === 1 && index % 2 === 0;
    return c.patch === 0 || c.patch === 1 && index % 2 === 0;
  });
  for (const site of activeSites(s)) {
    const residents = w.creatures.filter(c => c.patch === site.patch);
    const consumers = residents.filter(c => ['grazer', 'invasive'].includes(worldSpecies(s.world,c.species).role));
    consumers.forEach((c, i) => { c.pos = { ...site.source, x: site.source.x + Math.sin(i * 2.1) * 3, z: site.source.z + Math.cos(i * 2.1) * 3 }; c.hunger = 85; });
    residents.filter(c => worldSpecies(s.world,c.species).role === 'predator').forEach(c => {
      const crossing = site.patch === 0 ? { x: (site.source.x + site.refuges[0].x) / 2, y: site.source.y, z: (site.source.z + site.refuges[0].z) / 2 } : { ...site.source, x: site.source.x + 10, z: site.source.z + 3 };
      const options = [crossing, { ...crossing, x: crossing.x + 4 }, { ...crossing, z: crossing.z + 4 }, { ...site.source }];
      c.pos = options.find(p => !w.obstacles.some(o => horizontalDistance(p, o.pos) < o.radius + worldSpecies(s.world,c.species).size)) ?? { ...site.source }; c.hunger = 70;
    });
    site.threatIds = (s.stage === 2 ? consumers.filter(c => worldSpecies(s.world,c.species).role === 'invasive') : site.id === 3 ? residents.filter(c => worldSpecies(s.world,c.species).role === 'predator') : consumers).map(c => c.id);
  }
  authorCanopy(s);
  authorLandCrossing(s);
  if(w.creatureDesigns)for(const c of w.creatures)c.pos.y=groundHeight(c.pos.x,c.pos.z,2)+speciesGroundClearance(worldSpecies(w,c.species));
  journeyNotice(s, JOURNEY_COPY.stage[s.stage]);
}

/** Flow is shared by physics and particles, in metres per second. Rocks create still pockets. */
export function environmentalFlow(s: GameState, pos: Vec3): Vec3 {
  if (s.journey.legacy || s.stage === 2) return { x: 0, y: 0, z: 0 };
  if (s.stage === 1) {
    const water = reefWater(s, pos).flow, canopy = canopyFlow(s, pos), network = streamEffect(s, pos).flow;
    return { x: water.x + network.x, y: water.y + canopy.y + network.y, z: water.z + network.z };
  }
  const center = s.world.patches[1].center;
  const dx = pos.x - center.x, dz = pos.z - center.z, r = Math.hypot(dx, dz);
  if (s.world.obstacles.some(o => horizontalDistance(o.pos, pos) < o.radius + 2.3)) return { x: 0, y: 0, z: 0 };
  const network = streamEffect(s, pos).flow;
  if (r > 28 || r < 1) return network;
  const strength = 3.8 * Math.sin(Math.min(1, r / 26) * Math.PI / 2);
  return { x: network.x - dz / r * strength, z: network.z + dx / r * strength, y: 0 };
}

export interface JourneyAction { site: EcologySite | null; pos: Vec3; label: string; detail: string; ready: boolean; operation: 'observe' | 'take' | 'take-meat' | 'take-food' | 'plant' | 'offer' | 'nourish' | 'awaken'; distance: number; resourceId?: number }
export function journeyAction(s: GameState, offering = false): JourneyAction | null {
  if (s.journey.legacy) return null;
  const p = s.player, sites = activeSites(s), cargo = s.journey.cargo;
  const range = 3.8 + Math.max(0, functionalProfile(p.genome).feedReach - 4.3) * .7;
  const make = (site: EcologySite | null, pos: Vec3, label: string, detail: string, operation: JourneyAction['operation'], allowed = true): JourneyAction => {
    const d = distance(p.pos, pos), blocked = lineBlocked(s, p.pos, pos), reachable = d < range && !blocked;
    return { site, pos, label, detail: !allowed ? detail : blocked && d < range ? JOURNEY_COPY.blockedApproach : !reachable ? `${s.stage === 1 && pos.y - p.pos.y > 2.2 ? 'Výš · Q' : s.stage === 1 && p.pos.y - pos.y > 2.2 ? 'Níže · C' : 'Přibliž se'} · ${d.toFixed(1)} m` : p.cooldown > 0 ? JOURNEY_COPY.careCooldown(p.cooldown) : detail, ready: allowed && reachable && p.cooldown <= 0, operation, distance: d };
  };
  const mother = sites.find(site => site.id === 8);
  // Sampling remains available before founding a pasture. Once a culture or
  // actual care meal is in hand, T at the mother explicitly recovers local life.
  const nursery = !offering && sites.find(site => nurserySpecies(s, site) && distance(p.pos, site.source) < range
    && (site.id === 4 || site.plantedId !== null || cargo?.site === site.id && cargo.purpose === 'culture'
      || cargo?.purpose === 'food' && worldSpecies(s.world,nurserySpecies(s, site)!).diet.includes(cargo.kind)));
  if (nursery) {
    const copy = NURSERY_COPY[nurserySpecies(s, nursery)!], food = nurseryFood(s, nursery);
    return make(nursery, nursery.source, copy.label, food ? copy.help : copy.noFood, 'awaken', !!food);
  }
  if (s.journey.version !== 3 && !offering && migrationActive(s) && mother?.observed && cargo?.purpose === 'culture' && cargo.site === 8 && !wildCarriers(s).length && distance(p.pos, mother.source) < range) return make(mother, mother.source, MIGRATION_COPY.awaken, MIGRATION_COPY.awakenHelp, 'awaken');
  if (cargo) {
    const site = sites.find(x => x.id === cargo.site)!;
    const refuge = [...site.refuges].sort((a, b) => distance(p.pos, a) - distance(p.pos, b))[0];
    if (!offering && cargo.purpose === 'culture') return make(site, refuge, 'Založit živý porost', cargo.vitality < 20 ? 'Vzorek je příliš oslabený. Nabídni jej tvorům mimo kořenový kruh a vezmi nový.' : 'Zasadit kulturu; místní tvorové mohou přijít za potravou', 'plant', cargo.vitality >= 20);
    if (!offering) return make(site, p.pos, JOURNEY_COPY.foodCarried(FOOD_LABEL[cargo.kind]), JOURNEY_COPY.foodCannotPlant, 'plant', false);
    const here = { x: p.pos.x - Math.sin(p.heading) * 2, y: p.pos.y, z: p.pos.z - Math.cos(p.heading) * 2 };
    return make(site, here, 'Nabídnout nesenou potravu', 'E · položit sousto 2 m za tělem', 'offer');
  }
  if (offering) return null;
  const near = sites.map(site => ({ site, d: distance(p.pos, site.source) })).sort((a, b) => a.d - b.d)[0];
  const sourceInReach = near && near.d < range && !lineBlocked(s, p.pos, near.site.source);
  const food = s.world.resources.filter(r => r.amount >= 1 && !isAttachedCrust(s, r.id) && !sites.some(site => site.sourceId === r.id) && distance(r.pos, p.pos) < range)
    .sort((a, b) => Number(lineBlocked(s, p.pos, a.pos)) - Number(lineBlocked(s, p.pos, b.pos)) || distance(a.pos, p.pos) - distance(b.pos, p.pos) || a.id - b.id)[0];
  // A mother in reach keeps its distinct observation/culture action. Elsewhere
  // a reachable ordinary portion wins over an unrelated distant source marker.
  if (food && !sourceInReach && (!lineBlocked(s, p.pos, food.pos) || !near || near.d > 15)) {
    const site = sites.find(site => site.patch === food.patch) ?? near?.site ?? sites[0];
    return { ...make(site, food.pos, JOURNEY_COPY.takeFood(FOOD_LABEL[food.kind]), JOURNEY_COPY.takeFoodHelp, food.kind === 'meat' ? 'take-meat' : 'take-food'), resourceId: food.id };
  }
  if (!near || near.d > 15) return null;
  const site = near.site, story = SITE_STORIES[site.id];
  if (!site.observed) return make(site, site.source, story.title, 'T · prozkoumat živý vztah', 'observe');
  if (site.id === 4 && s.journey.canopy?.releasedAt === null) return make(site, site.source, 'Řasa je ukotvená pod baldachýnem', CANOPY_COPY.attached, 'take', false);
  if (site.patch === 2 && site.stage < 2 && !(site.stage === 1 && s.journey.reefEvolution) && !sites.filter(x => x.patch < 2).every(x => x.resolved)) return make(site, site.source, 'Kultura čeká na živiny', 'Porost potřebuje živý přítok z obou okolních nik. Cestu živin ukazují světelné stopy.', 'take', false);
  if (site.resolved) return make(site, site.source, 'Živý zdroj pokračuje', 'T · odebrat vzorek pro nabídku potravy', 'take');
  return make(site, site.source, `Odebrat kulturu · ${story.title}`, JOURNEY_COPY.cultureTake(s.stage), 'take');
}

function resolve(s: GameState, site: EcologySite, method: NonNullable<EcologySite['method']>) {
  if (site.resolved) return;
  // A learned relationship does not heal tissue damaged during its actual journey.
  site.resolved = true; site.method = method; site.phase = 4;
  const patch = s.world.patches[site.patch]; patch.fertility = Math.max(1.15, patch.fertility); patch.pressure *= .25; patch.restored++;
  insight(s, `resolve:${site.id}`, 28, siteOutcome(site));
  s.journey.echoes.push(`${site.id}:${method}`);
  if (s.stage === 2 && site.patch < 2) s.world.landmarks.find(l => l.id === `spring-${site.patch}`)!.charge = 10;
}

export function actOnJourney(s: GameState, offering = false): boolean {
  if (!isOrganismStage(s.stage)) return false;
  const action = journeyAction(s, offering);
  if (!action) {
    if (offering && !s.journey.legacy) { journeyNotice(s, JOURNEY_COPY.emptyOffer); return true; }
    return false;
  }
  if (!action.ready) {
    journeyNotice(s, action.operation === 'plant' && s.journey.cargo?.purpose === 'culture'
      ? JOURNEY_COPY.plantNotDone(action.detail) : JOURNEY_COPY.actionNotDone(action.label, action.detail));
    return true;
  }
  const site = action.site!, p = s.player;
  p.cooldown = .8; p.feeding = .5;
  if (action.operation === 'awaken') {
    if (s.journey.version === 3) {
      const id = nurserySpecies(s, site);
      if (id) journeyNotice(s, awakenNursery(s, site) ? NURSERY_COPY[id].born : 'Zárodek potřebuje sousto a volný okraj porostu.');
      return true;
    }
    // Dormant spores provide a visible, player-driven recovery after extinction.
    // This action preserves cargo and never summons an actor at the distant home.
    if (wildCarriers(s).length) return true;
    const points = [2.6, 3.4, 4.2].flatMap(radius => Array.from({ length: 12 }, (_, i) => location(s, [site.source.x + Math.sin(i * Math.PI / 6) * radius, 0, site.source.z + Math.cos(i * Math.PI / 6) * radius])));
    const position = points.find(pos => !s.world.obstacles.some(o => horizontalDistance(pos, o.pos) < o.radius + .55));
    if (!position) { journeyNotice(s, 'Klidové spory potřebují volný okraj porostu.'); return true; }
    const carrier = spawnCreature(s.world, 'gloom', 2); carrier.pos = position;
    s.world.creatures.push(carrier); s.world.births++; journeyNotice(s, MIGRATION_COPY.awakened);
  } else if (action.operation === 'observe') {
    site.observed = true; site.phase = Math.max(1, site.phase);
    insight(s, `observe:${site.id}`, 12, site.id === 4 && s.journey.canopy ? CANOPY_COPY.closed : SITE_STORIES[site.id].problem);
  } else if (action.operation === 'take-meat' || action.operation === 'take-food') {
    const food = s.world.resources.find(r => r.id === action.resourceId && r.amount >= 1);
    if (food) { food.amount--; s.journey.cargo = { kind: food.kind, purpose: 'food', site: site.id, vitality: 100, distance: 0 }; journeyNotice(s, JOURNEY_COPY.foodTaken(FOOD_LABEL[food.kind])); }
  } else if (action.operation === 'take') {
    p.energy = Math.max(0, p.energy - 3);
    s.journey.cargo = { kind: SITE_STORIES[site.id].kind, purpose: 'culture', site: site.id, vitality: 100, distance: 0 };
    site.phase = Math.max(2, site.phase);
    recordEcologyContact(s, `culture:${site.id}`, 'culture', s.world.stage, site.patch as 0|1|2);
    insight(s, `carry:${site.id}`, 8, 'Život lze přenést. Cesta zpět nemusí být ta nejkratší.');
  } else if (action.operation === 'offer') {
    const cargo = s.journey.cargo!;
    // A real resource participates in the same food web as every naturally occurring meal.
    const id = s.world.nextId++;
    const patch = s.world.patches.reduce((a, b) => horizontalDistance(a.center, action.pos) <= horizontalDistance(b.center, action.pos) ? a : b);
    const amount = cargo.purpose === 'food' ? 1 : 5;
    s.world.resources.push({ id, kind: cargo.kind, pos: { ...action.pos }, amount, max: amount, patch: patch.id, regen: 0 });
    s.journey.offerings.push({ stage: s.stage, id, site: site.id, remaining: 120 });
    if (s.journey.offerings.length > 16) { const oldest = s.journey.offerings.shift()!; const world = s.worlds[worldStageFor(oldest.stage)]; if (world) world.resources = world.resources.filter(r => r.id !== oldest.id); }
    s.journey.cargo = null;
    journeyNotice(s, 'Nabídnutá potrava přitahuje konzumenty. Jejich shluk může přivést lovce.');
  } else if (action.operation === 'plant') {
    const cargo = s.journey.cargo!;
    if (cargo.purpose !== 'culture') { journeyNotice(s, JOURNEY_COPY.foodCannotPlant); return true; }
    if (cargo.vitality < 20) { journeyNotice(s, 'Vzorek je příliš oslabený. Vrať se pro nový nebo jej nabídni jako potravu.'); return true; }
    if (site.plantedId !== null) s.world.resources = s.world.resources.filter(r => r.id !== site.plantedId);
    const id = s.world.nextId++;
    s.world.resources.push({ id, kind: cargo.kind, pos: { ...action.pos }, amount: 8, max: 12, patch: site.patch, regen: .09 });
    site.plantedId = id; site.phase = Math.max(3, site.phase); site.vitality = cargo.vitality; s.journey.cargo = null;
    journeyNotice(s, site.patch === 0 ? 'Porost zakořenil. Doprovoď konzumenty k nové potravě; odlákej nebo zadrž lovce.' : 'Kultura zakořenila a mění okolí.');
    if (site.id === 8) {
      site.phase = 3; // A new root needs a new ecological arrival; learned DNA stays.
      journeyNotice(s, MIGRATION_COPY.planted);
    } else if (site.id === 4 && s.journey.canopy) journeyNotice(s, s.journey.reefEvolution ? 'Novou pastvu musí ochutnat plachtovec. Horní opora vytáhne výstup z průduchu; boční zátoka přivede čistší vodu do hloubky.' : CANOPY_COPY.planted);
    else if (site.id === 1 || site.id === 4 || site.patch === 2) resolve(s, site, 'cultivate');
  }
  return true;
}

/** Offers and transplanted food alter actual NPC targets, not a progress counter. */
export function journeyForageTarget(s: GameState, c: Creature): Resource | null {
  if (s.journey.legacy) return null;
  const crust = canopyForageTarget(s, c); if (crust) return crust;
  // A fed invader stops damaging roots. Native grazers still investigate a new
  // colony: requiring them to become hungry would turn restoration into waiting.
  if (worldSpecies(s.world,c.species).role === 'invasive' && c.hunger <= 28) return null;
  const diet = worldSpecies(s.world,c.species).diet;
  const plants = activeSites(s).filter(site => site.plantedId !== null).map(site => site.plantedId);
  if (s.stage === 2) plants.push(...(s.journey.rootDispersal?.roots.filter(root => root.vitality > 0).map(root => root.resourceId) ?? []));
  const newRoots = [...plants];
  if (s.stage === 1 && s.journey.canopy && s.journey.canopy.releasedAt !== null) plants.push(activeSites(s).find(site => site.id === 4)!.sourceId);
  let offers = s.journey.offerings.filter(o => o.stage === s.stage && o.remaining > 0).map(o => o.id);
  if (s.journey.version === 3) {
    // Move the invitation when the player moves one portion of a larger pile.
    // Notice the latest compatible local signal BEFORE checking its remaining
    // food. After that meal is eaten, older piles are ordinary food; an eligible
    // living root can receive the animal instead of the old lure winning again.
    // Empty resources persist with their marker until normal expiry. A missing,
    // expired, incompatible or distant invitation cannot suppress a useful one.
    const invitation = s.world.resources.filter(r => offers.includes(r.id) && diet.includes(r.kind) && distance(c.pos, r.pos) < 30)
      .sort((a, b) => Number(lineBlocked(s, c.pos, a.pos)) - Number(lineBlocked(s, c.pos, b.pos))
        || offers.indexOf(b.id) - offers.indexOf(a.id))[0];
    offers = invitation ? [invitation.id] : [];
  }
  const habitat = s.world.patches[c.patch];
  // A rooted colony emits through its whole local habitat. A brief flight from
  // a hunter must not erase knowledge of the new food on the opposite bank.
  // The margin permits that flight, while distant habitats and carried offers
  // keep their local range. Gate colonies do not summon NPCs across the world.
  const inHabitat = (pos: Vec3) => habitat && horizontalDistance(pos, habitat.center) < habitat.radius + 8;
  return s.world.resources.filter(r => r.amount >= .5 && diet.includes(r.kind)
    && (plants.includes(r.id) || offers.includes(r.id))
    && (distance(c.pos, r.pos) < 30 || plants.includes(r.id) && r.patch === c.patch && inHabitat(c.pos) && inHabitat(r.pos)))
    .sort((a, b) => Number(offers.includes(b.id)) - Number(offers.includes(a.id))
      || Number(newRoots.includes(b.id)) - Number(newRoots.includes(a.id))
      // A fresh offering is a deliberate lure, even for an animal already at a
      // planted root. Still bounded by scent range, diet and a real approach.
      || Number(lineBlocked(s, c.pos, a.pos)) - Number(lineBlocked(s, c.pos, b.pos))
      || distance(c.pos, a.pos) - distance(c.pos, b.pos) || a.id - b.id)[0] ?? null;
}

export function recordConsumption(s: GameState, c: Creature, r: Resource) {
  recordEcologyMeal(s,c,r);
  if (s.journey.legacy) return;
  const dispersalNotice = recordRootDispersalMeal(s, c, r);
  if (dispersalNotice) journeyNotice(s, dispersalNotice);
  if (releaseCanopyAfterMeal(s, r)) journeyNotice(s, CANOPY_COPY.released);
  const site = activeSites(s).find(site => site.plantedId === r.id);
  if (!site) return;
  const role = worldSpecies(s.world,c.species).role;
  if (site.id === 8 && c.species === 'gloom' && c.health > 0 && site.vitality > 0 && site.phase < 5) {
    resolve(s, site, livingLandNetwork(s) ? 'cultivate' : 'guide');
    site.phase = 5;
    journeyNotice(s, MIGRATION_COPY.arrived); return;
  }
  if (s.stage < 2 && role === 'grazer') {
    const exposed = s.world.creatures.some(h => hunterThreatening(s, h) && distance(h.pos, r.pos) < 12 && !lineBlocked(s, h.pos, r.pos));
    if (!exposed) { resolve(s, site, 'cultivate'); if (site.id === 4 && s.journey.canopy) journeyNotice(s, s.journey.reefEvolution ? livingStreams(s).some(stream => stream.kind === 'lift') ? 'Plachtovec se nasytil. Horní pastva táhne vodu z průduchu vzhůru. Plyn dole zůstává.' : 'Plachtovec se nasytil. Hluboká pastva posílá částečně čistou vodu do průduchu.' : CANOPY_COPY.established); }
    else journeyNotice(s, 'Nová pastva je stále v dosahu lovce. Odveď jeho výpad za kryt, nabídni maso nebo zvol druhou oporu.');
  }
  if (s.stage === 2 && role === 'invasive') { site.vitality = Math.max(0, site.vitality - 12); if (!dispersalNotice) journeyNotice(s, 'Žrout okusuje mladé kořeny. Odlákej jej potravou nebo zasáhni do lovu.'); }
  if (s.stage === 2 && role === 'grazer' && !s.world.creatures.some(o => worldSpecies(s.world,o.species).role === 'invasive' && o.hunger > 28 && distance(o.pos, r.pos) < 10)) resolve(s, site, 'guide');
}

export function recordJourneyHunt(s: GameState, c: Creature, byPlayer = true, cause: 'combat' | 'starvation' | 'exposure' = 'combat') {
  if (s.journey.legacy) return;
  const site = activeSites(s).find(site => site.threatIds.includes(c.id));
  if (!site) return;
  if (!byPlayer && (cause !== 'combat' || !s.journey.offerings.some(o => o.stage === s.stage && o.remaining > 0 && o.id === c.target))) return;
  const remaining = site.threatIds.filter(id => s.world.creatures.some(o => o.id === id)).length;
  if (site.id === 0 && remaining === 1 || site.id === 3 && remaining === 0 || s.stage === 2 && site.patch < 2 && remaining === 0) {
    site.observed = true;
    resolve(s, site, 'hunt');
  }
}

export function stepJourney(s: GameState, dt: number, previous: Vec3, sprint: boolean) {
  if (s.journey.legacy) return;
  stepRootDispersal(s);
  const sites = activeSites(s), p = s.player;
  stepCanopy(s);
  // The mineral colony itself follows the vortex; marker and collision use this same position.
  const vortex = sites.find(x => x.id === 1);
  if (vortex) { Object.assign(vortex.source, vortexSourceAt(s.world.time)); Object.assign(s.world.resources.find(r => r.id === vortex.sourceId)!.pos, vortex.source); }
  if (s.journey.cargo?.purpose === 'culture') {
    const cargo = s.journey.cargo, flow = environmentalFlow(s, p.pos), profile = functionalProfile(p.genome);
    cargo.distance += distance(p.pos, previous);
    const sheltered = s.world.obstacles.some(o => horizontalDistance(o.pos, p.pos) < o.radius + 3);
    // Riding the chosen outlet carries the culture with its water. Fighting
    // down through that outlet still exposes it to the opposing current.
    const network = s.stage === 1 && s.journey.reefEvolution && p.velocity.y >= 0 ? streamEffect(s, p.pos).flow : { x: 0, y: 0, z: 0 };
    const exposure = Math.max(0, Math.hypot(flow.x - network.x, flow.y - network.y, flow.z - network.z) / profile.currentResistance - 1.3);
    const gasStress = s.stage === 1 && s.journey.reefEvolution && cargo.site === 5 ? reefWater(s, p.pos).oxygenUse * 5 : 0;
    cargo.vitality = clamp(cargo.vitality + dt * streamEffect(s, p.pos).nourishment - dt * ((sprint ? 3 : 0) + exposure * 3 + gasStress + (s.stage === 2 && p.moisture < 30 && !sheltered ? 3 : 0)), 0, 100);
    if (cargo.vitality <= 0) { s.journey.cargo = null; journeyNotice(s, JOURNEY_COPY.cultureLost(s.stage)); }
  }
  for (const offer of s.journey.offerings) if (offer.stage === s.stage) offer.remaining = Math.max(0, offer.remaining - dt);
  for (const offer of s.journey.offerings.filter(o => o.remaining <= 0)) { const world = s.worlds[worldStageFor(offer.stage)]; if (world) world.resources = world.resources.filter(r => r.id !== offer.id); }
  s.journey.offerings = s.journey.offerings.filter(o => o.remaining > 0);
  for (const site of sites) {
    if (s.stage === 1 && site.id === 4 && site.plantedId !== null) {
      const r = s.world.resources.find(r => r.id === site.plantedId);
      if (r && distance(r.pos, p.pos) < 6) p.oxygen = Math.min(100, p.oxygen + dt * 5);
    }
    if (site.plantedId !== null && site.vitality <= 0) {
      const r = s.world.resources.find(r => r.id === site.plantedId);
      if (r) { r.amount = 0; r.regen = 0; }
      s.world.resources = s.world.resources.filter(r => r.id !== site.plantedId);
      site.plantedId = null; site.phase = site.resolved ? 4 : 2;
      journeyNotice(s, JOURNEY_COPY.rootLost);
    }
    if (site.observed && site.patch === 0 && site.phase < 3 && s.world.creatures.filter(c => c.patch === 0 && worldSpecies(s.world,c.species).role === 'grazer').length === 0) {
      // A destroyed food web can recover through transplantation; no permanent campaign lock.
      site.vitality = Math.max(10, site.vitality);
    }
  }
  if (p.meals > 0) insight(s, 'first-meal', 6, 'Potrava drží tělo při životě. Nové vztahy a nové chutě mění jeho možnosti.');
}

export function journeyRequirements(s: GameState) {
  return activeSites(s).map(site => {
    const support = s.stage === 2 && !s.campaign.won ? site.patch < 2 ? landSiteSupport(s, site) : livingRootStrength(s, site) : 1;
    const arrival = site.id !== 8 || s.campaign.won || site.phase >= 5;
    return { label: SITE_STORIES[site.id].title, met: site.resolved && support > 0 && arrival, value: site.resolved ? support > 0 ? arrival ? 'žije' : 'čeká na spory' : 'poznáno · opora zanikla' : site.observed ? 'prozkoumáno' : 'neznámé' };
  });
}

/** The same living predicates select an ending and explain why it has not happened. */
export function journeyEndingStatus(s: GameState) {
  const sites = activeSites(s), home = sites.find(x => x.patch === 2);
  const network = livingLandNetwork(s), partners = s.player.bonds.filter(b => b.loyalty >= 35 && b.hunger < 70).length;
  const reservoir = has(s.player.genome, 'reservoir'), guided = home?.method === 'guide';
  const symbiosis = guided && s.player.bonds.length === 2 && partners === 2 && reservoir;
  const liveHome = !!home && home.resolved && home.phase >= 5 && livingRootStrength(s, home) > 0;
  let finale: 'restoration' | 'predator' | 'migration' | null = null;
  if (s.stage === 2 && liveHome) {
    if (network) finale = sites.filter(x => x.patch < 2).every(x => x.method === 'hunt') ? 'predator' : 'restoration';
    else if (symbiosis) finale = 'migration';
  }
  const detail = s.campaign.won ? PROGRESSION_COPY.sandbox : finale ? PROGRESSION_COPY.endingReady : !home || livingRootStrength(s, home) <= 0 ? PROGRESSION_COPY.rootNeeded : home.phase < 5 || !home.resolved ? MIGRATION_COPY.planted : PROGRESSION_COPY.supportNeeded;
  return { finale, detail, routes: [
    { label: PROGRESSION_COPY.network, met: network, value: PROGRESSION_COPY.networkValue(sites.filter(site => site.patch < 2 && site.resolved && landSiteSupport(s, site) > 0).length) },
    { label: PROGRESSION_COPY.symbiosis, met: symbiosis, value: PROGRESSION_COPY.symbiosisValue(partners, reservoir, guided) },
  ] };
}
export function journeyFinale(s: GameState): 'restoration' | 'predator' | 'migration' | null { return s.stage === 2 ? journeyEndingStatus(s).finale : null; }

export function plantedStatus(s: GameState, site: EcologySite): { title: string; text: string; choices: string[] } | null {
  const canopy = site.plantedId !== null ? canopyGuidance(s, site) : null;
  if (canopy) return canopy;
  const lost = site.plantedId !== null ? nurserySpecies(s, site) : null;
  if (lost) return { title: 'Pastva potřebuje živého návštěvníka', text: `${worldSpecies(s.world,lost).name} v této nice nepřežil. Samotná výsadba jeho návrat nezajistí.`, choices: [`Vrať se k mateřskému porostu. T · ${NURSERY_COPY[lost].label.toLowerCase()}.`, NURSERY_COPY[lost].help.replace('T · ', '')] };
  const terrace = terraceGuidance(s, site); if (terrace) return terrace;
  if (site.id === 8 && site.plantedId !== null && !s.campaign.won) return { title: site.phase >= 5 ? 'Spory našly domov' : 'Domov čeká na nosiče', text: site.phase >= 5 ? MIGRATION_COPY.needsSupport : MIGRATION_COPY.planted, choices: [wildCarriers(s).length ? MIGRATION_COPY.carry : MIGRATION_COPY.noWild, MIGRATION_COPY.water] };
  if (s.stage === 2 && site.patch < 2 && site.resolved && !s.campaign.won) {
    const support = landSiteSupport(s, site);
    if (support <= 0) return { title: JOURNEY_COPY.supportLost, text: site.method === 'hunt' ? JOURNEY_COPY.pressureReturned : JOURNEY_COPY.deadRootHistory, choices: [JOURNEY_COPY.recoverSupport, SITE_STORIES[site.id].choices[0]] };
    if (site.plantedId !== null) return { title: JOURNEY_COPY.livingSupport(Math.ceil(support * 100)), text: JOURNEY_COPY.liveRootHistory, choices: [JOURNEY_COPY.protectApproach, JOURNEY_COPY.keepNetwork] };
  }
  if (site.resolved || site.plantedId === null) return null;
  const plant = s.world.resources.find(r => r.id === site.plantedId); if (!plant) return null;
  const predator = s.world.creatures.some(c => hunterThreatening(s, c) && distance(c.pos, plant.pos) < 12 && !lineBlocked(s, c.pos, plant.pos));
  const invader = s.stage === 2 && s.world.creatures.some(c => worldSpecies(s.world,c.species).role === 'invasive' && c.hunger > 28 && distance(c.pos, plant.pos) < 10);
  const approaching = s.world.creatures.filter(c => worldSpecies(s.world,c.species).role === 'grazer' && c.intent === 'forage' && c.target === plant.id).length;
  return { title: JOURNEY_COPY.planted, text: invader ? JOURNEY_COPY.rootsUnderAttack : predator && s.stage < 2 ? JOURNEY_COPY.unsafePasture : JOURNEY_COPY.firstFeast, choices: [approaching ? JOURNEY_COPY.approaching(approaching) : JOURNEY_COPY.protectApproach, SITE_STORIES[site.id].choices[1]] };
}

export function journeyHint(s: GameState) {
  if (s.campaign.won) return { title: 'Svět tvé linie pokračuje', text: PROGRESSION_COPY.sandbox, choices: [], site: activeSites(s)[2] };
  const fragment = s.stage === 2 ? s.journey.rootDispersal?.carried.find(fragment => {
    const creature = s.world.creatures.find(c => c.id === fragment.carrierId);
    return creature && distance(creature.pos, s.player.pos) < 24;
  }) : undefined;
  if (fragment && s.journey.cargo?.purpose !== 'culture') return { title: 'Žrout přenáší kořeny', text: ROOT_DISPERSAL_COPY.carrying, choices: [ROOT_DISPERSAL_COPY.guide, ROOT_DISPERSAL_COPY.fragile], site: activeSites(s).find(site => site.id === fragment.site)! };
  if (s.journey.cargo) {
    const site = activeSites(s).find(x => x.id === s.journey.cargo!.site)!;
    if (s.journey.cargo.purpose === 'food') return { title: JOURNEY_COPY.foodCarried(FOOD_LABEL[s.journey.cargo.kind]), text: JOURNEY_COPY.foodHint(FOOD_LABEL[s.journey.cargo.kind]), choices: [JOURNEY_COPY.foodConsumers(SPECIES.filter(species => species.stage === s.stage && species.diet.includes(s.journey.cargo!.kind)).map(species => species.name).join(', ')), JOURNEY_COPY.foodPlacement], site };
    const lost = site.id !== 8 ? nurserySpecies(s, site) : null;
    if (lost) return { title: 'Kultura potřebuje živého návštěvníka', text: `${worldSpecies(s.world,lost).name} v této nice nepřežil. Nesenou kulturu si ponecháš při vyživení nového zárodku u mateřského porostu.`, choices: [`Vrať se k matce. T · ${NURSERY_COPY[lost].label.toLowerCase()}.`, NURSERY_COPY[lost].help.replace('T · ', '')], site };
    const terrace = terraceGuidance(s, site); if (terrace) return { ...terrace, site };
    if (site.id === 8) {
      const carriers = wildCarriers(s).sort((a, b) => distance(a.pos, s.player.pos) - distance(b.pos, s.player.pos)), nearest = carriers[0];
      const following = carriers.filter(c => c.intent === 'forage' && c.target === -1 && migrationTarget(s, c)).length;
      return { title: 'Přiveď do domova život', text: nearest ? MIGRATION_COPY.carriers(following, distance(nearest.pos, s.player.pos), nearest.health) : s.journey.version === 3 ? 'Žádný divoký nosič nezůstal. Vrať se k jižnímu mateřskému porostu a vyživ nový zárodek skutečným soustem.' : MIGRATION_COPY.noWild, choices: !nearest && s.journey.version === 3 ? [`T · ${NURSERY_COPY.gloom.label.toLowerCase()}`, NURSERY_COPY.gloom.help.replace('T · ', '')] : [MIGRATION_COPY.carry, following ? MIGRATION_COPY.water : MIGRATION_COPY.danger], site };
    }
    if (s.journey.reefEvolution && s.stage === 1 && site.id === 5) {
      const bodyAdvice = has(s.player.genome, 'filter') ? 'Otevřený filtr čistí okolí, ale brzdí. Mezerník · otevřít; pustit · zavřít.'
        : has(s.player.genome, 'lungs') ? 'Vzdušné komory drží tvůj dech; kulturu plyn dál ničí. Q · vystoupat do čiré vody.'
          : 'Vol krátký ponor mezi kamennými kapsami. Q · vrať sebe i kulturu do čiré vody.';
      return { title: 'Křehký zárodek průduchu', text: `Kultura ${Math.ceil(s.journey.cargo.vitality)} % · plyn ji oslabuje. Nad bublinami je čirá voda.`, choices: [bodyAdvice, 'Hluboká stuha tlumí plyn; horní opora žene vodu vzhůru.'], site };
    }
    return { title: 'Přenášíš život', text: `Kultura ${Math.ceil(s.journey.cargo.vitality)} % · najdi kořenový kruh. E nabídne vzorek tvorům. T jej zasadí až u vhodného kruhu.`, choices: [JOURNEY_COPY.cultureCare(s.stage), 'Nabídnutá potrava změní cestu konzumentů a lovců.'], site };
  }
  const sites = activeSites(s), nearby = [...sites].sort((a, b) => horizontalDistance(a.source, s.player.pos) - horizontalDistance(b.source, s.player.pos))[0];
  const needsAttention = (site: EcologySite) => !site.resolved || s.stage === 2 && !s.campaign.won && site.patch < 2 && landSiteSupport(s, site) <= 0;
  const home = sites.find(site => site.id === 8 && site.plantedId !== null && !s.campaign.won);
  const homeFood = home && s.world.resources.find(r => r.id === home.plantedId);
  const nearHome = homeFood && horizontalDistance(homeFood.pos, s.player.pos) < 20 ? home : undefined;
  const showNearby = nearby && (needsAttention(nearby) || s.stage === 2 && nearby.patch < 2) && horizontalDistance(nearby.source, s.player.pos) < 30;
  // Keep work in progress visible while the player leads an animal away from it.
  // An observed nearby encounter still takes precedence when deliberately revisited.
  const pending = sites.find(site => site.observed && site.plantedId !== null && !site.resolved);
  const site = nearHome ?? (showNearby && nearby.observed ? nearby : pending ?? (showNearby ? nearby : sites.find(needsAttention) ?? sites[2]));
  if (!site) return null;
  const story = SITE_STORIES[site.id], planted = plantedStatus(s, site);
  if (planted) return { ...planted, ...(s.journey.rootDispersal && site.stage === 2 && site.patch < 2 ? { choices: [planted.choices[0], ROOT_DISPERSAL_COPY.choice] } : {}), site };
  const canopy = canopyGuidance(s, site);
  if (canopy) return { ...canopy, site };
  const next = sites.find(needsAttention);
  const continuation = s.stage === 2 ? journeyEndingStatus(s).detail : next ? PROGRESSION_COPY.nextSite(SITE_STORIES[next.id].title) : PROGRESSION_COPY.nextPassage;
  const choices = s.journey.rootDispersal && site.stage === 2 && site.patch < 2 ? [story.choices[0], ROOT_DISPERSAL_COPY.choice] : story.choices;
  return { title: site.observed ? story.title : 'V krajině se něco děje', text: site.resolved ? siteOutcome(site) : site.observed ? story.problem : 'Přibliž se k mateřskému porostu a stiskni T. Světelné částice ukazují, co jej živí.', choices: site.resolved ? [continuation] : site.observed ? choices : [`${['Západně','Východně','Jižně'][site.patch]} od kolébky: ${s.world.patches[site.patch].name}. Hledej výrazný živý porost.`], site };
}
