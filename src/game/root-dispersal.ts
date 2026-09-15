import { speciesById } from './content';
import { SITE_STORIES } from './journey-content';
import type { DispersedRoot, RootFragment } from './journey-types';
import { horizontalDistance } from './random';
import type { Creature, GameState, Resource } from './types';

const ROOT_LIMIT = 32;
const RESOURCE_LIMIT = 512;
const TRAVEL_DISTANCE = 8;

export const ROOT_DISPERSAL_COPY = {
  acquired: 'Žrout nese živý úlomek. Další hostina dál od původních kořenů může založit malou mokrou oporu.',
  deposited: 'Žrout uložil živý úlomek. Nový výhonek drží část vody; původní kořeny zůstaly oslabené.',
  damaged: 'Žrout okusuje drobný výhonek. Jeho voda slábne.',
  destroyed: 'Žrout snědl drobný výhonek. Toto vlhké místo zaniklo.',
  carrier: 'Živý úlomek · žrout jej uloží při skutečném jídle dál než 8 m od původních kořenů.',
  guide: 'Detrit přivede žrouta a ponechá zvonkonoše u pastvy. Čelist a toxin mohou roznašeče odehnat nebo zahubit.',
  rootlet: (vitality: number) => `Drobný výhonek · voda ${Math.ceil(vitality)} %`,
  rootletHelp: 'Malá mokrá opora vyrostla z přeneseného kořene. Okus žroutů ji může zničit.',
  carrying: 'Žrout nese oddenek. Další skutečné jídlo dál než 8 m od původních kořenů jej zasadí. E láká potravou; čelist jej plaší.',
  planted: 'Oddenek zakořenil. Malý výhonek drží přenesenou část vody; původní kořeny zůstaly oslabené.',
  choice: 'Živý žrout může odnést oddenek. Oslabí původní pramen, ale příští jídlo dál od něj založí malé vlhké místo.',
  fragile: 'Okus žroutů může drobný výhonek zničit. Smrt nosiče ztratí nesený oddenek.',
} as const;

/** Presence opts a freshly authored line in. Historical worlds stay untouched. */
function dispersal(s: GameState) {
  return !s.journey.legacy && s.journey.version === 3 && s.stage === 2 && s.world.stage === 2
    && s.journey.rootDispersal?.version === 1 ? s.journey.rootDispersal : null;
}

export function rootCarrier(s: GameState, id: number): RootFragment | null {
  return dispersal(s)?.carried.find(fragment => fragment.carrierId === id) ?? null;
}

export function rootlet(s: GameState, id: number): DispersedRoot | null {
  return dispersal(s)?.roots.find(root => root.resourceId === id) ?? null;
}

/** Called only after a real NPC meal, before the caller's existing parent-root
 * damage. That damage is the transfer debit: this module must not subtract it a
 * second time, nor create a fragment from an already carried or child fragment. */
export function recordRootDispersalMeal(s: GameState, c: Creature, r: Resource): string | null {
  const state = dispersal(s);
  if (!state || !(c.health > 0) || speciesById(c.species)?.role !== 'invasive'
    || !s.world.creatures.some(creature => creature.id === c.id && creature.health > 0)
    || !s.world.resources.some(resource => resource.id === r.id)) return null;

  const child = state.roots.find(root => root.resourceId === r.id);
  if (child) child.vitality = Math.max(0, child.vitality - 12);
  const childNotice = child ? child.vitality > 0 ? ROOT_DISPERSAL_COPY.damaged : ROOT_DISPERSAL_COPY.destroyed : null;

  const fragment = state.carried.find(carried => carried.carrierId === c.id);
  if (fragment) {
    if (horizontalDistance(c.pos, fragment.origin) <= TRAVEL_DISTANCE || state.roots.length >= ROOT_LIMIT || s.world.resources.length >= RESOURCE_LIMIT) {
      return childNotice;
    }
    const site = s.journey.sites.find(site => site.stage === 2 && site.id === fragment.site);
    if (!site) return childNotice;
    // The two authored parent kinds are stable. The mother survives replacing
    // or losing its planted root, so carried tissue never depends on that ID.
    const kind = SITE_STORIES[site.id].kind;
    const patch = s.world.patches.reduce((closest, candidate) =>
      horizontalDistance(candidate.center, c.pos) < horizontalDistance(closest.center, c.pos) ? candidate : closest);
    const resource: Resource = { id: s.world.nextId++, kind, pos: { ...c.pos }, amount: 1, max: 1, regen: 0, patch: patch.id };
    s.world.resources.push(resource);
    state.roots.push({ resourceId: resource.id, site: fragment.site, vitality: fragment.vitality });
    state.carried = state.carried.filter(carried => carried !== fragment);
    return childNotice ? `${ROOT_DISPERSAL_COPY.deposited} ${childNotice}` : ROOT_DISPERSAL_COPY.deposited;
  }

  if (child || state.roots.length + state.carried.length >= ROOT_LIMIT) return childNotice;
  const site = s.journey.sites.find(site => site.stage === 2 && (site.id === 6 || site.id === 7)
    && site.plantedId === r.id && site.vitality > 0);
  if (!site) return null;
  state.carried.push({ carrierId: c.id, site: site.id, origin: { ...r.pos }, vitality: Math.min(12, site.vitality) });
  return ROOT_DISPERSAL_COPY.acquired;
}

/** No clock, regrowth or RNG: death loses carried tissue, and only physically
 * destroyed roots disappear. Eating a rootlet's food portion does not dry it. */
export function stepRootDispersal(s: GameState): void {
  const state = dispersal(s);
  if (!state) return;
  const liveCarriers = new Set(s.world.creatures.filter(c => c.health > 0 && speciesById(c.species)?.role === 'invasive').map(c => c.id));
  state.carried = state.carried.filter(fragment => liveCarriers.has(fragment.carrierId));
  const deadRoots = new Set(state.roots.filter(root => root.vitality <= 0).map(root => root.resourceId));
  if (deadRoots.size) s.world.resources = s.world.resources.filter(resource => !deadRoots.has(resource.id));
  const resources = new Set(s.world.resources.map(resource => resource.id));
  state.roots = state.roots.filter(root => root.vitality > 0 && resources.has(root.resourceId));
}
