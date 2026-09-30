import { ecologyTaxon } from './ecology-catalog';
import { buildNpcDesigns, type GenomeSpecies, type NpcDesign } from './npc-genome';
import { speciesById } from './content';
import { computeStats } from './genome';
import { organismGroundClearance } from './anatomy';
import type { CreatureCreation } from './creature-library';
import type { ForeignPlanet, LifeRole, SpaceExpedition, SpaceLife } from './space-expedition-types';
import type { StarSystem } from './galaxy';
import type { FoodKind } from './types';

export const LIFE_PROFILES: readonly { key: string; role: LifeRole; label: string }[] = [
  { key: 'culture:7', role: 'small-plant', label: 'Malá rostlina' },
  { key: 'culture:8', role: 'medium-plant', label: 'Střední rostlina' },
  { key: 'culture:6', role: 'large-plant', label: 'Velká rostlina' },
  { key: 'species:bell', role: 'herbivore-a', label: 'Býložravec · zvonkonoš' },
  { key: 'species:gnaw', role: 'herbivore-b', label: 'Býložravec · žrout' },
  { key: 'species:crest', role: 'predator', label: 'Predátor' },
];
export const lifeProfile = (key: string) => LIFE_PROFILES.find(profile => profile.key === key) ?? null;
export const foreignGround = (seed: number, x: number, z: number) => .35 * Math.sin(x * .09 + seed % 17) * Math.cos(z * .11);
export function createForeignPlanet(system: StarSystem, library: CreatureCreation[] = []): ForeignPlanet {
  if (system.index === 0) throw new Error('Domov se nevytváří znovu.');
  const planet: ForeignPlanet = { id: system.planetId, systemId: system.id, generator: 1, seed: system.seed,
    temperature: system.temperature, atmosphere: system.atmosphere, elapsed: 0,
    designs: buildNpcDesigns(library, system.seed), life: [] };
  if (system.living) for (let i = 0; i < 36; i++) {
    const x = (i % 6 - 2.5) * 6, z = (Math.floor(i / 6) - 2.5) * 6;
    planet.life.push({ id: `${planet.id}:life-${i + 1}`, originPlanetId: planet.id, taxonKey: LIFE_PROFILES[i % 6].key,
      pos: { x, y: foreignGround(system.seed, x, z), z }, heading: (i % 6 - 2.5) * .8, health: 100, nutrition: 1 });
  }
  return planet;
}
/** Always resolves the saved origin model, even after transport to a different world. */
const speciesCache = new WeakMap<NpcDesign, GenomeSpecies>();
export function spaceLifeSpecies(expedition: SpaceExpedition, life: SpaceLife): GenomeSpecies | null {
  const taxon = ecologyTaxon(life.taxonKey); if (!taxon?.species) return null;
  const design = expedition.worlds.find(world => world.id === life.originPlanetId)?.designs.find(d => d.species === taxon.species);
  if (!design) return null;
  const saved = speciesCache.get(design); if (saved) return saved;
  const base = speciesById(taxon.species), genome = design.creation.genome, stats = computeStats(genome);
  const species: GenomeSpecies = { ...base, genome, name: genome.name, size: 1, diet: stats.diet as FoodKind[],
    creationId: design.creation.id, libraryOrigin: design.source === 'library', clearance: organismGroundClearance(genome) };
  speciesCache.set(design, species); return species;
}
export function lifeName(expedition: SpaceExpedition, life: SpaceLife): string {
  return spaceLifeSpecies(expedition, life)?.name ?? ecologyTaxon(life.taxonKey)?.name ?? life.taxonKey;
}

export function foreignLifeLabel(life: Pick<SpaceLife, 'id' | 'originPlanetId'>): string {
  const suffix = life.id.slice(life.originPlanetId.length + 1);
  return suffix.startsWith('born-') ? `odnož ${suffix.split('-').at(-1)}` : `exemplář #${suffix.slice(5)}`;
}
