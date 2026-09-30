/** Generator 1: stable metadata only. Visited planet contents live in the save. */
export interface StarSystem {
  id: string; planetId: string; index: number; name: string; planetName: string;
  x: number; z: number; seed: number; color: string;
  temperature: number; atmosphere: number; living: boolean;
}
export const GALAXY_SYSTEMS = 32;
export const BASIC_JUMP_RANGE = 18;
const names = ['Lumavora', 'Jantarový háj', 'Žhavá slza', 'Mrazový dech', 'Tichý pyl', 'Měděná ulita', 'Modrý pramen', 'Stříbrná řasa', 'Šarlatový útes', 'Perlová mlha', 'Zelený zvon', 'Popelavý květ', 'Bílá tůň', 'Noční zahrada', 'Ohnivé hnízdo', 'Ledový list', 'Zlatá rosa', 'Rezavý hřbet', 'Mlžná koruna', 'Safírový mech', 'Mělké slunce', 'Dutý led', 'Kořen světla', 'Horký jantar', 'Tichá mušle', 'Spórový příliv', 'Rudý trn', 'Stínová studna', 'Poslední zahrada', 'Zlomený kruh', 'Práh jasu', 'Srdce světla'];
export function galaxySeed(text: string): number {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return seed >>> 0;
}
export function starSystems(homePlanetId: string): StarSystem[] {
  return names.map((name, index) => {
    const id = index === 0 ? `${homePlanetId}:system` : `${homePlanetId}:star-${index}`;
    const seed = galaxySeed(id), angle = index * .25, radius = 60 * (1 - index / (GALAXY_SYSTEMS - 1));
    const profile = index % 3;
    return { id, planetId: index === 0 ? homePlanetId : `${id}:planet`, index, name,
      planetName: index === 0 ? 'Lumavora' : `${name} · I`, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, seed,
      color: profile === 1 ? '#67a99a' : profile === 2 ? '#d48860' : '#91bdcf',
      temperature: profile === 1 ? 0 : profile === 2 ? .8 : -.75,
      atmosphere: profile === 1 ? 0 : profile === 2 ? -.7 : .8, living: index !== 0 && profile === 1 };
  });
}
export const systemDistance = (a: StarSystem, b: StarSystem) => Math.hypot(a.x - b.x, a.z - b.z);
export const jumpEnergy = (a: StarSystem, b: StarSystem) => 6 + Math.ceil(systemDistance(a, b) * .2);
export function systemById(homePlanetId: string, id: string): StarSystem | null {
  return starSystems(homePlanetId).find(system => system.id === id) ?? null;
}
export function planetSystem(homePlanetId: string, id: string): StarSystem | null {
  return starSystems(homePlanetId).find(system => system.planetId === id) ?? null;
}
