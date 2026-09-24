import type { GameState } from './types';
import type { HomePlanet, LocationAddress } from './home-planet';
import { locationAddress, resolveLocationAddress } from './home-planet';
import { groundHeight } from './random';

/** Generator 1 is a persisted data contract. Never change its output in place. */
export interface GeographyRecipe { generator: 1; seed: number; provenance: 'birth' | 'legacy-assigned'; }
export interface GeographicPoint { longitude: number; latitude: number; altitudeMeters: number; }
export interface GeographicAddress { planetId: string; point: GeographicPoint; }
export const ATLAS_COLUMNS = 72, ATLAS_ROWS = 36, DEGREES_PER_CELL = 5;
export const PLANET_CIRCUMFERENCE_METERS = 36000;
export const PLANET_RADIUS_METERS = PLANET_CIRCUMFERENCE_METERS / (2 * Math.PI);
export const BIOMES = ['ocean', 'shelf', 'rainforest', 'grassland', 'desert', 'tundra', 'mountain'] as const;
export type GeographicBiome = typeof BIOMES[number];
export interface AtlasCell {
  readonly id: number; readonly longitude: number; readonly latitude: number;
  readonly elevationMeters: number; readonly surface: 'land' | 'water'; readonly biome: GeographicBiome;
  /** Static geographic baseline, unrelated to local PlanetState climate/T-score. */
  readonly temperatureC: number; readonly moisture: number; readonly regionId: string;
}
export interface HabitatAnchor extends GeographicPoint { readonly cellId: number; readonly metersPerUnit: number; }
export interface PlanetAtlas {
  readonly cells: readonly AtlasCell[];
  readonly anchors: readonly [Readonly<HabitatAnchor>, Readonly<HabitatAnchor>, Readonly<HabitatAnchor>];
  readonly regions: readonly { readonly id: string; readonly surface: 'land' | 'water'; readonly cellCount: number }[];
}
const cache = new Map<number, PlanetAtlas>(); // At most eight recipes; no worlds or campaign references.
const wrap = (n: number, size: number) => ((n % size) + size) % size;
export const wrapLongitude = (longitude: number): number => wrap(longitude + 180, 360) - 180;
function noise(seed: number, n: number): number {
  let h = Math.imul(seed ^ n, 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Four shared-edge neighbours. The longitude seam wraps; poles have no extra row. */
export function atlasNeighbours(id: number): number[] {
  if (!Number.isInteger(id) || id < 0 || id >= ATLAS_COLUMNS * ATLAS_ROWS) return [];
  const row = Math.floor(id / ATLAS_COLUMNS), column = id % ATLAS_COLUMNS;
  return [row * ATLAS_COLUMNS + wrap(column - 1, ATLAS_COLUMNS), row * ATLAS_COLUMNS + wrap(column + 1, ATLAS_COLUMNS),
    ...(row > 0 ? [id - ATLAS_COLUMNS] : []), ...(row < ATLAS_ROWS - 1 ? [id + ATLAS_COLUMNS] : [])];
}
export function validGeographicPoint(p: GeographicPoint): boolean {
  return !!p && Number.isFinite(p.longitude) && p.longitude >= -180 && p.longitude < 180
    && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90
    && Number.isFinite(p.altitudeMeters) && Math.abs(p.altitudeMeters) <= 20000;
}
/** Piecewise constant regional raster; deliberately not a local collision terrain. */
export function geographicCell(atlas: PlanetAtlas, point: GeographicPoint): AtlasCell | null {
  if (!validGeographicPoint(point)) return null;
  const column = Math.min(ATLAS_COLUMNS - 1, Math.floor((point.longitude + 180) / DEGREES_PER_CELL));
  const row = Math.min(ATLAS_ROWS - 1, Math.floor((90 - point.latitude) / DEGREES_PER_CELL));
  return atlas.cells[row * ATLAS_COLUMNS + column];
}

export function planetAtlas(planet: HomePlanet): PlanetAtlas | null {
  if (planet.version !== 2) return null;
  const seed = planet.geography.seed;
  const existing = cache.get(seed);
  if (existing) return existing;
  // Three continental lobes (neighbouring lobes can join). Raster values use
  // integer/hash or basic floating point, independent of simulation RNG and time.
  const continents = [0, 1, 2].map(i => ({
    longitude: -120 + i * 120 + noise(seed, 10 + i) * 30 - 15,
    latitude: noise(seed, 20 + i) * 70 - 35,
    width: 32 + noise(seed, 30 + i) * 14, height: 29 + noise(seed, 40 + i) * 22,
  }));
  const cells = Array.from({ length: ATLAS_COLUMNS * ATLAS_ROWS }, (_, id) => {
    const longitude = -177.5 + (id % ATLAS_COLUMNS) * 5, latitude = 87.5 - Math.floor(id / ATLAS_COLUMNS) * 5;
    let field = -4;
    for (const continent of continents) {
      const dx = wrapLongitude(longitude - continent.longitude) / continent.width, dy = (latitude - continent.latitude) / continent.height;
      field = Math.max(field, 1 - dx * dx - dy * dy);
    }
    const elevationMeters = Math.max(-2400, Math.round(field * 1100 + (noise(seed, id + 100) - .5) * 180));
    const temperatureC = Math.round(29 - Math.abs(latitude) * .65 - Math.max(0, elevationMeters) * .006);
    const moisture = Math.round(noise(seed, id + 9000) * 100);
    const surface = elevationMeters > 0 ? 'land' as const : 'water' as const;
    const biome: GeographicBiome = surface === 'water' ? (elevationMeters > -240 ? 'shelf' : 'ocean')
      : elevationMeters > 850 ? 'mountain' : temperatureC < 4 ? 'tundra' : moisture < 28 ? 'desert' : moisture > 60 && temperatureC > 15 ? 'rainforest' : 'grassland';
    return { id, longitude, latitude, elevationMeters, surface, biome, temperatureC, moisture, regionId: '' };
  });
  // Reserve a warm western shore for the authored habitats. This is generated
  // placement, never evidence that any location was visited or discovered.
  const coast = cells.filter(c => c.surface === 'land' && Math.abs(c.latitude) <= 32.5
    && cells[Math.floor(c.id / ATLAS_COLUMNS) * ATLAS_COLUMNS + wrap(c.id % ATLAS_COLUMNS - 1, ATLAS_COLUMNS)].surface === 'water')
    .sort((a, b) => noise(seed, a.id + 19000) - noise(seed, b.id + 19000) || a.id - b.id)[0];
  if (!coast) throw new Error('Generator 1 has no coastal habitat anchor.');
  const reef = cells[Math.floor(coast.id / ATLAS_COLUMNS) * ATLAS_COLUMNS + wrap(coast.id % ATLAS_COLUMNS - 1, ATLAS_COLUMNS)];
  Object.assign(coast, { elevationMeters: 12, biome: 'rainforest', temperatureC: 24, moisture: 80 });
  Object.assign(reef, { elevationMeters: -40, biome: 'shelf', temperatureC: 24, moisture: 100 });
  const regions: { id: string; surface: 'land' | 'water'; cellCount: number }[] = [];
  for (const start of cells) {
    if (start.regionId) continue;
    const id = `${start.surface === 'land' ? 'continent' : 'ocean'}-${start.id}`, queue = [start.id]; start.regionId = id;
    for (let i = 0; i < queue.length; i++) for (const next of atlasNeighbours(queue[i])) {
      if (!cells[next].regionId && cells[next].surface === start.surface) { cells[next].regionId = id; queue.push(next); }
    }
    regions.push(Object.freeze({ id, surface: start.surface, cellCount: queue.length }));
  }
  const anchor = (cell: AtlasCell, metersPerUnit: number, altitudeMeters: number, offset = 0) => Object.freeze({
    cellId: cell.id, longitude: wrapLongitude(cell.longitude + offset), latitude: cell.latitude + offset, altitudeMeters, metersPerUnit,
  });
  const atlas: PlanetAtlas = Object.freeze({ cells: Object.freeze(cells.map(c => Object.freeze(c))), regions: Object.freeze(regions),
    anchors: Object.freeze([anchor(reef, .001, -.1, -1.5), anchor(reef, .1, -3), anchor(coast, 1, 12)] as const) });
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(seed, atlas);
  return atlas;
}

export function locationGeography(s: GameState, id = s.homePlanet?.currentLocationId) {
  const planet = s.homePlanet, location = planet?.locations.find(l => l.id === id);
  const atlas = planet && planetAtlas(planet);
  if (!location || !atlas || !s.worlds[location.worldSlot]) return null;
  const anchor = atlas.anchors[location.worldSlot];
  return { location, anchor, cell: atlas.cells[anchor.cellId] };
}
/** Local chart: fixed cos(anchor latitude), no rotation; X east, Z south, Y up.
 * A is unchanged. This explicit conversion is the only bridge to global units. */
export function geographicAddress(s: GameState, address: LocationAddress): GeographicAddress | null {
  const resolved = resolveLocationAddress(s, address), binding = locationGeography(s, address.locationId);
  if (!resolved || !binding) return null;
  const a = binding.anchor, p = address.position, metersPerDegree = PLANET_CIRCUMFERENCE_METERS / 360;
  return { planetId: address.planetId, point: {
    longitude: wrapLongitude(a.longitude + p.x * a.metersPerUnit / (metersPerDegree * Math.cos(a.latitude * Math.PI / 180))),
    latitude: a.latitude - p.z * a.metersPerUnit / metersPerDegree,
    altitudeMeters: a.altitudeMeters + p.y * a.metersPerUnit,
  } };
}
/** Explicit habitat required: a geographic point alone never fabricates a World. */
export function localAddress(s: GameState, address: GeographicAddress, locationId: string): LocationAddress | null {
  if (address.planetId !== s.homePlanet?.id || !validGeographicPoint(address.point)) return null;
  const binding = locationGeography(s, locationId);
  if (!binding) return null;
  const a = binding.anchor, p = address.point, metersPerDegree = PLANET_CIRCUMFERENCE_METERS / 360;
  const position = {
    x: wrapLongitude(p.longitude - a.longitude) * metersPerDegree * Math.cos(a.latitude * Math.PI / 180) / a.metersPerUnit,
    y: (p.altitudeMeters - a.altitudeMeters) / a.metersPerUnit,
    z: (a.latitude - p.latitude) * metersPerDegree / a.metersPerUnit,
  };
  // Allow only numerical round-trip error at A's exact boundary, never a new range.
  for (const axis of ['x', 'y', 'z'] as const) {
    const bound = axis === 'y' ? 1024 : 78;
    if (Math.abs(Math.abs(position[axis]) - bound) < 1e-7) position[axis] = Math.sign(position[axis]) * bound;
  }
  return locationAddress(s, position, locationId);
}
/** Shared SP-009 query: exact original local terrain plus its coarse context.
 * It makes no claim of buildability, ownership, water depth or terraform success. */
export function addressGeography(s: GameState, address: LocationAddress) {
  const resolved = resolveLocationAddress(s, address), global = geographicAddress(s, address), binding = locationGeography(s, address.locationId);
  if (!resolved || !global || !binding) return null;
  const localGround = groundHeight(address.position.x, address.position.z, resolved.location.worldSlot);
  return { ...binding, address: global, world: resolved.world, localGround,
    groundAltitudeMeters: binding.anchor.altitudeMeters + localGround * binding.anchor.metersPerUnit };
}
