import type { GameState, Vec3, World } from './types';
import { worldStageFor, type WorldStage } from './stage';
import { WORLD_BOUND } from './world';

/** Physical habitats, not campaign stages. Existence does not imply a visit. */
export const LOCATION_KINDS = ['microhabitat', 'reef', 'coast'] as const;
export type LocationKind = typeof LOCATION_KINDS[number];
export interface PlanetLocation { id: string; kind: LocationKind; worldSlot: WorldStage; }
interface HomePlanetIdentity { id: string; locations: PlanetLocation[]; currentLocationId: string; }
export type HomePlanet = HomePlanetIdentity & ({ version: 1 } | { version: 2; geography: import('./planet-geography').GeographyRecipe } | { version: 3; geography: import('./planet-geography').GeographyRecipe; navigation: import('./planet-travel').PlanetNavigation });
/** SP-009 cities own this address; position is LOCAL to the referenced habitat. */
export interface LocationAddress { planetId: string; locationId: string; position: Vec3; }
export const HOME_PLANET_NAME = 'Lumavora';
export const LOCATION_NAMES: Record<LocationKind, string> = {
  microhabitat: 'Mikrosvět', reef: 'Útesové mělčiny', coast: 'Dešťové pobřeží',
};
export const locationId = (planetId: string, slot: WorldStage): string => `${planetId}:${LOCATION_KINDS[slot]}`;

/** Updates references only. Never constructs, moves or copies world entities. */
export function syncHomePlanet(s: GameState): void {
  const planet = s.homePlanet;
  if (!planet) return;
  for (const slot of [0, 1, 2] as const) {
    if (s.worlds[slot] && !planet.locations.some(location => location.worldSlot === slot)) {
      planet.locations.push({ id: locationId(planet.id, slot), kind: LOCATION_KINDS[slot], worldSlot: slot });
    }
  }
  if (planet.version !== 3 || !planet.navigation.fields.some(f => f.id === planet.currentLocationId)) planet.currentLocationId = locationId(planet.id, worldStageFor(s.stage));
}

/** Called on UI birth/load/import, before an imported storage slot gets a new ID.
 * Original slot ID is a deterministic migration namespace, never a live link.
 * Pure historical constructors/parser remain compatible with pre-extension data. */
export function enableHomePlanet(s: GameState, birth = false): void {
  const activate = (state: GameState, id: string, provenance: 'birth' | 'legacy-assigned') => {
    if (!state.homePlanet) {
      state.homePlanet = { version: 1, id, locations: [], currentLocationId: '' };
      syncHomePlanet(state);
    }
    // Explicit v1 -> v2 migration; preserve identity, registry and all local data.
    if (state.homePlanet.version === 1) state.homePlanet = { ...state.homePlanet, version: 2,
      geography: { generator: 1, seed: state.seed, provenance } };
  };
  activate(s, `home-${s.id}`, birth ? 'birth' : 'legacy-assigned');
  if (s.checkpoint) {
    const checkpoint = JSON.parse(s.checkpoint) as GameState;
    if (!checkpoint.homePlanet || checkpoint.homePlanet.version === 1) {
      activate(checkpoint, s.homePlanet!.id, s.homePlanet!.version !== 1 ? s.homePlanet!.geography.provenance : 'legacy-assigned');
      s.checkpoint = JSON.stringify(checkpoint);
    }
  }
}

export function currentLocation(s: GameState): PlanetLocation | import('./planet-travel').FieldLocation | null {
  return s.homePlanet?.locations.find(location => location.id === s.homePlanet!.currentLocationId) ?? (s.homePlanet?.version === 3 ? s.homePlanet.navigation.fields.find(f => f.id === s.homePlanet!.currentLocationId) : null) ?? null;
}

function validPosition(position: Vec3): boolean {
  return !!position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
    && Math.abs(position.x) <= WORLD_BOUND && Math.abs(position.z) <= WORLD_BOUND && Math.abs(position.y) <= 1024;
}

/** Resolves any stored habitat independently of the scene, camera and active era.
 * The world is the authoritative mutable world; the returned position is a copy.
 * This validates an address, not buildability/land ownership (SP-009's concern). */
export function resolveLocationAddress(s: GameState, address: LocationAddress): { planet: HomePlanet; location: PlanetLocation | import('./planet-travel').FieldLocation; world: World; position: Vec3 } | null {
  const planet = s.homePlanet;
  if (!planet || address.planetId !== planet.id || !validPosition(address.position)) return null;
  const location = planet.locations.find(location => location.id === address.locationId) ?? (planet.version === 3 ? planet.navigation.fields.find(f => f.id === address.locationId) : null);
  const world = location && (location.kind === 'field' ? location.world : s.worlds[location.worldSlot]);
  return location && world ? { planet, location, world, position: { ...address.position } } : null;
}

export function locationAddress(s: GameState, position: Vec3, id = s.homePlanet?.currentLocationId): LocationAddress | null {
  if (!s.homePlanet || !id) return null;
  const address = { planetId: s.homePlanet.id, locationId: id, position: { ...position } };
  return resolveLocationAddress(s, address) ? address : null;
}

export function locationArrival(s: GameState): string | null {
  const location = currentLocation(s);
  return location ? `${HOME_PLANET_NAME} · ${location.kind === 'field' ? `Lokalita ${location.cellId}` : LOCATION_NAMES[location.kind]}.` : null;
}
